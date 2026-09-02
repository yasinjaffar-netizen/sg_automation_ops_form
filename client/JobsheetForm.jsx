import { useEffect, useRef, useState } from "react";
import { searchDeal, getDealDetails, submitJobsheet } from "./api.js";
import eposLogo from "./assets/epos-logo.png";
import "./jobsheet.css";
import {
  SALESPEOPLE,
  POS_PACKAGE_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  PAYMENT_RECEIVED_OPTIONS,
  WHATSAPP_GROUP_OPTIONS,
  SUBSCRIPTION_OPTIONS,
  SETUP_TYPE_OPTIONS,
  STORE_CONDITION_OPTIONS,
  EXISTING_SETUP_OPTIONS,
  MULTI_POS_OPTIONS,
  TAX_RULE_OPTIONS,
  SPECIAL_PAYMENT_OPTIONS,
  ANTOM_CC_OPTIONS,
  PAYNOW_DOC_OPTIONS,
  PAYNOW_COMPLETION_OPTIONS,
  NETS_OPTIONS,
  INTEGRATION_OPTIONS,
  EPOS_WEB_ORDERING_OPTIONS,
  ACCOUNTING_PLATFORM_OPTIONS,
  ECOMMERCE_PLATFORM_OPTIONS,
  ACCOUNT_STATUS_OPTIONS,
  WHEN_TO_INTEGRATE_OPTIONS,
  DELIVERY_PLATFORM_OPTIONS,
  ADDITIONAL_INTEGRATION_OPTIONS,
  REQUIREMENT_OPTIONS,
  HARDWARE_OPTIONS,
  HARDWARE_CONFIG,
} from "./formSchema.js";

const SG_PHONE_RE = /^(\+65)?[689]\d{7}$/;
const DRAFT_KEY = "jobsheet_draft_v1";
const FAILED_SUBMIT_KEY = "jobsheet_failed_submit_v1";

function formatSgPhone(raw) {
  // Strip our own "+65" prefix as literal text before pulling digits out - otherwise
  // the "6" and "5" rendered in the prefix get re-absorbed as real digits once
  // backspacing drops the total digit count low enough to skip a length-based check,
  // corrupting the number instead of shrinking it.
  let s = String(raw || "");
  if (s.startsWith("+65")) s = s.slice(3);
  const digits = s.replace(/\D/g, "").slice(0, 8);
  if (!digits) return "";
  const part2 = digits.slice(4, 8);
  return part2 ? `+65 ${digits.slice(0, 4)} ${part2}` : `+65 ${digits}`;
}

// Given a chosen deployment-address option, returns the form-state patch:
// the three deployment_* fields plus the source marker. "manual" only sets the
// marker so the user's own typing is left untouched.
function pickAddressPatch(addr) {
  const source = addr?.source || "";
  if (source === "manual") return { deployment_address_source: "manual" };
  return {
    deployment_address_source: source,
    deployment_unit: addr?.unit || "",
    deployment_blk_st: addr?.blk_st || "",
    deployment_postal_code: String(addr?.postal_code || ""),
  };
}

const emptyForm = {
  // Deal / company / contact
  deal_id: null,
  deal_name: "",
  company_id: null,
  company_name: "",
  contact_id: null,
  contact_name: "",
  contact_phone: "",
  salesperson: "",
  shop_name: "",
  uen_number: "",
  client_name: "",
  client_contact_no: "",
  same_as_contact: false,
  registered_unit: "",
  registered_blk_st: "",
  registered_postal_code: "",
  operational_addresses: [], // [{ index, unit, blk_st, postal_code }] from the Deal
  number_of_outlets_sold: "",
  deployment_address_source: "", // "" | "manual" | "registered" | "operational-<index>"
  deployment_unit: "",
  deployment_blk_st: "",
  deployment_postal_code: "",
  preferred_deployment_date: "",

  // Commercial
  pos_package: "",
  pos_package_other: "",
  main_invoice_no: "",
  whatsapp_group_chat: "",
  years_free: "",
  subscription: "",
  subscription_other: "",
  payment_status: "",
  payment_received: "",
  business_type: "",
  business_type_other: "",

  // Store setup
  setup_type: "",
  store_condition: "",
  existing_setup: "",
  multiple_pos: "",
  backend_domain: "",
  tax_rule: "",
  special_payment_types: [],
  antom_cc_type: [],
  paynow_uob_docs: "",
  paynow_completion: "",
  nets_type: "",

  // Branding
  logo_filename: "",
  logo_data_url: "",
  header_text: "",
  footer_text: "",

  // Integrations
  integrations: [],
  epos_web_ordering_type: "",
  accounting_platform: "",
  accounting_status: "",
  accounting_when: "",
  ecommerce_platform: "",
  ecommerce_status: "",
  ecommerce_when: "",
  delivery_platforms: [],
  delivery_details: {},
  additional_integrations: [],
  other_integration_instructions: "",

  // Requirements
  requirements: [],
  usage_description: "",

  // Hardware
  hardware_selected: [],
  hardware_details: {},
  other_hardware_instructions: "",
};

export default function JobsheetForm() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [locked, setLocked] = useState(false);
  const [uenPrefilled, setUenPrefilled] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok: bool, message: string, url? }
  const [errors, setErrors] = useState([]);
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [failedSubmitAvailable, setFailedSubmitAvailable] = useState(false);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    document.title = "EPOS Jobsheet Form";
    if (localStorage.getItem(DRAFT_KEY)) setDraftAvailable(true);
    if (localStorage.getItem(FAILED_SUBMIT_KEY)) setFailedSubmitAvailable(true);
  }, []);

  useEffect(() => {
    if (locked || manualEntry) return;
    if (query.trim().length < 2) {
      setSuggestions([]);
      setSearchError("");
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      setSearchError("");
      try {
        const data = await searchDeal(query, controller.signal);
        setSuggestions(data.results || []);
        setShowSuggestions(true);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("[search-deal]", err);
          setSuggestions([]);
          setSearchError(err.message);
          setShowSuggestions(true);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, locked, manualEntry]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Typing directly into a deployment address field means the value no longer
  // matches whichever HubSpot address was picked - flip the source to "manual"
  // so the picker stops highlighting a stale option.
  function setDeploymentField(key, value) {
    setForm((f) => ({ ...f, [key]: value, deployment_address_source: "manual" }));
  }

  function handlePickAddress(source) {
    setForm((f) => {
      if (source === "manual") {
        return {
          ...f,
          deployment_address_source: "manual",
          deployment_unit: "",
          deployment_blk_st: "",
          deployment_postal_code: "",
        };
      }
      if (source === "registered") {
        return {
          ...f,
          ...pickAddressPatch({
            source,
            unit: f.registered_unit,
            blk_st: f.registered_blk_st,
            postal_code: f.registered_postal_code,
          }),
        };
      }
      const idx = Number(source.replace("operational-", ""));
      const addr = (f.operational_addresses || []).find((a) => a.index === idx);
      return { ...f, ...pickAddressPatch({ source, ...(addr || {}) }) };
    });
  }

  function toggleListField(key, value) {
    setForm((f) => {
      const list = f[key] || [];
      return { ...f, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
  }

  // Unlike toggleListField, these also drop the item's *_details entry when deselected -
  // otherwise stale hardware/delivery details linger in state (and would still get
  // submitted) even after the user unchecks the item.
  function toggleHardwareSelected(hwKey) {
    setForm((f) => {
      const selected = f.hardware_selected.includes(hwKey) ? f.hardware_selected.filter((k) => k !== hwKey) : [...f.hardware_selected, hwKey];
      const hardware_details = { ...f.hardware_details };
      if (!selected.includes(hwKey)) delete hardware_details[hwKey];
      return { ...f, hardware_selected: selected, hardware_details };
    });
  }

  function toggleDeliveryPlatform(platform) {
    setForm((f) => {
      const selected = f.delivery_platforms.includes(platform) ? f.delivery_platforms.filter((p) => p !== platform) : [...f.delivery_platforms, platform];
      const delivery_details = { ...f.delivery_details };
      if (!selected.includes(platform)) delete delivery_details[platform];
      return { ...f, delivery_platforms: selected, delivery_details };
    });
  }

  function setHardwareField(hwKey, subKey, value) {
    setForm((f) => ({
      ...f,
      hardware_details: {
        ...f.hardware_details,
        [hwKey]: { ...(f.hardware_details[hwKey] || {}), [subKey]: value },
      },
    }));
  }

  function setDeliveryField(platform, subKey, value) {
    setForm((f) => ({
      ...f,
      delivery_details: {
        ...f.delivery_details,
        [platform]: { ...(f.delivery_details[platform] || {}), [subKey]: value },
      },
    }));
  }

  async function handleSelectDeal(deal) {
    setShowSuggestions(false);
    setQuery(deal.dealname);
    try {
      const details = await getDealDetails(deal.id);
      setForm((f) => ({
        ...f,
        deal_id: details.deal.id,
        deal_name: details.deal.dealname || deal.dealname,
        company_id: details.company.id || null,
        company_name: details.company.name || "",
        contact_id: details.contact.id || null,
        contact_name: [details.contact.first_name, details.contact.last_name].filter(Boolean).join(" "),
        contact_phone: details.contact.phone || "",
        shop_name: details.company.shop_name || "",
        uen_number: details.company.uen_number || "",
        business_type: BUSINESS_TYPE_OPTIONS.includes(details.contact.business_type) ? details.contact.business_type : "",
        registered_unit: details.company.registered_unit || "",
        registered_blk_st: details.company.registered_blk_st || "",
        registered_postal_code: details.company.registered_postal_code || "",
        operational_addresses: details.deal.operational_addresses || [],
        number_of_outlets_sold: details.deal.number_of_outlets_sold || "",
        // Auto-pick outlet #1's operational address as the deployment address -
        // it's the right default for the vast majority of single-outlet deals.
        ...pickAddressPatch(
          (details.deal.operational_addresses || [])[0]
            ? { source: `operational-${details.deal.operational_addresses[0].index}`, ...details.deal.operational_addresses[0] }
            : {}
        ),
        payment_status: PAYMENT_STATUS_OPTIONS.includes(details.deal.dealstage) ? details.deal.dealstage : "",
        salesperson: SALESPEOPLE.includes(details.deal.owner_name) ? details.deal.owner_name : f.salesperson,
      }));
      setUenPrefilled(!!details.company.uen_number);
      setLocked(true);
    } catch (err) {
      setResult({ ok: false, message: `Failed to load deal details: ${err.message}` });
    }
  }

  function handleUnlock() {
    setLocked(false);
    setManualEntry(false);
    setUenPrefilled(false);
    setForm(emptyForm);
    setQuery("");
    setSuggestions([]);
    setSearchError("");
  }

  function handleSaveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, locked, manualEntry, uenPrefilled, query, savedAt: new Date().toISOString() }));
    setDraftAvailable(true);
    setResult({ ok: true, message: "Draft saved on this device. You can close this tab and come back later." });
  }

  function handleRestoreDraft() {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    try {
      const draft = JSON.parse(saved);
      setForm({ ...emptyForm, ...draft.form });
      setLocked(!!draft.locked);
      setManualEntry(!!draft.manualEntry);
      setUenPrefilled(!!draft.uenPrefilled);
      setQuery(draft.query || "");
      setDraftAvailable(false);
      setResult(null);
    } catch {
      localStorage.removeItem(DRAFT_KEY);
      setDraftAvailable(false);
    }
  }

  function handleDiscardDraft() {
    localStorage.removeItem(DRAFT_KEY);
    setDraftAvailable(false);
  }

  function handleRestoreFailedSubmit() {
    const saved = localStorage.getItem(FAILED_SUBMIT_KEY);
    if (!saved) return;
    try {
      const backup = JSON.parse(saved);
      setForm({ ...emptyForm, ...backup.form });
      setLocked(!!backup.locked);
      setManualEntry(!!backup.manualEntry);
      setUenPrefilled(!!backup.uenPrefilled);
      setFailedSubmitAvailable(false);
      setResult(null);
    } catch {
      localStorage.removeItem(FAILED_SUBMIT_KEY);
      setFailedSubmitAvailable(false);
    }
  }

  function handleDiscardFailedSubmit() {
    localStorage.removeItem(FAILED_SUBMIT_KEY);
    setFailedSubmitAvailable(false);
  }

  function handleReset() {
    if (!window.confirm("Reset the whole form? This clears everything you've entered.")) return;
    handleUnlock();
    setResult(null);
    setErrors([]);
    localStorage.removeItem(DRAFT_KEY);
    setDraftAvailable(false);
  }

  function handleManualEntry() {
    setManualEntry(true);
    setLocked(false);
    setUenPrefilled(false);
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchError("");
    setForm((f) => ({ ...emptyForm, deal_name: query, deployment_address_source: "manual" }));
  }

  function handleSameAsContact(checked) {
    setForm((f) => ({
      ...f,
      same_as_contact: checked,
      client_name: checked ? f.contact_name : "",
      client_contact_no: checked ? formatSgPhone(f.contact_phone) : "",
    }));
  }

  function handleLogoChange(file) {
    if (!file) {
      setField("logo_filename", "");
      setField("logo_data_url", "");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setField("logo_filename", file.name);
      setField("logo_data_url", reader.result);
    };
    reader.readAsDataURL(file);
  }

  function validate() {
    const errs = [];
    const req = (cond, label) => {
      if (!cond) errs.push(label);
    };

    req(form.deal_name.trim(), "Deal name");
    req(form.salesperson, "Salesperson");
    req(form.shop_name.trim(), "Shop Name");
    req(form.uen_number.trim(), "UEN Number");
    req(form.client_name.trim(), "Client Name");
    req(form.client_contact_no.trim(), "Client Contact No.");
    if (form.client_contact_no.trim() && !SG_PHONE_RE.test(form.client_contact_no.replace(/\s/g, ""))) {
      errs.push("Client Contact No. must be a valid Singapore number");
    }
    req(form.deployment_unit.trim(), "Deployment Address (Unit)");
    req(form.deployment_blk_st.trim(), "Deployment Address (Blk & St)");
    req(form.deployment_postal_code.trim(), "Deployment Address (Postal Code)");
    if (form.deployment_postal_code.trim() && !/^\d{6}$/.test(form.deployment_postal_code.trim())) {
      errs.push("Deployment Address (Postal Code) must be exactly 6 digits");
    }
    req(form.main_invoice_no.trim(), "Main Quotation/Invoice No.");
    if (form.main_invoice_no.trim() && !/^\d+$/.test(form.main_invoice_no.trim())) {
      errs.push("Main Quotation/Invoice No. must contain digits only");
    }
    req(form.whatsapp_group_chat, "WhatsApp Group Chat");
    req(form.years_free.trim(), "Number of Year(s) Free");
    req(form.subscription, "Subscription");
    if (form.subscription === "Other") req(form.subscription_other.trim(), "Please specify other subscription");
    req(form.payment_status.trim(), "Deal Stage");
    req(form.payment_received, "Payment Received");
    req(form.business_type, "Business Type");
    if (form.business_type === "Other") req(form.business_type_other.trim(), "Please specify other Business Type");
    req(form.setup_type, "Setup Type");
    if (form.setup_type === "Existing") req(form.existing_setup, "Existing Setup");
    req(form.store_condition, "Store Condition");
    req(form.tax_rule, "Tax Rule");
    if (form.special_payment_types.includes("Antom cc")) req(form.antom_cc_type.length > 0, "Antom CC type");
    if (form.special_payment_types.includes("Integrated PayNow")) {
      req(form.paynow_uob_docs, "Integrated PayNow (UOB documents)");
      req(form.paynow_completion, "PayNow completion method");
    }
    if (form.special_payment_types.includes("NETS")) req(form.nets_type, "NETS type");

    if (form.integrations.includes("Epos Web Ordering App")) req(form.epos_web_ordering_type, "Epos Web Ordering App type");
    if (form.integrations.includes("Accounting Integration")) {
      req(form.accounting_platform, "Accounting Platform");
      req(form.accounting_status, "Accounting Platform Status");
      req(form.accounting_when, "When to Integrate Accounting Platform");
    }
    if (form.integrations.includes("E-commerce Integration")) {
      req(form.ecommerce_platform, "E-commerce Platform");
      req(form.ecommerce_status, "E-commerce Platform Status");
      req(form.ecommerce_when, "When to Integrate E-commerce Platform");
    }
    if (form.integrations.includes("Delivery")) {
      req(form.delivery_platforms.length > 0, "At least one Delivery Platform");
      for (const p of form.delivery_platforms) {
        const d = form.delivery_details[p] || {};
        req(d.status, `${p} Account Status`);
        req(d.when, `When to Integrate ${p}`);
      }
    }

    req(form.hardware_selected.length > 0, "At least one item in Select Hardware");
    for (const hwKey of form.hardware_selected) {
      const cfg = HARDWARE_CONFIG[hwKey];
      const label = HARDWARE_OPTIONS.find((h) => h.key === hwKey)?.label || hwKey;
      const detail = form.hardware_details[hwKey] || {};
      req(String(detail.number ?? "").trim(), `${label}: ${cfg.numberLabel}`);
      if (cfg.hardwareOptions) req(detail.hardware, `${label}: ${cfg.hardwareLabel}`);
      if (cfg.packageLabel) req(detail.package, `${label}: ${cfg.packageLabel}`);
      for (const extra of cfg.extraFields || []) {
        if (extra.type === "checkbox") continue;
        req(String(detail[extra.key] ?? "").trim(), `${label}: ${extra.label}`);
      }
    }

    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setResult(null);

    const validationErrors = validate();
    setErrors(validationErrors);
    if (validationErrors.length > 0) {
      setResult({ ok: false, message: "Please fill in the required fields highlighted below." });
      return;
    }

    localStorage.setItem(FAILED_SUBMIT_KEY, JSON.stringify({ form, locked, manualEntry, uenPrefilled }));

    setSubmitting(true);
    try {
      const res = await submitJobsheet(form);
      localStorage.removeItem(FAILED_SUBMIT_KEY);
      setFailedSubmitAvailable(false);
      localStorage.removeItem(DRAFT_KEY);
      setDraftAvailable(false);
      setResult({ ok: true, message: `Ticket created in HubSpot (#${res.ticket_id}).`, url: res.hubspot_url });
      handleUnlock();
      setErrors([]);
    } catch (err) {
      setFailedSubmitAvailable(true);
      setResult({
        ok: false,
        message: `Submission failed: ${err.message}. Your input was saved locally - use "Restore failed submission" above to recover it.`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const dealChosen = locked || manualEntry;

  return (
    <div className="jobsheet-root">
    <div className="page">
      <header className="topbar">
        <img src={eposLogo} alt="EPOS" className="brand-logo" />
        <span className="brand-divider" aria-hidden="true" />
        <div className="brand-text">
          <span className="brand-title">Jobsheet Form</span>
          <span className="brand-subtitle">Deployment intake &amp; HubSpot ticket creation</span>
        </div>
      </header>

      <div className="card">
        <p className="subtitle">Search an existing HubSpot Deal to auto-fill Contact/Company, then complete the deployment jobsheet.</p>

        {failedSubmitAvailable && (
          <div className="banner draft-banner">
            A previous submission failed before reaching HubSpot - your input is still saved.{" "}
            <button type="button" className="link-btn" onClick={handleRestoreFailedSubmit}>
              Restore failed submission
            </button>{" "}
            <button type="button" className="link-btn" onClick={handleDiscardFailedSubmit}>
              Discard
            </button>
          </div>
        )}

        {draftAvailable && (
          <div className="banner draft-banner">
            You have a saved draft on this device.{" "}
            <button type="button" className="link-btn" onClick={handleRestoreDraft}>
              Restore draft
            </button>{" "}
            <button type="button" className="link-btn" onClick={handleDiscardDraft}>
              Discard
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <fieldset>
            <legend><StepBadge n={1} />Find the Deal</legend>

            {!dealChosen && (
              <div className="search-box">
                <label htmlFor="deal-search">Search by Deal name or Company name</label>
                <input
                  id="deal-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => suggestions.length && setShowSuggestions(true)}
                  placeholder="e.g. Epos Pte Ltd @ Orchard"
                  autoComplete="off"
                />
                {searching && <span className="hint">Searching...</span>}
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="suggestions">
                    {suggestions.map((d) => (
                      <li key={d.id} onClick={() => handleSelectDeal(d)}>
                        <strong>{d.dealname}</strong>
                        {d.dealstage && <span className="stage"> · {d.dealstage}</span>}
                      </li>
                    ))}
                    <li className="suggestions-manual-entry" onClick={handleManualEntry}>
                      None of these — enter manually
                    </li>
                  </ul>
                )}
                {showSuggestions && !searching && query.trim().length >= 2 && suggestions.length === 0 && (
                  <div className="no-match">
                    {searchError ? `Deal search unavailable (${searchError}).` : `No deal matched "${query}".`}{" "}
                    <button type="button" className="link-btn" onClick={handleManualEntry}>
                      Enter details manually
                    </button>
                  </div>
                )}
              </div>
            )}

            {dealChosen && (
              <div className="locked-block">
                <div className="locked-header">
                  <span className="lock-icon" aria-hidden="true">🔒</span>
                  {locked ? "Auto-filled from HubSpot Deal" : "Manual entry (no matching Deal found)"}
                  <button type="button" className="link-btn" onClick={handleUnlock}>
                    change
                  </button>
                </div>
                <div className="grid">
                  <FieldGroup label="Deal name" required>
                    <input value={form.deal_name} readOnly={locked} onChange={(e) => setField("deal_name", e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Company">
                    <input value={form.company_name} readOnly={locked} onChange={(e) => setField("company_name", e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Contact name">
                    <input value={form.contact_name} readOnly={locked} onChange={(e) => setField("contact_name", e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Contact phone">
                    <input value={form.contact_phone} readOnly={locked} onChange={(e) => setField("contact_phone", e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="UEN Number" required>
                    <input
                      value={form.uen_number}
                      readOnly={locked && uenPrefilled}
                      placeholder={locked && !uenPrefilled ? "Not on file in HubSpot - please enter" : ""}
                      onChange={(e) => setField("uen_number", e.target.value)}
                    />
                  </FieldGroup>
                  <FieldGroup label="Deal Stage" required>
                    {locked && form.payment_status ? (
                      <input value={form.payment_status} readOnly />
                    ) : (
                      <Dropdown value={form.payment_status} onChange={(v) => setField("payment_status", v)} options={PAYMENT_STATUS_OPTIONS} />
                    )}
                  </FieldGroup>
                </div>
              </div>
            )}
          </fieldset>

          {dealChosen && (
            <>
              <fieldset>
                <legend><StepBadge n={2} />Deployment details</legend>
                <div className="grid">
                  <SelectField label="Salesperson" required value={form.salesperson} onChange={(v) => setField("salesperson", v)} options={SALESPEOPLE} />
                  <TextField label="Shop Name" required value={form.shop_name} onChange={(v) => setField("shop_name", v)} />
                </div>

                <label className="same-address-check">
                  <input
                    type="checkbox"
                    checked={form.same_as_contact}
                    disabled={!form.contact_name && !form.contact_phone}
                    onChange={(e) => handleSameAsContact(e.target.checked)}
                  />
                  Client Name / Contact No. same as Contact ({form.contact_name || "-"}, {form.contact_phone || "-"})
                </label>

                <div className="grid">
                  <TextField label="Client Name" required value={form.client_name} onChange={(v) => setField("client_name", v)} />
                  <TextField
                    label="Client Contact No."
                    required
                    type="phone"
                    value={form.client_contact_no}
                    onChange={(v) => setField("client_contact_no", v)}
                    placeholder="8-digit SG number"
                    error={
                      form.client_contact_no.replace(/\D/g, "").slice(2) &&
                      !/^[689]/.test(form.client_contact_no.replace(/\D/g, "").slice(2))
                        ? "Please enter a valid 8-digit SG number starting with 6, 8 or 9."
                        : ""
                    }
                  />
                </div>

                <div className="address-compare">
                  <AddressSourcePicker form={form} onPick={handlePickAddress} />
                  <div className="address-fields">
                    <TextField label="Deployment Address (Unit)" required value={form.deployment_unit} onChange={(v) => setDeploymentField("deployment_unit", v)} />
                    <TextField label="Deployment Address (Blk & St)" required value={form.deployment_blk_st} onChange={(v) => setDeploymentField("deployment_blk_st", v)} />
                    <TextField
                      label="Deployment Address (Postal Code)"
                      required
                      value={form.deployment_postal_code}
                      onChange={(v) => setDeploymentField("deployment_postal_code", v)}
                      type="number"
                      error={form.deployment_postal_code && form.deployment_postal_code.length !== 6 ? `Must be exactly 6 digits (currently ${form.deployment_postal_code.length})` : ""}
                    />
                  </div>
                </div>

                <div className="grid">
                  <FieldGroup label="Preferred Deployment Date">
                    <DatePicker value={form.preferred_deployment_date} onChange={(v) => setField("preferred_deployment_date", v)} />
                  </FieldGroup>
                </div>
              </fieldset>

              <fieldset>
                <legend><StepBadge n={3} />Commercial</legend>
                <div className="grid">
                  <FieldGroup label="POS Package">
                    <Dropdown value={form.pos_package} onChange={(v) => setField("pos_package", v)} options={POS_PACKAGE_OPTIONS} />
                    {form.pos_package === "Others" && (
                      <input className="specify" placeholder="Please specify other POS package" value={form.pos_package_other} onChange={(e) => setField("pos_package_other", e.target.value)} />
                    )}
                  </FieldGroup>
                  <TextField label="Main Quotation/Invoice No." required value={form.main_invoice_no} onChange={(v) => setField("main_invoice_no", v)} />
                  <SelectField label="WhatsApp Group Chat" required value={form.whatsapp_group_chat} onChange={(v) => setField("whatsapp_group_chat", v)} options={WHATSAPP_GROUP_OPTIONS} />
                  <TextField label="Number of Year(s) Free" required value={form.years_free} onChange={(v) => setField("years_free", v)} type="number" />
                  <SelectField label="Payment Received" required value={form.payment_received} onChange={(v) => setField("payment_received", v)} options={PAYMENT_RECEIVED_OPTIONS} />
                  <FieldGroup label="Business Type" required>
                    <Dropdown value={form.business_type} onChange={(v) => setField("business_type", v)} options={BUSINESS_TYPE_OPTIONS} />
                    {form.business_type === "Other" && (
                      <input className="specify" placeholder="Please specify other Business Type" value={form.business_type_other} onChange={(e) => setField("business_type_other", e.target.value)} />
                    )}
                  </FieldGroup>
                </div>
                <FieldGroup label="Subscription" required>
                  <Dropdown value={form.subscription} onChange={(v) => setField("subscription", v)} options={SUBSCRIPTION_OPTIONS} />
                  {form.subscription === "Other" && (
                    <input className="specify" placeholder="Please specify other subscription" value={form.subscription_other} onChange={(e) => setField("subscription_other", e.target.value)} />
                  )}
                </FieldGroup>
              </fieldset>

              <fieldset>
                <legend><StepBadge n={4} />Store setup</legend>
                <div className="grid">
                  <SelectField label="Setup Type" required value={form.setup_type} onChange={(v) => setField("setup_type", v)} options={SETUP_TYPE_OPTIONS} />
                  {form.setup_type === "Existing" && (
                    <SelectField label="Existing Setup" required value={form.existing_setup} onChange={(v) => setField("existing_setup", v)} options={EXISTING_SETUP_OPTIONS} />
                  )}
                  <SelectField label="Store Condition" required value={form.store_condition} onChange={(v) => setField("store_condition", v)} options={STORE_CONDITION_OPTIONS} />
                  <SelectField label="For Multiple POS at Same Outlet" value={form.multiple_pos} onChange={(v) => setField("multiple_pos", v)} options={MULTI_POS_OPTIONS} />
                  <TextField label="Backend (XXX.eposdata.com)" value={form.backend_domain} onChange={(v) => setField("backend_domain", v)} />
                  <SelectField label="Tax Rule" required value={form.tax_rule} onChange={(v) => setField("tax_rule", v)} options={TAX_RULE_OPTIONS} />
                </div>

                <FieldGroup label="Special Payment Types">
                  <p className="hint">Default (always on): Cash, VISA, Mastercard</p>
                  <ChipGroup options={SPECIAL_PAYMENT_OPTIONS} selected={form.special_payment_types} onToggle={(v) => toggleListField("special_payment_types", v)} />
                </FieldGroup>

                {form.special_payment_types.includes("Antom cc") && (
                  <div className="subsection">
                    <FieldGroup label="Antom CC" required>
                      <ChipGroup options={ANTOM_CC_OPTIONS} selected={form.antom_cc_type} onToggle={(v) => toggleListField("antom_cc_type", v)} />
                    </FieldGroup>
                  </div>
                )}
                {form.special_payment_types.includes("Integrated PayNow") && (
                  <div className="subsection">
                    <SelectField label="Integrated PayNow" required value={form.paynow_uob_docs} onChange={(v) => setField("paynow_uob_docs", v)} options={PAYNOW_DOC_OPTIONS} />
                    <SelectField label="How would you like to complete the payment?" required value={form.paynow_completion} onChange={(v) => setField("paynow_completion", v)} options={PAYNOW_COMPLETION_OPTIONS} />
                  </div>
                )}
                {form.special_payment_types.includes("NETS") && (
                  <div className="subsection">
                    <SelectField label="NETS" required value={form.nets_type} onChange={(v) => setField("nets_type", v)} options={NETS_OPTIONS} />
                  </div>
                )}
              </fieldset>

              <fieldset>
                <legend><StepBadge n={5} />Branding</legend>
                <div className="grid">
                  <FieldGroup label="Client's Store Logo">
                    <LogoUpload filename={form.logo_filename} previewUrl={form.logo_data_url} onFileSelected={handleLogoChange} />
                  </FieldGroup>
                  <TextField label="Header text" value={form.header_text} onChange={(v) => setField("header_text", v)} />
                  <TextField label="Footer text" value={form.footer_text} onChange={(v) => setField("footer_text", v)} />
                </div>
              </fieldset>

              <fieldset>
                <legend><StepBadge n={6} />Integration(s)</legend>
                <FieldGroup label="Integration(s)">
                  <ChipGroup options={INTEGRATION_OPTIONS} selected={form.integrations} onToggle={(v) => toggleListField("integrations", v)} />
                </FieldGroup>

                {form.integrations.includes("Epos Web Ordering App") && (
                  <div className="subsection">
                    <SelectField label="Epos Web Ordering App" required value={form.epos_web_ordering_type} onChange={(v) => setField("epos_web_ordering_type", v)} options={EPOS_WEB_ORDERING_OPTIONS} />
                  </div>
                )}
                {form.integrations.includes("Accounting Integration") && (
                  <div className="subsection">
                    <SelectField label="Accounting Platform(s)" required value={form.accounting_platform} onChange={(v) => setField("accounting_platform", v)} options={ACCOUNTING_PLATFORM_OPTIONS} />
                    <SelectField label="Accounting Platform Status" required value={form.accounting_status} onChange={(v) => setField("accounting_status", v)} options={ACCOUNT_STATUS_OPTIONS} />
                    <SelectField label="When to Integrate Accounting Platform" required value={form.accounting_when} onChange={(v) => setField("accounting_when", v)} options={WHEN_TO_INTEGRATE_OPTIONS} />
                  </div>
                )}
                {form.integrations.includes("E-commerce Integration") && (
                  <div className="subsection">
                    <SelectField label="E-commerce Platform(s)" required value={form.ecommerce_platform} onChange={(v) => setField("ecommerce_platform", v)} options={ECOMMERCE_PLATFORM_OPTIONS} />
                    <SelectField label="E-commerce Platform Status" required value={form.ecommerce_status} onChange={(v) => setField("ecommerce_status", v)} options={ACCOUNT_STATUS_OPTIONS} />
                    <SelectField label="When to Integrate E-commerce Platform" required value={form.ecommerce_when} onChange={(v) => setField("ecommerce_when", v)} options={WHEN_TO_INTEGRATE_OPTIONS} />
                  </div>
                )}
                {form.integrations.includes("Delivery") && (
                  <div className="subsection">
                    <FieldGroup label="Delivery Platform(s)" required>
                      <ChipGroup options={DELIVERY_PLATFORM_OPTIONS} selected={form.delivery_platforms} onToggle={(v) => toggleDeliveryPlatform(v)} />
                    </FieldGroup>
                    {form.delivery_platforms.map((platform) => (
                      <div className="subsection" key={platform}>
                        <p className="hint">{platform}</p>
                        <SelectField
                          label={`${platform} Account Status`}
                          required
                          value={form.delivery_details[platform]?.status || ""}
                          onChange={(v) => setDeliveryField(platform, "status", v)}
                          options={ACCOUNT_STATUS_OPTIONS}
                        />
                        <SelectField
                          label={`When to Integrate ${platform}`}
                          required
                          value={form.delivery_details[platform]?.when || ""}
                          onChange={(v) => setDeliveryField(platform, "when", v)}
                          options={WHEN_TO_INTEGRATE_OPTIONS}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <FieldGroup label="Additional Integration(s)">
                  <ChipGroup options={ADDITIONAL_INTEGRATION_OPTIONS} selected={form.additional_integrations} onToggle={(v) => toggleListField("additional_integrations", v)} />
                </FieldGroup>
                <FieldGroup label="Other Integration Instructions">
                  <textarea rows={3} value={form.other_integration_instructions} onChange={(e) => setField("other_integration_instructions", e.target.value)} />
                </FieldGroup>
              </fieldset>

              <fieldset>
                <legend><StepBadge n={7} />Requirements</legend>
                <FieldGroup label="Requirement(s)">
                  <ChipGroup options={REQUIREMENT_OPTIONS} selected={form.requirements} onToggle={(v) => toggleListField("requirements", v)} />
                </FieldGroup>
                <FieldGroup label="Detailed description of the usage requirements">
                  <textarea rows={4} value={form.usage_description} onChange={(e) => setField("usage_description", e.target.value)} />
                </FieldGroup>
              </fieldset>

              <fieldset>
                <legend><StepBadge n={8} />Hardware</legend>
                <FieldGroup label="Select Hardware" required>
                  <ChipGroup options={HARDWARE_OPTIONS.map((h) => h.label)} selected={form.hardware_selected.map((k) => HARDWARE_OPTIONS.find((h) => h.key === k)?.label)} onToggle={(label) => {
                    const key = HARDWARE_OPTIONS.find((h) => h.label === label)?.key;
                    if (key) toggleHardwareSelected(key);
                  }} />
                </FieldGroup>

                {form.hardware_selected.map((hwKey) => (
                  <HardwareBlock
                    key={hwKey}
                    label={HARDWARE_OPTIONS.find((h) => h.key === hwKey)?.label}
                    config={HARDWARE_CONFIG[hwKey]}
                    value={form.hardware_details[hwKey] || {}}
                    onChange={(subKey, v) => setHardwareField(hwKey, subKey, v)}
                  />
                ))}

                <FieldGroup label="Other Hardware Instructions">
                  <textarea rows={3} value={form.other_hardware_instructions} onChange={(e) => setField("other_hardware_instructions", e.target.value)} />
                </FieldGroup>
              </fieldset>

              <div className="secondary-actions">
                <button type="button" className="btn-outline" onClick={handleSaveDraft}>
                  Save Draft
                </button>
                <button type="button" className="btn-outline btn-danger" onClick={handleReset}>
                  Reset
                </button>
              </div>

              <button type="submit" className="submit-btn" disabled={submitting}>
                {submitting ? "Submitting..." : "Create Jobsheet Ticket"}
              </button>
            </>
          )}
        </form>

        {errors.length > 0 && (
          <div className="banner error">
            <strong>Missing/invalid fields:</strong>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {result && (
          <div className={`banner ${result.ok ? "ok" : "error"}`}>
            {result.message}
            {result.ok && result.url && (
              <>
                {" "}
                <a href={result.url} target="_blank" rel="noreferrer">
                  Open in HubSpot
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

function AddressSourcePicker({ form, onPick }) {
  const hasRegistered = !!(form.registered_unit || form.registered_blk_st || form.registered_postal_code);
  const ops = form.operational_addresses || [];
  const outletsSold = Number(form.number_of_outlets_sold) || 0;
  const showMultiOutletHint = ops.length > 1 || outletsSold > 1;
  const joinAddr = (parts) => parts.filter(Boolean).join(", ") || "-";

  return (
    <div className="address-card address-source-picker">
      <span className="address-card-label">Deployment address — pick a source</span>

      {ops.map((a) => {
        const source = `operational-${a.index}`;
        return (
          <label key={source} className="address-source-option">
            <input
              type="radio"
              name="addr-source"
              checked={form.deployment_address_source === source}
              onChange={() => onPick(source)}
            />
            <span>
              <strong>{a.index === 1 ? "Operational Address — Primary Outlet" : `Operational Address ${a.index}`}</strong>
              <span className="address-source-detail">{joinAddr([a.unit, a.blk_st, a.postal_code])}</span>
            </span>
          </label>
        );
      })}

      <label className="address-source-option">
        <input
          type="radio"
          name="addr-source"
          checked={form.deployment_address_source === "registered"}
          disabled={!hasRegistered}
          onChange={() => onPick("registered")}
        />
        <span>
          <strong>Registered Address (Company)</strong>
          <span className="address-source-detail">
            {hasRegistered
              ? joinAddr([form.registered_unit, form.registered_blk_st, form.registered_postal_code])
              : "Not on file in HubSpot"}
          </span>
        </span>
      </label>

      <label className="address-source-option">
        <input
          type="radio"
          name="addr-source"
          checked={form.deployment_address_source === "manual"}
          onChange={() => onPick("manual")}
        />
        <span>
          <strong>Enter manually</strong>
          <span className="address-source-detail">Type the address in the fields on the right</span>
        </span>
      </label>

      {showMultiOutletHint && (
        <p className="address-source-hint">
          This Deal covers {outletsSold || ops.length} outlets — submit one jobsheet per outlet.
        </p>
      )}
    </div>
  );
}

function StepBadge({ n }) {
  return (
    <span className="step-badge" aria-hidden="true">
      {n}
    </span>
  );
}

function FieldGroup({ label, required, error, children }) {
  return (
    <div className="field-group">
      <label>
        {label}
        {required && <span className="required">*</span>}
      </label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function TextField({ label, required, value, onChange, type = "text", placeholder, error }) {
  // Numeric fields render as text + inputMode="numeric" rather than a native
  // <input type="number"> - the native widget lets a focused-but-unintended mouse
  // scroll silently change the value, and happily accepts "1e6" as a "valid" number.
  const isNumeric = type === "number";
  const isPhone = type === "phone";
  function handleChange(e) {
    let v = e.target.value;
    if (isNumeric) v = v.replace(/[^0-9]/g, "");
    if (isPhone) v = formatSgPhone(v);
    onChange(v);
  }
  return (
    <FieldGroup label={label} required={required} error={error}>
      <input
        type={isNumeric || isPhone ? "text" : type}
        inputMode={isNumeric || isPhone ? "numeric" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
      />
    </FieldGroup>
  );
}

function SelectField({ label, required, value, onChange, options }) {
  return (
    <FieldGroup label={label} required={required}>
      <Dropdown value={value} onChange={onChange} options={options} />
    </FieldGroup>
  );
}

function Dropdown({ value, onChange, options, placeholder = "Select..." }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="dropdown" ref={rootRef}>
      <button type="button" className={`dropdown-trigger ${open ? "open" : ""}`} onClick={() => setOpen((o) => !o)}>
        <span className={value ? "dropdown-value" : "dropdown-placeholder"}>{value || placeholder}</span>
        <svg className="dropdown-chevron" width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 7l5 6 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="dropdown-list">
          {options.map((o) => (
            <li
              key={o}
              className={`dropdown-option ${o === value ? "selected" : ""}`}
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChipGroup({ options, selected, onToggle }) {
  return (
    <div className="option-grid">
      {options.map((o) => {
        const isSelected = selected.includes(o);
        return (
          <button type="button" key={o} className={`option-tile ${isSelected ? "selected" : ""}`} onClick={() => onToggle(o)}>
            <span className="option-check" aria-hidden="true">
              {isSelected && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1 4.5L4 7.5L10 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="option-label">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

function LogoUpload({ filename, previewUrl, onFileSelected }) {
  const inputRef = useRef(null);

  function handleChange(e) {
    onFileSelected(e.target.files?.[0] || null);
    e.target.value = "";
  }

  return (
    <div className="logo-upload">
      <input ref={inputRef} type="file" accept="image/*" className="visually-hidden" onChange={handleChange} />
      {filename ? (
        <div className="logo-upload-preview">
          <img src={previewUrl} alt="Logo preview" />
          <div className="logo-upload-meta">
            <span className="logo-upload-filename">{filename}</span>
            <div className="logo-upload-actions">
              <button type="button" className="link-btn" onClick={() => inputRef.current?.click()}>
                Change
              </button>
              <button type="button" className="link-btn logo-remove" onClick={() => onFileSelected(null)}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="logo-upload-btn" onClick={() => inputRef.current?.click()}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 13V3M10 3L6 7M10 3l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 14v1.5A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>Upload store logo</span>
          <span className="logo-upload-hint">PNG or JPG</span>
        </button>
      )}
    </div>
  );
}

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toISODate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatDisplayDate(value) {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  return `${d} ${MONTH_LABELS[m - 1].slice(0, 3)} ${y}`;
}

function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => (value ? Number(value.split("-")[0]) : new Date().getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (value ? Number(value.split("-")[1]) - 1 : new Date().getMonth()));
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (value) {
      setViewYear(Number(value.split("-")[0]));
      setViewMonth(Number(value.split("-")[1]) - 1);
    }
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday-first
  const cells = [...Array(leadingBlanks).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];
  const todayISO = toISODate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  return (
    <div className="dropdown" ref={rootRef}>
      <button type="button" className={`dropdown-trigger ${open ? "open" : ""}`} onClick={() => setOpen((o) => !o)}>
        <span className={value ? "dropdown-value" : "dropdown-placeholder"}>{value ? formatDisplayDate(value) : "Select date"}</span>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="dropdown-chevron">
          <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 8h14M6.5 2.5v3M13.5 2.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="datepicker-panel">
          <div className="datepicker-header">
            <button type="button" className="datepicker-nav" onClick={() => changeMonth(-1)} aria-label="Previous month">
              ‹
            </button>
            <span className="datepicker-title">
              {MONTH_LABELS[viewMonth]} {viewYear}
            </span>
            <button type="button" className="datepicker-nav" onClick={() => changeMonth(1)} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="datepicker-grid datepicker-weekdays">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="datepicker-grid">
            {cells.map((day, i) => {
              if (day === null) return <span key={`blank-${i}`} />;
              const iso = toISODate(viewYear, viewMonth, day);
              const isSelected = iso === value;
              const isToday = iso === todayISO;
              return (
                <button
                  type="button"
                  key={iso}
                  className={`datepicker-day ${isSelected ? "selected" : ""} ${isToday && !isSelected ? "today" : ""}`}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="datepicker-footer">
            <button type="button" className="link-btn" onClick={() => { onChange(""); setOpen(false); }}>
              Clear
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                onChange(todayISO);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HardwareBlock({ label, config, value, onChange }) {
  return (
    <div className="subsection hardware-block">
      <p className="hint">{label}</p>
      <div className="grid">
        <TextField label={config.numberLabel} required type="number" value={value.number || ""} onChange={(v) => onChange("number", v)} />
        {config.hardwareOptions && (
          <SelectField label={config.hardwareLabel} required value={value.hardware || ""} onChange={(v) => onChange("hardware", v)} options={config.hardwareOptions} />
        )}
        {config.packageLabel && (
          <SelectField label={config.packageLabel} required value={value.package || ""} onChange={(v) => onChange("package", v)} options={config.packageOptions} />
        )}
        {(config.extraFields || []).map((extra) => {
          if (extra.type === "checkbox") {
            return (
              <FieldGroup key={extra.key} label={extra.label}>
                <input type="checkbox" checked={!!value[extra.key]} onChange={(e) => onChange(extra.key, e.target.checked)} />
              </FieldGroup>
            );
          }
          if (extra.type === "select") {
            return (
              <SelectField key={extra.key} label={extra.label} required value={value[extra.key] || ""} onChange={(v) => onChange(extra.key, v)} options={extra.options} />
            );
          }
          return (
            <TextField key={extra.key} label={extra.label} required type="number" value={value[extra.key] || ""} onChange={(v) => onChange(extra.key, v)} />
          );
        })}
      </div>
    </div>
  );
}
