"""
EPOS Jobsheet Form API — mounted as an APIRouter on the referral app (main.py)
and served at /jobsheet on the same deployment.

Flow:
  1. Frontend searches HubSpot Deals as the user types  -> GET /api/search-deal
  2. Frontend fetches the full Deal + Contact + Company  -> GET /api/deal-details/{deal_id}
  3. Frontend submits the jobsheet, backend creates a HubSpot Ticket, associates it to the
     Deal / Contact / Company, then fires two best-effort notifications (DingTalk custom-bot +
     email)                                                -> POST /api/jobsheet

The jobsheet form creates HubSpot Tickets (not Deals) and uses its own HubSpot
Service Key, HUBSPOT_JOBSHEET_TOKEN, separate from the referral form's
HUBSPOT_ACCESS_TOKEN. HubSpot is the system of record; every submission is also
appended to a local jobsheets.json purely as a debugging aid — that file lives
on the container disk only (ephemeral) and must not be treated as a backup.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import smtplib
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

import httpx
from fpdf import FPDF
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("jobsheet")

# The jobsheet form's own HubSpot Service Key — separate from the referral
# form's HUBSPOT_ACCESS_TOKEN so the two keep independent scopes / blast radius.
HUBSPOT_JOBSHEET_TOKEN = os.getenv("HUBSPOT_JOBSHEET_TOKEN", "")
HUBSPOT_BASE_URL = "https://api.hubapi.com"

# Default HubSpot ticket pipeline/stage. HubSpot's built-in "Support Pipeline"
# is id "0" with stage "1" ("New") on a fresh portal - override via env once
# you know the real IDs for your portal (Settings -> Tickets -> Pipelines).
HUBSPOT_TICKET_PIPELINE_ID = os.getenv("HUBSPOT_TICKET_PIPELINE_ID", "0")
HUBSPOT_TICKET_STAGE_ID = os.getenv("HUBSPOT_TICKET_STAGE_ID", "1")

# Every jobsheet ticket defaults to this owner (flowchart: "Ticket Owner default set to
# Kean Chiow"). Confirmed via existing tickets he owns - the token lacks
# crm.objects.owners.read, so this can't be looked up by email at request time.
DEFAULT_TICKET_OWNER_ID = os.getenv("DEFAULT_TICKET_OWNER_ID", "164584880")

# DingTalk custom-bot webhook (flowchart: "DingTalk custome Bot posts notification to
# Sg Deployment Form submission Channel"). DINGTALK_SECRET is only needed if the bot was
# created with "Add Sign" security in DingTalk - leave blank otherwise.
DINGTALK_WEBHOOK_URL = os.getenv("DINGTALK_WEBHOOK_URL", "")
DINGTALK_SECRET = os.getenv("DINGTALK_SECRET", "")

# Email notification (flowchart: "Internal email notification sent to Kean Chiow on
# submission"), sent directly by this app via SMTP.
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "") or SMTP_USER
EMAIL_NOTIFY_TO = os.getenv("EMAIL_NOTIFY_TO", "")

SGT = timezone(timedelta(hours=8))  # Singapore has no DST, so a fixed offset is always correct

SEARCH_RESULT_LIMIT = 8
SUBMISSIONS_FILE = Path(__file__).parent / "jobsheets.json"

HARDWARE_LABELS = {
    "main_terminal": "Main Terminal",
    "customer_display": "Customer Display",
    "kiosk": "KIOSK (Android)",
    "keyboard_mouse": "Keyboard + Mouse (Logitech)",
    "receipt_printer": "Receipt Printer",
    "cash_drawer": "Cash Drawer",
    "barcode_printer": "Barcode Printer",
    "barcode_scanner": "Barcode Scanner",
    "stocktake_device": "Stocktake Device (Imin Swift 1)",
    "kitchen_printer": "Kitchen Printer",
    "kds": "KDS (Android)",
    "soundbox": "Soundbox",
    "weighing_scale": "Weighing Scale",
    "queue_display": "Queue Display",
    "ups": "UPS (Collinson)",
    "buzzers": "Buzzers*",
}

# --------------------------------------------------------------------------
# Form field -> HubSpot Ticket custom property mapping (confirmed against the
# EPOS portal's real property schema - see server/README notes). Multi-select
# fields are joined with ";" per HubSpot's enumeration property format; scalar
# fields are formatted per the property's live type via _format_value(). Any
# mapped property that doesn't exist on the portal is silently skipped rather
# than failing the request (see _get_ticket_property_defs / _format_value) -
# so if a new field is ever added here before its Ticket property is created,
# it'll just start working the moment the property exists, no code change
# needed. All properties referenced below are confirmed to exist as of
# 2026-08-26.
# --------------------------------------------------------------------------

FIELD_PROPERTY_MAP = {
    "salesperson": "salesperson_new",
    "shop_name": "shop_name",
    "uen_number": "uen_number",
    "client_name": "client_name",
    "client_contact_no": "client_contact_no_",
    "deployment_unit": "deployment_address_unit_new",
    "deployment_blk_st": "deployment_address__blk__amp__st_",
    "deployment_postal_code": "deployment_address__postal_code_",
    "preferred_deployment_date": "installation_date",
    "pos_package": "pos_package",
    "pos_package_other": "please_specify_other_pos_package",
    "main_invoice_no": "main_quotationinvoice_no",
    "whatsapp_group_chat": "whatsapp_group_chat",
    "years_free": "number_of_year_s__free",
    "subscription": "subscription",
    "subscription_other": "subscription_other",
    "payment_status": "payment_status",
    "payment_received": "payment_received",
    "business_type": "business_type",
    "business_type_other": "please_specify_other_business_type",
    "setup_type": "setup_type",
    "store_condition": "store_condition",
    "existing_setup": "existing_setup",
    "multiple_pos": "for_multiple_pos_at_same_outlet_",
    "backend_domain": "backend__xxx_eposdata_com_",
    "tax_rule": "tax_rule",
    "antom_cc_type": "antom_cc",
    "paynow_uob_docs": "integrated_paynow",
    "paynow_completion": "how_would_you_like_to_complete_the_payment",
    "nets_type": "nets",
    "header_text": "header_text",
    "footer_text": "footer_text",
    "epos_web_ordering_type": "epos_web_ordering_app",
    "accounting_platform": "accounting_platform_s_",
    "accounting_status": "accounting_platform_status",
    "accounting_when": "when_to_integrate_accounting_platform",
    "ecommerce_platform": "e_commerce_platform_s_",
    "ecommerce_status": "e_commerce_platform_status",
    "ecommerce_when": "when_to_integrate_e_commerce_platform",
    "other_integration_instructions": "other_integration_instructions",
    "usage_description": "please_fill_up_the_detailed_description_for_the_usage_requirements_below_",
    "other_hardware_instructions": "other_hardware_instructions",
    # multi-select (joined with ";")
    "special_payment_types": "special_payment_types",
    "integrations": "integration_s_",
    "delivery_platforms": "delivery_platform_s_",
    "additional_integrations": "additional_integration_s_",
    "requirements": "requirement_s_",
    "hardware_selected": "select_hardware",
}

MULTI_SELECT_FIELDS = {
    "special_payment_types", "integrations", "delivery_platforms",
    "additional_integrations", "requirements",
}

DELIVERY_STATUS_PROPERTY = {
    "GrabFood": ("grabfood_account_status", "when_to_integrate_grabfood"),
    "GrabMart": ("grabmart_account_status", "when_to_integrate_deliveroo"),
    "Foodpanda": ("foodpanda_account_status", "when_to_integrate_foodpanda"),
    "Lalamove": ("lalamove_account_status", "when_to_integrate_lalamove"),
}

HARDWARE_PROPERTY_MAP = {
    "main_terminal": {"number": "number_of_main_terminal_s", "hardware": "main_terminal_s__hardware", "package": "main_terminal_s__package"},
    "customer_display": {"number": "number_of_customer_display_s_", "hardware": "customer_display_hardware"},
    "kiosk": {"number": "number_of_kiosks", "hardware": "kiosk_hardware", "package": "kiosk_package"},
    "keyboard_mouse": {"number": "number_of_keyboard__mouses", "hardware": "keyboard___mouse_hardware", "package": "keyboard___mouse_package"},
    "receipt_printer": {"number": "number_of_receipt_printer_s_", "package": "receipt_printer_package", "thermal_roll_qty": "number_of_thermal_receipt_roll_s_"},
    "cash_drawer": {"number": "number_of_cash_drawer", "hardware": "cash_drawer_hardware", "package": "cash_drawer_package", "speakers": "speakers__used_for_umart_cash_drawer_"},
    "barcode_printer": {"number": "number_of_barcode_printer", "hardware": "barcode_printer_hardware", "package": "barcode_printer_package", "sticker_roll": "bixolon_barcode_sticker_rolls"},
    "barcode_scanner": {"number": "number_of_barcode_scanner_s_", "hardware": "barcode_scanner_hardware", "package": "barcode_scanner_package"},
    "stocktake_device": {"number": "number_of_stocktake_device_s_", "package": "stocktake_device_package"},
    "kitchen_printer": {"number": "number_of_kitchen_printer_s_", "package": "kitchen_printer_package", "thermal_roll_qty_kitchen": "number_of_thermal_receipt_roll_s___kitchen_"},
    "kds": {"number": "number_of_kds", "package": "kds_package"},
    "soundbox": {"number": "number_of_soundbox", "package": "soundbox_package"},
    "weighing_scale": {"number": "number_of_weighing_scale_s_", "hardware": "weighing_scale_hardware", "package": "weighing_scale_package", "weighing_sticker_roll_qty": "number_of_barcoded_weighing_scale_sticker_roll_s_"},
    "queue_display": {"number": "number_of_queue_display_s_", "package": "queue_display_package"},
    "ups": {"number": "number_of_ups", "package": "ups_package"},
    "buzzers": {"number": "number_of_buzzer_s_", "package": "buzzers_package"},
}

router = APIRouter(tags=["jobsheet"])

# One shared httpx client, reused across every outbound call (HubSpot, DingTalk)
# instead of opening a fresh connection (full TLS handshake) per request - matters
# most for deal_details, which fires ~5 sequential HubSpot calls per Deal selected.
# Created lazily on first use (this module is an APIRouter, not the app, so it has
# no startup hook of its own) and never explicitly closed - it lives for the life
# of the process and httpx/OS reclaim it on exit.
_http_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=10.0)
    return _http_client


# --------------------------------------------------------------------------
# HubSpot client helpers
# --------------------------------------------------------------------------

def _hs_headers() -> dict:
    if not HUBSPOT_JOBSHEET_TOKEN:
        raise HTTPException(status_code=500, detail="HUBSPOT_JOBSHEET_TOKEN is not configured on the server")
    return {
        "Authorization": f"Bearer {HUBSPOT_JOBSHEET_TOKEN}",
        "Content-Type": "application/json",
    }


async def hs_request(method: str, path: str, **kwargs) -> dict:
    url = f"{HUBSPOT_BASE_URL}{path}"
    resp = await _get_client().request(method, url, headers=_hs_headers(), **kwargs)
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="HubSpot rate limit hit, try again shortly")
    if resp.status_code >= 400:
        log.error("[HubSpot] %s %s -> %s %s", method, path, resp.status_code, resp.text[:500])
        raise HTTPException(status_code=502, detail=f"HubSpot API error ({resp.status_code}): {resp.text[:300]}")
    return resp.json() if resp.text else {}


def clean_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    digits = "".join(c for c in phone if c.isdigit() or c == "+")
    return digits


# --------------------------------------------------------------------------
# GET /api/search-deal?q=...
# ( "/" and "/health" are owned by the referral app — main.py — not this router )
# --------------------------------------------------------------------------

@router.get("/api/search-deal")
async def search_deal(q: str = ""):
    q = q.strip()
    if len(q) < 2:
        return {"results": []}

    body = {
        "filterGroups": [
            {
                "filters": [
                    {"propertyName": "dealname", "operator": "CONTAINS_TOKEN", "value": q}
                ]
            }
        ],
        "properties": ["dealname", "amount", "dealstage", "pipeline", "closedate"],
        "limit": SEARCH_RESULT_LIMIT,
        "sorts": [{"propertyName": "hs_lastmodifieddate", "direction": "DESCENDING"}],
    }
    data = await hs_request("POST", "/crm/v3/objects/deals/search", json=body)

    results = []
    for item in data.get("results", []):
        props = item.get("properties", {})
        results.append(
            {
                "id": item.get("id"),
                "dealname": props.get("dealname") or "(no name)",
                "dealstage": await _deal_stage_label(props.get("pipeline"), props.get("dealstage")),
                "amount": props.get("amount"),
            }
        )
    return {"results": results}


# --------------------------------------------------------------------------
# GET /api/deal-details/{deal_id}
# --------------------------------------------------------------------------

_deal_stage_labels_cache: dict = {}
_deal_stage_labels_cached_at: float = 0.0
DEAL_STAGE_CACHE_TTL_SECONDS = 300


async def _get_deal_stage_labels() -> dict:
    """{pipeline_id: {stage_id: label}} for every deal pipeline, cached for a few minutes
    so displaying a human-readable Payment Status doesn't cost an API call per deal."""
    global _deal_stage_labels_cache, _deal_stage_labels_cached_at
    if _deal_stage_labels_cache and (time.time() - _deal_stage_labels_cached_at) < DEAL_STAGE_CACHE_TTL_SECONDS:
        return _deal_stage_labels_cache
    try:
        data = await hs_request("GET", "/crm/v3/pipelines/deals")
        labels = {
            p["id"]: {s["id"]: s["label"] for s in p.get("stages", [])}
            for p in data.get("results", [])
        }
        _deal_stage_labels_cache = labels
        _deal_stage_labels_cached_at = time.time()
        return labels
    except HTTPException as exc:
        log.warning("[HubSpot] deal pipelines lookup failed: %s", exc.detail)
        return _deal_stage_labels_cache


async def _deal_stage_label(pipeline_id: Optional[str], stage_id: Optional[str]) -> str:
    if not stage_id:
        return ""
    labels = await _get_deal_stage_labels()
    return labels.get(pipeline_id, {}).get(stage_id, stage_id)


_ticket_property_defs_cache: dict = {}
_ticket_property_defs_cached_at: float = 0.0
TICKET_PROPERTY_CACHE_TTL_SECONDS = 300


async def _get_ticket_property_defs() -> dict:
    """{property_name: {"type", "fieldType", "options": {label: value}}} for every Ticket
    property, cached for a few minutes. Enumeration properties on this portal use random
    internal `value`s that don't match their display label, so every enum write has to go
    through this live lookup rather than a hardcoded label->value table."""
    global _ticket_property_defs_cache, _ticket_property_defs_cached_at
    if _ticket_property_defs_cache and (time.time() - _ticket_property_defs_cached_at) < TICKET_PROPERTY_CACHE_TTL_SECONDS:
        return _ticket_property_defs_cache
    try:
        data = await hs_request("GET", "/crm/v3/properties/tickets")
        defs = {
            p["name"]: {
                "type": p.get("type"),
                "fieldType": p.get("fieldType"),
                "options": {o["label"]: o["value"] for o in p.get("options", [])},
            }
            for p in data.get("results", [])
        }
        _ticket_property_defs_cache = defs
        _ticket_property_defs_cached_at = time.time()
        return defs
    except HTTPException as exc:
        log.warning("[HubSpot] ticket properties lookup failed: %s", exc.detail)
        return _ticket_property_defs_cache


def _to_hubspot_date_ms(iso_date: str) -> Optional[int]:
    """HubSpot date properties expect midnight UTC as a millisecond timestamp."""
    try:
        y, m, d = (int(part) for part in iso_date.split("-"))
        return int(datetime(y, m, d, tzinfo=timezone.utc).timestamp() * 1000)
    except (ValueError, AttributeError):
        return None


def _format_date_ddmmyyyy(iso_date: Optional[str]) -> str:
    """The form sends dates as ISO (YYYY-MM-DD) - PDF/DingTalk/email display them as
    DD-MM-YYYY instead."""
    if not iso_date:
        return ""
    try:
        y, m, d = iso_date.split("-")
        return f"{d}-{m}-{y}"
    except ValueError:
        return iso_date


def _format_value(defs: dict, prop_name: str, value) -> Optional[str]:
    """Format a single scalar value for a Ticket property based on its live type -
    boolean checkboxes become "true"/omitted, dates become ms timestamps, enum
    properties are translated from their display label to HubSpot's internal value,
    everything else is sent as a plain string."""
    if value is None or value == "":
        return None
    d = defs.get(prop_name)
    if d is None:
        return None  # property doesn't exist on this portal (yet) - skip, don't fail the request
    if d["type"] == "bool":
        return "true" if value else None
    if d["type"] == "date":
        return _to_hubspot_date_ms(str(value))
    if d["options"]:
        v = d["options"].get(str(value))
        if v is None:
            log.warning("[HubSpot] unknown option %r for property %s", value, prop_name)
        return v
    return str(value)


def _format_multi_value(defs: dict, prop_name: str, values: list) -> Optional[str]:
    if not values:
        return None
    d = defs.get(prop_name)
    if d is None:
        return None
    mapped = []
    for v in values:
        mv = d["options"].get(str(v))
        if mv:
            mapped.append(mv)
        else:
            log.warning("[HubSpot] unknown option %r for property %s", v, prop_name)
    return ";".join(mapped) if mapped else None


async def _fetch_deal_owner_name(owner_id: Optional[str]) -> str:
    if not owner_id:
        return ""
    try:
        owner = await hs_request("GET", f"/crm/v3/owners/{owner_id}")
        return " ".join(filter(None, [owner.get("firstName"), owner.get("lastName")])).strip()
    except HTTPException as exc:
        log.warning("[HubSpot] owner lookup failed for %s: %s", owner_id, exc.detail)
        return ""


async def _fetch_company_extra(company_id: Optional[str]) -> dict:
    """Best-effort read of Company properties confirmed against the EPOS portal's real
    property schema: `outlet_name` is this portal's "Shop Name", `uen_number` matches
    directly, and `registered_address__unit_` / `registered_address__blk___st_` /
    `registered_address__postal_code_` are this portal's own Registered Address fields
    (used so the frontend can offer "same as registered address" for the deployment
    address). ("Business Type" comes from the Contact's `industry` property instead -
    see deal_details - not from Company.)"""
    if not company_id:
        return {}
    try:
        data = await hs_request(
            "GET",
            f"/crm/v3/objects/companies/{company_id}",
            params={
                "properties": "outlet_name,uen_number,registered_address__unit_,"
                "registered_address__blk___st_,registered_address__postal_code_"
            },
        )
        props = data.get("properties", {})
        return {
            "shop_name": props.get("outlet_name") or "",
            "uen_number": props.get("uen_number") or "",
            "registered_unit": props.get("registered_address__unit_") or "",
            "registered_blk_st": props.get("registered_address__blk___st_") or "",
            "registered_postal_code": props.get("registered_address__postal_code_") or "",
        }
    except HTTPException as exc:
        log.warning("[HubSpot] company extra properties lookup failed for %s: %s", company_id, exc.detail)
        return {}


@router.get("/api/deal-details/{deal_id}")
async def deal_details(deal_id: str):
    deal_data = await hs_request(
        "GET",
        f"/crm/v3/objects/deals/{deal_id}",
        params={
            "associations": "contacts,companies",
            "properties": "dealname,amount,dealstage,pipeline,closedate,hubspot_owner_id",
        },
    )
    deal_props = deal_data.get("properties", {})
    owner_name = await _fetch_deal_owner_name(deal_props.get("hubspot_owner_id"))
    stage_label = await _deal_stage_label(deal_props.get("pipeline"), deal_props.get("dealstage"))
    deal = {
        "id": deal_data.get("id"),
        "dealname": deal_props.get("dealname"),
        "amount": deal_props.get("amount"),
        "dealstage": stage_label,
        "pipeline": deal_props.get("pipeline"),
        "owner_name": owner_name,
    }

    contact = {}
    contact_ids = deal_data.get("associations", {}).get("contacts", {}).get("results", [])
    if contact_ids:
        c = await hs_request(
            "GET",
            f"/crm/v3/objects/contacts/{contact_ids[0]['id']}",
            params={"properties": "firstname,lastname,phone,email,jobtitle,industry"},
        )
        cp = c.get("properties", {})
        contact = {
            "id": c.get("id"),
            "first_name": cp.get("firstname") or "",
            "last_name": cp.get("lastname") or "",
            "phone": cp.get("phone") or "",
            "email": cp.get("email") or "",
            "designation": cp.get("jobtitle") or "",
            "business_type": cp.get("industry") or "",
        }

    company = {}
    company_ids = deal_data.get("associations", {}).get("companies", {}).get("results", [])
    if company_ids:
        company_id = company_ids[0]["id"]
        co = await hs_request(
            "GET",
            f"/crm/v3/objects/companies/{company_id}",
            params={"properties": "name,domain,phone"},
        )
        cop = co.get("properties", {})
        company = {
            "id": co.get("id"),
            "name": cop.get("name") or "",
            "domain": cop.get("domain") or "",
            "phone": cop.get("phone") or "",
        }
        company.update(await _fetch_company_extra(company_id))

    return {"deal": deal, "contact": contact, "company": company}


# --------------------------------------------------------------------------
# POST /api/jobsheet
# --------------------------------------------------------------------------

class HardwareDetail(BaseModel):
    model_config = ConfigDict(extra="allow")
    number: Optional[str] = None
    hardware: Optional[str] = None
    package: Optional[str] = None


class DeliveryDetail(BaseModel):
    status: Optional[str] = None
    when: Optional[str] = None


class JobsheetForm(BaseModel):
    # Locked / auto-filled from the selected Deal (or filled manually if the
    # user could not find a matching Deal in HubSpot)
    deal_id: Optional[str] = None
    deal_name: str = Field(..., min_length=1)
    company_id: Optional[str] = None
    company_name: Optional[str] = ""
    contact_id: Optional[str] = None
    contact_name: Optional[str] = ""
    contact_phone: Optional[str] = ""

    # Deployment details
    salesperson: str = Field(..., min_length=1)
    shop_name: str = Field(..., min_length=1)
    uen_number: str = Field(..., min_length=1)
    client_name: str = Field(..., min_length=1)
    client_contact_no: str = Field(..., min_length=1)
    deployment_unit: str = Field(..., min_length=1)
    deployment_blk_st: str = Field(..., min_length=1)
    deployment_postal_code: str = Field(..., min_length=1)
    preferred_deployment_date: Optional[str] = None

    # Commercial
    pos_package: Optional[str] = ""
    pos_package_other: Optional[str] = ""
    main_invoice_no: str = Field(..., min_length=1)
    whatsapp_group_chat: str = Field(..., min_length=1)
    years_free: str = Field(..., min_length=1)
    subscription: str = Field(..., min_length=1)
    subscription_other: Optional[str] = ""
    payment_status: str = Field(..., min_length=1)
    payment_received: str = Field(..., min_length=1)
    business_type: str = Field(..., min_length=1)
    business_type_other: Optional[str] = ""

    # Store setup
    setup_type: str = Field(..., min_length=1)          # "New" / "Existing"
    store_condition: str = Field(..., min_length=1)     # "New Store" / "Existing Store"
    existing_setup: Optional[str] = ""                  # required only when setup_type == "Existing"
    multiple_pos: Optional[str] = ""
    backend_domain: Optional[str] = ""
    tax_rule: str = Field(..., min_length=1)
    special_payment_types: list[str] = []
    antom_cc_type: Optional[str] = ""
    paynow_uob_docs: Optional[str] = ""
    paynow_completion: Optional[str] = ""
    nets_type: Optional[str] = ""

    # Branding
    logo_filename: Optional[str] = ""
    logo_data_url: Optional[str] = ""
    header_text: Optional[str] = ""
    footer_text: Optional[str] = ""

    # Integrations
    integrations: list[str] = []
    epos_web_ordering_type: Optional[str] = ""
    accounting_platform: Optional[str] = ""
    accounting_status: Optional[str] = ""
    accounting_when: Optional[str] = ""
    ecommerce_platform: Optional[str] = ""
    ecommerce_status: Optional[str] = ""
    ecommerce_when: Optional[str] = ""
    delivery_platforms: list[str] = []
    delivery_details: dict[str, DeliveryDetail] = {}
    additional_integrations: list[str] = []
    other_integration_instructions: Optional[str] = ""

    # Requirements
    requirements: list[str] = []
    usage_description: Optional[str] = ""

    # Hardware
    hardware_selected: list[str] = []
    hardware_details: dict[str, HardwareDetail] = {}
    other_hardware_instructions: Optional[str] = ""

    @model_validator(mode="after")
    def _clear_hidden_conditionals(self):
        """A conditional sub-field the user filled and then hid (by changing its
        trigger) keeps its value in the frontend form state and would otherwise
        still be written to HubSpot / the PDF. Clear anything whose trigger is not
        currently met so every downstream consumer sees a consistent form."""
        if self.pos_package != "Others":
            self.pos_package_other = ""
        if self.subscription != "Other":
            self.subscription_other = ""
        if self.business_type != "Other":
            self.business_type_other = ""
        if self.setup_type != "Existing":
            self.existing_setup = ""

        spt = set(self.special_payment_types)
        if "Antom cc" not in spt:
            self.antom_cc_type = ""
        if "Integrated PayNow" not in spt:
            self.paynow_uob_docs = ""
            self.paynow_completion = ""
        if "NETS" not in spt:
            self.nets_type = ""

        integ = set(self.integrations)
        if "Epos Web Ordering App" not in integ:
            self.epos_web_ordering_type = ""
        if "Accounting Integration" not in integ:
            self.accounting_platform = self.accounting_status = self.accounting_when = ""
        if "E-commerce Integration" not in integ:
            self.ecommerce_platform = self.ecommerce_status = self.ecommerce_when = ""
        if "Delivery" not in integ:
            self.delivery_platforms = []
        self.delivery_details = {k: v for k, v in self.delivery_details.items() if k in self.delivery_platforms}
        self.hardware_details = {k: v for k, v in self.hardware_details.items() if k in self.hardware_selected}
        return self


async def build_ticket_properties(form: JobsheetForm, logo_url: Optional[str]) -> dict:
    """Every mapped field, translated into the exact HubSpot Ticket properties confirmed
    against this portal's schema (see FIELD_PROPERTY_MAP and friends above). Unknown/
    pending properties and unmapped fields (e.g. Company Email, which only lives on the
    Contact) are silently skipped rather than failing the whole ticket creation."""
    defs = await _get_ticket_property_defs()
    props: dict = {}

    def put(prop_name: Optional[str], value):
        if not prop_name:
            return
        formatted = _format_value(defs, prop_name, value)
        if formatted is not None:
            props[prop_name] = formatted

    def put_multi(prop_name: Optional[str], values):
        if not prop_name:
            return
        formatted = _format_multi_value(defs, prop_name, values or [])
        if formatted is not None:
            props[prop_name] = formatted

    for field_key, prop_name in FIELD_PROPERTY_MAP.items():
        if field_key == "hardware_selected":
            continue  # needs label translation first, handled below
        if field_key in MULTI_SELECT_FIELDS:
            put_multi(prop_name, getattr(form, field_key, None))
        else:
            put(prop_name, getattr(form, field_key, None))

    for platform, (status_prop, when_prop) in DELIVERY_STATUS_PROPERTY.items():
        if platform not in form.delivery_platforms:
            continue  # stale leftover from a platform the user unselected - ignore
        detail = form.delivery_details.get(platform)
        if detail:
            put(status_prop, detail.status)
            put(when_prop, detail.when)

    for hw_key, prop_map in HARDWARE_PROPERTY_MAP.items():
        if hw_key not in form.hardware_selected:
            continue  # stale leftover from an item the user unselected - ignore
        detail = form.hardware_details.get(hw_key)
        if not detail:
            continue
        put(prop_map.get("number"), detail.number)
        put(prop_map.get("hardware"), detail.hardware)
        put(prop_map.get("package"), detail.package)
        for extra_key, extra_val in (detail.model_extra or {}).items():
            put(prop_map.get(extra_key), extra_val)

    put_multi(FIELD_PROPERTY_MAP["hardware_selected"], [HARDWARE_LABELS.get(k, k) for k in form.hardware_selected])
    put("client_s_store_logo", logo_url)

    return props


async def _upload_file_to_hubspot(filename: str, raw: bytes, content_type: str, folder: str) -> Optional[dict]:
    """Returns {"id": ..., "url": ...} on success, or None."""
    try:
        files = {"file": (filename, raw, content_type)}
        data = {
            "options": json.dumps({"access": "PUBLIC_NOT_INDEXABLE", "overwrite": True}),
            "folderPath": folder,
        }
        resp = await _get_client().post(
            f"{HUBSPOT_BASE_URL}/files/v3/files",
            headers={"Authorization": f"Bearer {HUBSPOT_JOBSHEET_TOKEN}"},
            data=data,
            files=files,
            timeout=15.0,
        )
        if resp.status_code >= 400:
            log.warning("[HubSpot] file upload failed: %s %s", resp.status_code, resp.text[:300])
            return None
        body = resp.json()
        return {"id": body.get("id"), "url": body.get("url")}
    except Exception as exc:  # noqa: BLE001 - best-effort, must never break ticket creation
        log.warning("[HubSpot] file upload error: %s", exc)
        return None


async def _upload_logo_to_hubspot(filename: str, data_url: str) -> Optional[str]:
    try:
        header, b64data = data_url.split(",", 1)
        raw = base64.b64decode(b64data)
        content_type = header.split(";")[0].replace("data:", "") or "application/octet-stream"
    except Exception as exc:  # noqa: BLE001 - best-effort, must never break ticket creation
        log.warning("[HubSpot] logo decode error: %s", exc)
        return None
    uploaded = await _upload_file_to_hubspot(filename or "logo.png", raw, content_type, "/jobsheet-logos")
    return uploaded["url"] if uploaded else None


async def _attach_pdf_note_to_ticket(ticket_id: str, pdf_file_id: str, label: str) -> None:
    """Attaches the jobsheet PDF to the ticket as a Note, so it's visible directly on the
    ticket's activity timeline instead of only living in HubSpot's File Manager."""
    try:
        note = await hs_request(
            "POST",
            "/crm/v3/objects/notes",
            json={
                "properties": {
                    "hs_note_body": f"Jobsheet PDF - {label}",
                    "hs_timestamp": str(int(time.time() * 1000)),
                    "hs_attachment_ids": pdf_file_id,
                }
            },
        )
        note_id = note["id"]
        await hs_request("PUT", f"/crm/v4/objects/notes/{note_id}/associations/default/tickets/{ticket_id}")
    except HTTPException as exc:
        log.warning("[HubSpot] jobsheet PDF note attach failed: %s", exc.detail)


# --------------------------------------------------------------------------
# Jobsheet PDF (attached to email, linked from the DingTalk message)
# --------------------------------------------------------------------------

_PDF_NAVY = (24, 42, 110)
_PDF_MUTED = (100, 105, 130)
_PDF_TEXT = (30, 30, 40)
_PDF_BORDER = (225, 228, 238)


def _pdf_safe(value) -> str:
    """The PDF core font only supports latin-1 - degrade non-latin-1 characters
    (e.g. CJK, emoji) to '?' rather than crashing PDF generation."""
    return str(value).encode("latin-1", "replace").decode("latin-1")


def _pdf_section(pdf: FPDF, title: str) -> None:
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*_PDF_NAVY)
    pdf.cell(0, 8, _pdf_safe(title), ln=1)
    pdf.set_draw_color(*_PDF_BORDER)
    pdf.set_line_width(0.3)
    y = pdf.get_y()
    pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
    pdf.ln(3)


def _pdf_field(pdf: FPDF, label: str, value) -> None:
    if value in (None, "", []):
        return
    label_width = 58
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*_PDF_MUTED)
    pdf.cell(label_width, 6, _pdf_safe(label))
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*_PDF_TEXT)
    pdf.set_x(pdf.l_margin + label_width)
    value_width = pdf.w - pdf.r_margin - (pdf.l_margin + label_width)
    pdf.multi_cell(value_width, 6, _pdf_safe(value), new_x="LMARGIN", new_y="NEXT")


def build_jobsheet_pdf(form: JobsheetForm, ticket_id: str, hubspot_url: str) -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # Logo | divider | title block, mirroring the web form's header layout
    top_y = 12
    logo_h, logo_w = 20, 35  # matches the logo asset's ~1.775:1 aspect ratio
    logo_path = Path(__file__).parent / "assets" / "epos-logo.png"
    if logo_path.exists():
        pdf.image(str(logo_path), x=pdf.l_margin, y=top_y, h=logo_h)
    divider_x = pdf.l_margin + logo_w + 6
    pdf.set_draw_color(*_PDF_BORDER)
    pdf.set_line_width(0.4)
    pdf.line(divider_x, top_y, divider_x, top_y + logo_h)

    title_x = divider_x + 6
    pdf.set_xy(title_x, top_y + 2)
    pdf.set_font("Helvetica", "B", 19)
    pdf.set_text_color(*_PDF_NAVY)
    pdf.cell(0, 8, "EPOS Jobsheet")
    pdf.set_xy(title_x, top_y + 11)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*_PDF_MUTED)
    pdf.cell(0, 6, "Deployment Jobsheet Summary")

    pdf.set_xy(pdf.l_margin, top_y + logo_h + 6)
    content_width = pdf.w - pdf.l_margin - pdf.r_margin
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*_PDF_MUTED)
    pdf.cell(content_width / 2, 6, _pdf_safe(f"Ticket #{ticket_id}"), align="L")
    pdf.cell(content_width / 2, 6, _pdf_safe(f"Submitted: {datetime.now(SGT).strftime('%d-%m-%Y %H:%M')} SGT"), align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.set_text_color(*_PDF_NAVY)
    pdf.cell(0, 6, _pdf_safe(hubspot_url), new_x="LMARGIN", new_y="NEXT", link=hubspot_url)

    pdf.set_draw_color(*_PDF_BORDER)
    pdf.set_line_width(0.3)
    y = pdf.get_y() + 2
    pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
    pdf.set_y(y + 4)

    _pdf_section(pdf, "Deal / Company / Contact")
    _pdf_field(pdf, "Deal", f"{form.deal_name} ({form.deal_id or 'manual entry'})")
    _pdf_field(pdf, "Company", form.company_name)
    _pdf_field(pdf, "Contact", f"{form.contact_name} ({form.contact_phone})" if form.contact_name else "")

    _pdf_section(pdf, "Deployment details")
    _pdf_field(pdf, "Salesperson", form.salesperson)
    _pdf_field(pdf, "Shop Name", form.shop_name)
    _pdf_field(pdf, "UEN Number", form.uen_number)
    _pdf_field(pdf, "Client Name", form.client_name)
    _pdf_field(pdf, "Client Contact No.", form.client_contact_no)
    _pdf_field(pdf, "Deployment Address", f"{form.deployment_unit}, {form.deployment_blk_st}, {form.deployment_postal_code}")
    _pdf_field(pdf, "Preferred Deployment Date", _format_date_ddmmyyyy(form.preferred_deployment_date))

    _pdf_section(pdf, "Commercial")
    pos_package = form.pos_package_other if form.pos_package == "Others" else form.pos_package
    subscription = form.subscription_other if form.subscription == "Other" else form.subscription
    business_type = form.business_type_other if form.business_type == "Other" else form.business_type
    _pdf_field(pdf, "POS Package", pos_package)
    _pdf_field(pdf, "Main Quotation/Invoice No.", form.main_invoice_no)
    _pdf_field(pdf, "WhatsApp Group Chat", form.whatsapp_group_chat)
    _pdf_field(pdf, "Number of Year(s) Free", form.years_free)
    _pdf_field(pdf, "Subscription", subscription)
    _pdf_field(pdf, "Deal Stage", form.payment_status)
    _pdf_field(pdf, "Payment Received", form.payment_received)
    _pdf_field(pdf, "Business Type", business_type)

    _pdf_section(pdf, "Store setup")
    _pdf_field(pdf, "Setup Type", form.setup_type)
    _pdf_field(pdf, "Existing Setup", form.existing_setup)
    _pdf_field(pdf, "Store Condition", form.store_condition)
    _pdf_field(pdf, "Multiple POS at Same Outlet", form.multiple_pos)
    _pdf_field(pdf, "Backend", form.backend_domain and f"{form.backend_domain}.eposdata.com")
    _pdf_field(pdf, "Tax Rule", form.tax_rule)
    _pdf_field(pdf, "Special Payment Types", ", ".join(form.special_payment_types))
    if "Antom cc" in form.special_payment_types:
        _pdf_field(pdf, "  Antom CC", form.antom_cc_type)
    if "Integrated PayNow" in form.special_payment_types:
        _pdf_field(pdf, "  Integrated PayNow", form.paynow_uob_docs)
        _pdf_field(pdf, "  Payment completion", form.paynow_completion)
    if "NETS" in form.special_payment_types:
        _pdf_field(pdf, "  NETS", form.nets_type)

    _pdf_section(pdf, "Branding")
    _pdf_field(pdf, "Header text", form.header_text)
    _pdf_field(pdf, "Footer text", form.footer_text)
    _pdf_field(pdf, "Store Logo", "Uploaded" if form.logo_filename else "")

    _pdf_section(pdf, "Integrations")
    _pdf_field(pdf, "Integration(s)", ", ".join(form.integrations))
    if "Epos Web Ordering App" in form.integrations:
        _pdf_field(pdf, "  Epos Web Ordering App", form.epos_web_ordering_type)
    if "Accounting Integration" in form.integrations:
        _pdf_field(pdf, "  Accounting Platform", form.accounting_platform)
        _pdf_field(pdf, "  Accounting Platform Status", form.accounting_status)
        _pdf_field(pdf, "  When to Integrate Accounting", form.accounting_when)
    if "E-commerce Integration" in form.integrations:
        _pdf_field(pdf, "  E-commerce Platform", form.ecommerce_platform)
        _pdf_field(pdf, "  E-commerce Platform Status", form.ecommerce_status)
        _pdf_field(pdf, "  When to Integrate E-commerce", form.ecommerce_when)
    if "Delivery" in form.integrations:
        _pdf_field(pdf, "  Delivery Platform(s)", ", ".join(form.delivery_platforms))
        for platform in form.delivery_platforms:
            detail = form.delivery_details.get(platform, DeliveryDetail())
            _pdf_field(pdf, f"    {platform} Account Status", detail.status)
            _pdf_field(pdf, f"    When to Integrate {platform}", detail.when)
    _pdf_field(pdf, "Additional Integration(s)", ", ".join(form.additional_integrations))
    _pdf_field(pdf, "Other Integration Instructions", form.other_integration_instructions)

    _pdf_section(pdf, "Requirements")
    _pdf_field(pdf, "Requirement(s)", ", ".join(form.requirements))
    _pdf_field(pdf, "Usage description", form.usage_description)

    _pdf_section(pdf, "Hardware")
    for hw_key in form.hardware_selected:
        label = HARDWARE_LABELS.get(hw_key, hw_key.replace("_", " ").title())
        detail = form.hardware_details.get(hw_key, HardwareDetail())
        parts = [f"Number={detail.number or '-'}"]
        if detail.hardware:
            parts.append(f"Hardware={detail.hardware}")
        if detail.package:
            parts.append(f"Package={detail.package}")
        for extra_key, extra_val in (detail.model_extra or {}).items():
            if extra_val not in (None, "", False):
                parts.append(f"{extra_key.replace('_', ' ').title()}={extra_val}")
        _pdf_field(pdf, label, ", ".join(parts))
    _pdf_field(pdf, "Other Hardware Instructions", form.other_hardware_instructions)

    return bytes(pdf.output())


async def push_jobsheet_to_hubspot(form: JobsheetForm) -> dict:
    logo_url = None
    if form.logo_data_url:
        logo_url = await _upload_logo_to_hubspot(form.logo_filename, form.logo_data_url)

    subject = (form.company_name or form.deal_name).strip()
    mapped_props = await build_ticket_properties(form, logo_url)
    ticket_props = {
        "subject": subject[:255],
        "hs_pipeline": HUBSPOT_TICKET_PIPELINE_ID,
        "hs_pipeline_stage": HUBSPOT_TICKET_STAGE_ID,
        "hubspot_owner_id": DEFAULT_TICKET_OWNER_ID,
        **mapped_props,
    }
    ticket = await hs_request("POST", "/crm/v3/objects/tickets", json={"properties": ticket_props})
    ticket_id = ticket["id"]
    hubspot_url = ticket.get("url") or f"https://app.hubspot.com/contacts/tickets/{ticket_id}"

    # Best-effort associations, fired in parallel - a failure here should not block
    # ticket creation.
    async def _assoc(to_type: str, to_id: str) -> None:
        try:
            await hs_request(
                "PUT",
                f"/crm/v4/objects/tickets/{ticket_id}/associations/default/{to_type}/{to_id}",
            )
        except HTTPException as exc:
            log.warning("[HubSpot] association ticket->%s(%s) failed: %s", to_type, to_id, exc.detail)

    await asyncio.gather(*(
        _assoc(to_type, to_id)
        for to_type, to_id in (("deals", form.deal_id), ("contacts", form.contact_id), ("companies", form.company_id))
        if to_id
    ))

    pdf_url = None
    pdf_bytes = None
    try:
        pdf_bytes = build_jobsheet_pdf(form, ticket_id, hubspot_url)
        uploaded = await _upload_file_to_hubspot(f"jobsheet-{ticket_id}.pdf", pdf_bytes, "application/pdf", "/jobsheet-pdfs")
        if uploaded:
            pdf_url = uploaded["url"]
            await _attach_pdf_note_to_ticket(ticket_id, uploaded["id"], subject)
    except Exception as exc:  # noqa: BLE001 - the PDF is a nice-to-have, must never break ticket creation
        log.warning("[PDF] jobsheet PDF generation/upload failed: %s", exc)

    # "_pdf_bytes" is popped by the caller before the result is returned to the client or
    # written to jobsheets.json - it's only here so send_email_notification can reuse the
    # already-built PDF instead of generating it a second time.
    return {"ticket_id": ticket_id, "hubspot_url": hubspot_url, "pdf_url": pdf_url, "_pdf_bytes": pdf_bytes}


def save_local_fallback(form: JobsheetForm, result: dict) -> None:
    record = {
        "submitted_at": datetime.now(SGT).isoformat(),
        **form.model_dump(),
        **result,
    }
    existing = []
    if SUBMISSIONS_FILE.exists():
        try:
            existing = json.loads(SUBMISSIONS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            existing = []
    existing.append(record)
    SUBMISSIONS_FILE.write_text(json.dumps(existing, indent=2))


# --------------------------------------------------------------------------
# Notifications (best-effort, fired after a Ticket has been created)
# --------------------------------------------------------------------------

def _notification_fields(form: JobsheetForm) -> list[tuple[str, str]]:
    hw_summary = ", ".join(HARDWARE_LABELS.get(k, k) for k in form.hardware_selected) or "-"
    subscription = form.subscription_other if form.subscription == "Other" else form.subscription
    return [
        ("Salesperson", form.salesperson),
        ("Company", form.company_name or form.deal_name),
        ("Shop", form.shop_name),
        ("Deployment Address", f"{form.deployment_unit}, {form.deployment_blk_st}, {form.deployment_postal_code}"),
        ("Preferred Deployment Date", _format_date_ddmmyyyy(form.preferred_deployment_date) or "-"),
        ("Subscription", subscription),
        ("Hardware", hw_summary),
    ]


def _notification_summary_plain(ticket_id: str, hubspot_url: str, form: JobsheetForm) -> str:
    """Plain-text version for the email notification."""
    lines = [f"New EPOS Jobsheet submitted - Ticket #{ticket_id}"]
    lines += [f"{label}: {value}" for label, value in _notification_fields(form)]
    lines.append(f"HubSpot ticket: {hubspot_url}")
    return "\n".join(lines)


def _notification_summary_markdown(ticket_id: str, hubspot_url: str, form: JobsheetForm, pdf_url: Optional[str] = None) -> str:
    """Markdown version for the DingTalk custom-bot message. DingTalk's markdown renderer
    collapses a single "\\n" into the same paragraph (same as standard markdown) - every
    line needs a blank line ("\\n\\n") after it to actually render on its own line."""
    blocks = [
        f"#### New EPOS Jobsheet Form — Ticket #{ticket_id}",
        "---",
    ]
    blocks += [f"**{label}:** {value}" for label, value in _notification_fields(form)]
    blocks.append("---")
    blocks.append(f"[Open ticket in HubSpot »]({hubspot_url})")
    if pdf_url:
        blocks.append(f"[Download Jobsheet PDF »]({pdf_url})")
    return "\n\n".join(blocks)


def _dingtalk_signed_url(base_url: str) -> str:
    if not DINGTALK_SECRET:
        return base_url
    timestamp = str(round(time.time() * 1000))
    string_to_sign = f"{timestamp}\n{DINGTALK_SECRET}".encode("utf-8")
    hmac_code = hmac.new(DINGTALK_SECRET.encode("utf-8"), string_to_sign, digestmod=hashlib.sha256).digest()
    sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
    sep = "&" if "?" in base_url else "?"
    return f"{base_url}{sep}timestamp={timestamp}&sign={sign}"


async def send_dingtalk_notification(ticket_id: str, hubspot_url: str, form: JobsheetForm, pdf_url: Optional[str] = None) -> None:
    if not DINGTALK_WEBHOOK_URL:
        log.info("[DingTalk] DINGTALK_WEBHOOK_URL not configured, skipping notification")
        return
    text = _notification_summary_markdown(ticket_id, hubspot_url, form, pdf_url)
    payload = {"msgtype": "markdown", "markdown": {"title": "New EPOS Jobsheet Form", "text": text}}
    # One retry — the DingTalk endpoint occasionally has a transient DNS/connect
    # blip; a best-effort notification shouldn't be lost to a one-off hiccup.
    for attempt in (1, 2):
        try:
            resp = await _get_client().post(_dingtalk_signed_url(DINGTALK_WEBHOOK_URL), json=payload)
            body = resp.json() if resp.text else {}
            if resp.status_code >= 400 or body.get("errcode", 0) != 0:
                log.warning("[DingTalk] notify failed: %s %s", resp.status_code, resp.text[:300])
            return
        except Exception as exc:  # noqa: BLE001 - notification must never break submission
            log.warning("[DingTalk] notify error (attempt %d): %s", attempt, exc)
            if attempt == 1:
                await asyncio.sleep(1.5)


def send_email_notification(ticket_id: str, hubspot_url: str, form: JobsheetForm, pdf_bytes: Optional[bytes] = None) -> None:
    recipients = [addr.strip() for addr in EMAIL_NOTIFY_TO.split(",") if addr.strip()]
    if not SMTP_HOST or not recipients:
        log.info("[Email] SMTP_HOST/EMAIL_NOTIFY_TO not configured, skipping notification")
        return
    msg = MIMEMultipart()
    msg.attach(MIMEText(_notification_summary_plain(ticket_id, hubspot_url, form), "plain", "utf-8"))
    msg["Subject"] = f"New EPOS Jobsheet: {form.company_name or form.deal_name}"
    msg["From"] = EMAIL_FROM
    msg["To"] = ", ".join(recipients)
    try:
        if pdf_bytes is None:  # only regenerate if the caller didn't already build one
            pdf_bytes = build_jobsheet_pdf(form, ticket_id, hubspot_url)
        attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
        attachment.add_header("Content-Disposition", "attachment", filename=f"jobsheet-{ticket_id}.pdf")
        msg.attach(attachment)
    except Exception as exc:  # noqa: BLE001 - the PDF is a nice-to-have, must never break the email
        log.warning("[Email] jobsheet PDF attachment failed: %s", exc)
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            smtp.starttls()
            if SMTP_USER:
                smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.sendmail(EMAIL_FROM, recipients, msg.as_string())
    except Exception as exc:  # noqa: BLE001 - notification must never break submission
        log.warning("[Email] notify error: %s", exc)


@router.post("/api/jobsheet")
async def submit_jobsheet(form: JobsheetForm, background_tasks: BackgroundTasks):
    result = await push_jobsheet_to_hubspot(form)
    pdf_bytes = result.pop("_pdf_bytes", None)  # not JSON-serializable - keep out of the response/debug log

    try:
        save_local_fallback(form, result)
    except OSError as exc:
        log.warning("[local] could not write jobsheets.json: %s", exc)

    # Notifications are best-effort and involve slow external calls (DingTalk
    # webhook, SMTP) - run them after the response so submit returns as soon as
    # the HubSpot Ticket exists.
    background_tasks.add_task(
        send_dingtalk_notification, result["ticket_id"], result["hubspot_url"], form, result.get("pdf_url")
    )
    background_tasks.add_task(
        send_email_notification, result["ticket_id"], result["hubspot_url"], form, pdf_bytes
    )

    return {"status": "success", **result}
