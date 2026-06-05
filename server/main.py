from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from zoneinfo import ZoneInfo
import httpx
import json
import os
import psycopg2
import psycopg2.pool
import psycopg2.extras

# ── PostgreSQL (PolarDB / Alibaba Cloud) ─────────────────────
PG_HOST     = os.getenv("PG_HOST")
PG_PORT     = os.getenv("PG_PORT", "5432")
PG_DB       = os.getenv("PG_DB")
PG_USER     = os.getenv("PG_USER")
PG_PASSWORD = os.getenv("PG_PASSWORD")
PG_SSL_MODE     = os.getenv("PG_SSL_MODE", "require")   # PolarDB enforces SSL
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

db_pool = None
if all([PG_HOST, PG_DB, PG_USER, PG_PASSWORD]):
    db_pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=2,
        maxconn=10,
        host=PG_HOST,
        port=int(PG_PORT),
        dbname=PG_DB,
        user=PG_USER,
        password=PG_PASSWORD,
        sslmode=PG_SSL_MODE,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )

def get_conn():
    return db_pool.getconn() if db_pool else None

def release_conn(conn):
    if db_pool and conn:
        db_pool.putconn(conn)


def db_save_referral(data: dict):
    """Persist a main referral submission to referrals."""
    conn = get_conn()
    if not conn:
        print("[DB] No connection — referral not persisted")
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO referrals (
                    submitted_at, referral_type, source,
                    company_name, company_referred_from, company_referral,
                    first_name, last_name, phone, designation,
                    project_manager, products, additional_notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                datetime.now(SGT),
                data.get("referral_type"),
                data.get("source"),
                data.get("company_name"),
                data.get("company_referred_from"),
                data.get("company_referral"),
                data.get("first_name"),
                data.get("last_name"),
                data.get("phone"),
                data.get("designation"),
                data.get("project_manager"),
                data.get("products"),
                data.get("additional_notes"),
            ))
        conn.commit()
    except Exception as e:
        print(f"[DB] Save error (referral): {e}")
        conn.rollback()
    finally:
        release_conn(conn)

def db_save_interteam(data: dict):
    """Persist an inter-team referral submission to internals."""
    conn = get_conn()
    if not conn:
        print("[DB] No connection — interteam referral not persisted")
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO internals (
                    submitted_at, referral_type, source,
                    company_name, first_name, last_name,
                    phone, designation, antding_staff_id,
                    products, additional_notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                datetime.now(SGT),
                data.get("referral_type"),
                data.get("source"),
                data.get("company_name"),
                data.get("first_name"),
                data.get("last_name"),
                data.get("phone"),
                data.get("designation"),
                data.get("antding_staff_id"),
                data.get("products"),
                data.get("additional_notes"),
            ))
        conn.commit()
    except Exception as e:
        print(f"[DB] Save error (interteam): {e}")
        conn.rollback()
    finally:
        release_conn(conn)

app = FastAPI(title="EPOS Referral API")

# ── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── HubSpot setup ────────────────────────────────────────────
HUBSPOT_TOKEN  = os.environ.get("HUBSPOT_ACCESS_TOKEN")
HUBSPOT_BASE   = "https://api.hubapi.com"
HS_PIPELINE_ID        = "2054237899"
HS_STAGE_OUTBOUND     = "3550815980"  # Outbound Lead (For BDs) — OWN, BCRS, MERCHANT
HS_STAGE_NEW_INBOUND  = "3517045447"  # New Inbound — INTERNAL, MA
HS_REINIE              = "1802264607"  # Reinie Lim
HS_EMELINE             = "27297405"   # EPOS SALES (Emeline)
HS_CASS                = "325434270"  # Cassandra Chua

HS_HEADERS = {
    "Authorization": f"Bearer {HUBSPOT_TOKEN}",
    "Content-Type": "application/json",
}

# ── PM → HubSpot Owner ID mapping ───────────────────────────
PM_OWNER_MAP = {
    "Alvin Seah":      "161621502",
    "Andy Chia":       "218061175",
    "Arvinder Singh":  "81514542",
    "Brandon Leong":   "326921814",
    "Belle Phia":      "162289152",
    "Crystal Lee":     "253502246",
    "Dominic Chan":    "57274755",
    "Fenny Wong":      "53224564",
    "Glenn Wee":       "37676685",
    "Hadi Sng":        "61019637",
    "Harold Lim":      "344217702",
    "Julie Chan":      "29349349",
    "Tasha Goh":       "81330493",
    "Mervin Cai":      "83765548",
    "Rachel Tai":      "163983329",
    "Ruth Han":        "16431507",
    "Winston Heng":    "83762739",
    "Zack Gaffar":     "488014670",
}

# ── Deal source mapping ──────────────────────────────────────
DEAL_SOURCE_MAP = {
    "INTERNAL": "Internal Referral",
    "MA":       "Internal Referral",
    "MERCHANT": "Merchant Referral",
    "OWN":      "BD (Outbound)",
    "BCRS":     "BD (Outbound)",
}

# ── Contact source mapping ───────────────────────────────────
CONTACT_SOURCE_MAP = {
    "INTERNAL": "Internal Referral",
    "MA":       "Referral MA",
    "MERCHANT": "Referral",
    "OWN":      "Sales' own Referral",
    "BCRS":     "Sales' own Referral",
}

SGT = ZoneInfo("Asia/Singapore")

def now_sgt():
    return datetime.now(SGT).strftime("%Y-%m-%d %H:%M:%S")

def get_owner_id(pm_name: str) -> str:
    return PM_OWNER_MAP.get(pm_name, HS_REINIE)

def build_deal_name(company_name: str, referral_type: str) -> str:
    return f"{title_case(company_name)} [{referral_type.upper()}]"

# ── HubSpot helpers ──────────────────────────────────────────

def clean_phone(phone: str) -> str:
    if not phone:
        return ""
    phone = phone.strip()
    if phone.startswith("+"):
        return "+" + "".join(c for c in phone[1:] if c.isdigit())
    return "".join(c for c in phone if c.isdigit())

PRESERVE_UPPER = {"MA", "BCRS", "OWN", "PTE", "LTD", "LLP", "SDN", "BHD"}

def title_case(value: str) -> str:
    if not value:
        return ""
    words = value.strip().split()
    result = []
    for word in words:
        upper_word = word.upper()
        if upper_word in PRESERVE_UPPER:
            result.append(upper_word)
        else:
            result.append(word.capitalize())
    return " ".join(result)

async def hs_create_contact(
    first_name: str,
    last_name: str,
    phone: str,
    designation: str,
    referral_type: str,
    owner_id: str,
    products: str = "",
) -> str:
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{HUBSPOT_BASE}/crm/v3/objects/contacts",
            headers=HS_HEADERS,
            json={
                "properties": {
                    "firstname":         title_case(first_name),
                    "lastname":          title_case(last_name),
                    "phone":             clean_phone(phone),
                    "jobtitle":          title_case(designation),
                    "pic_1_designation": title_case(designation),
                    "source":            CONTACT_SOURCE_MAP.get(referral_type, ""),
                    "hubspot_owner_id":  owner_id,
                    "productsservices":  products,
                }
            }
        )
        if not res.is_success:
            raise Exception(f"HubSpot contact error {res.status_code}: {res.text}")
        return res.json()["id"]

async def hs_create_company(
    company_name: str,
    company_referred_from: str,
    owner_id: str,
) -> str:
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{HUBSPOT_BASE}/crm/v3/objects/companies",
            headers=HS_HEADERS,
            json={
                "properties": {
                    "name":                                title_case(company_name),
                    "company_name__acra_registered_name_": title_case(company_name),
                    "referrer":                            title_case(company_referred_from),
                    "hubspot_owner_id":                    owner_id,
                }
            }
        )
        if not res.is_success:
            raise Exception(f"HubSpot company error {res.status_code}: {res.text}")
        return res.json()["id"]

async def hs_create_deal(
    deal_name: str,
    referral_type: str,
    owner_id: str,
    antding_staff_id: str = "",
) -> str:
    stage_id = HS_STAGE_NEW_INBOUND if referral_type in ("INTERNAL", "MA") else HS_STAGE_OUTBOUND
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{HUBSPOT_BASE}/crm/v3/objects/deals",
            headers=HS_HEADERS,
            json={
                "properties": {
                    "dealname":         deal_name,
                    "pipeline":         HS_PIPELINE_ID,
                    "dealstage":        stage_id,
                    "deal_source":      DEAL_SOURCE_MAP.get(referral_type, ""),
                    "hubspot_owner_id": owner_id,
                    "antding_job_id":   antding_staff_id,
                }
            }
        )
        if not res.is_success:
            raise Exception(f"HubSpot deal error {res.status_code}: {res.text}")
        return res.json()["id"]

async def hs_create_note(contact_id: str, note_body: str) -> None:
    if not note_body or not note_body.strip():
        return
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{HUBSPOT_BASE}/crm/v3/objects/notes",
            headers=HS_HEADERS,
            json={
                "properties": {
                    "hs_note_body": note_body,
                    "hs_timestamp": str(int(datetime.now(SGT).timestamp() * 1000)),
                },
                "associations": [
                    {
                        "to": {"id": contact_id},
                        "types": [
                            {
                                "associationCategory": "HUBSPOT_DEFINED",
                                "associationTypeId": 202,
                            }
                        ],
                    }
                ],
            }
        )
        if not res.is_success:
            print(f"HubSpot note warning {res.status_code}: {res.text}")

async def hs_associate(from_id: str, from_type: str, to_id: str, to_type: str, assoc_type: int):
    async with httpx.AsyncClient() as client:
        await client.put(
            f"{HUBSPOT_BASE}/crm/v3/objects/{from_type}/{from_id}/associations/{to_type}/{to_id}/{assoc_type}",
            headers=HS_HEADERS,
        )

async def push_to_hubspot(
    company_name: str,
    company_referred_from: str,
    first_name: str,
    last_name: str,
    phone: str,
    designation: str,
    referral_type: str,
    pm_name: str = "",
    antding_staff_id: str = "",
    products: str = "",
    additional_notes: str = "",
):
    if referral_type in ("OWN", "BCRS", "MERCHANT"):
        contact_owner = get_owner_id(pm_name)
        deal_owner    = get_owner_id(pm_name)
        company_owner = get_owner_id(pm_name)
    elif referral_type == "INTERNAL":
        contact_owner = HS_REINIE
        deal_owner    = HS_REINIE
        company_owner = HS_EMELINE
    elif referral_type == "MA":
        contact_owner = HS_REINIE
        deal_owner    = HS_CASS
        company_owner = HS_EMELINE
    else:
        contact_owner = HS_REINIE
        deal_owner    = HS_REINIE
        company_owner = HS_EMELINE

    deal_name  = build_deal_name(company_name, referral_type)

    contact_id = await hs_create_contact(
        first_name, last_name, phone, designation, referral_type, contact_owner, products
    )
    company_id = await hs_create_company(
        company_name, company_referred_from, company_owner
    )
    deal_id    = await hs_create_deal(
        deal_name, referral_type, deal_owner, antding_staff_id
    )

    if additional_notes:
        await hs_create_note(contact_id, additional_notes)

    await hs_associate(deal_id, "deals", contact_id, "contacts", 3)
    await hs_associate(deal_id, "deals", company_id, "companies", 5)
    await hs_associate(contact_id, "contacts", company_id, "companies", 1)

    return {"contact_id": contact_id, "company_id": company_id, "deal_id": deal_id}

# ── Pydantic models ───────────────────────────────────────────
class InterTeamReferral(BaseModel):
    referral_type: str
    source: str
    company_name: str
    first_name: str
    last_name: str = ""
    phone: str
    designation: str = ""
    antding_staff_id: str
    products: str = ""
    additional_notes: str = ""

class MainReferral(BaseModel):
    referral_type: str
    source: str
    company_name: str = ""
    company_referred_from: str = ""
    company_referral: str = ""
    first_name: str
    last_name: str = ""
    phone: str = ""
    designation: str = ""
    project_manager: str
    products: str = ""
    additional_notes: str = ""

# ── Local JSON fallback (belt-and-suspenders, ephemeral) ──────
STORAGE_FILE = "submissions.json"

def save_submission(entry: dict):
    try:
        submissions = []
        if os.path.exists(STORAGE_FILE):
            with open(STORAGE_FILE, "r") as f:
                submissions = json.load(f)
        submissions.append(entry)
        with open(STORAGE_FILE, "w") as f:
            json.dump(submissions, f, indent=2)
    except Exception as e:
        print(f"[JSON] Local save error: {e}")

# ── Health check ─────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "EPOS Referral API is running"}

@app.get("/health")
def health():
    """Used by Docker healthcheck and docker-compose depends_on."""
    conn = get_conn()
    if not conn:
        return {"status": "ok", "db": "no_pool"}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "degraded", "db": str(e)}
    finally:
        release_conn(conn)

# ── Main Referral endpoint ────────────────────────────────────
@app.post("/api/referral")
async def submit_referral(data: MainReferral, background_tasks: BackgroundTasks):
    payload = data.model_dump()
    save_submission({"submitted_at": now_sgt(), "form_type": "referral", "data": payload})
    db_save_referral(payload)

    if data.referral_type == "MERCHANT":
        deal_company          = data.company_referral
        company_referred_from = data.company_referred_from
    else:
        deal_company          = data.company_name
        company_referred_from = ""

    background_tasks.add_task(
        push_to_hubspot,
        company_name          = deal_company,
        company_referred_from = company_referred_from,
        first_name            = data.first_name,
        last_name             = data.last_name,
        phone                 = data.phone,
        designation           = data.designation,
        referral_type         = data.referral_type,
        pm_name               = data.project_manager,
        products              = data.products,
        additional_notes      = data.additional_notes,
    )

    return {"success": True, "message": "Referral submitted successfully."}

# ── Inter-Team Referral endpoint ──────────────────────────────
@app.post("/api/interteam-referral")
async def submit_interteam_referral(data: InterTeamReferral, background_tasks: BackgroundTasks):
    payload = data.model_dump()
    save_submission({"submitted_at": now_sgt(), "form_type": "interteam", "data": payload})
    db_save_interteam(payload)

    background_tasks.add_task(
        push_to_hubspot,
        company_name          = data.company_name,
        company_referred_from = "",
        first_name            = data.first_name,
        last_name             = data.last_name,
        phone                 = data.phone,
        designation           = data.designation,
        referral_type         = data.referral_type,
        antding_staff_id      = data.antding_staff_id,
        products              = data.products,
        additional_notes      = data.additional_notes,
    )

    return {"status": "success"}

