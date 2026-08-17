import { useState } from "react";
import "./shared.css";

// ── Constants ────────────────────────────────────────────────
const SOURCE_MAP = {
  OWN:      "Sales' Own Referral",
  BCRS:     "Sales' Own Referral",
  MERCHANT: "Merchant Referral",
};

const PM_OPTIONS = [
  "Alvin Seah", "Andy Chia", "Arvinder Singh", "Brandon Leong",
  "Belle Phia", "Crystal Lee", "Dominic Chan", "Fenny Wong",
  "Glenn Wee", "Hadi Sng", "Harold Lim", "Julie Chan",
  "Tasha Goh", "Mervin Cai", "Rachel Tai", "Ruth Han",
  "Winston Heng", "Zack Gaffar"
];

const COUNTRY_CODES = [
  { code: "+65", label: "SG +65" },
  { code: "+60", label: "MY +60" },
  { code: "+62", label: "ID +62" },
  { code: "+66", label: "TH +66" },
  { code: "+84", label: "VN +84" },
  { code: "+63", label: "PH +63" },
  { code: "+44", label: "GB +44" },
  { code: "+1",  label: "US +1"  },
  { code: "+61", label: "AU +61" },
  { code: "+91", label: "IN +91" },
];

const PRODUCTS_OPTIONS = [
  { label: "POS",                      value: "POS" },
  { label: "EPOS Rewards",             value: "EPOS REWARDS" },
  { label: "Digital Marketing",        value: "DIGITAL MARKETING" },
  { label: "Website",                  value: "WEBSITE" },
  { label: "Soundbox",                 value: "SOUNDBOX" },
  { label: "Payment Terminal (N950)",  value: "PAYMENT TERMINALS" },
  { label: "EPOS360 (BlueTap)",        value: "EPOS360" },
  { label: "Grants",                   value: "GRANTS" },
  { label: "Others",                   value: "OTHERS" },
];

const API_ENDPOINT = "/api/referral";

const initialFields = {
  company: "", company_from: "", company_ref: "",
  first_name: "", last_name: "",
  country_code: "+65", phone: "",
  designation: "", pm: "",
  products: [], products_other: "", additional_notes: "",
};

// Required fields per referral type (products validated separately)
const REQUIRED = {
  OWN:      ["company", "first_name", "phone", "pm"],
  BCRS:     ["company", "first_name", "phone", "pm"],
  MERCHANT: ["company_from", "company_ref", "first_name", "phone", "pm"],
};

const FIELD_LABELS = {
  company:      "Company Name",
  company_from: "Company Name (Referred From)",
  company_ref:  "Company Name (Referral)",
  first_name:   "First Name",
  phone:        "Phone Number",
  pm:           "Project Manager",
  products:     "Products/Services Interested",
};

// ── Reusable components ──────────────────────────────────────

function FieldGroup({ label, sublabel, required, error, children }) {
  return (
    <div className="field-group">
      <label>
        {label}
        {required && <span className="req"> *</span>}
      </label>
      {sublabel && <div className="field-sublabel">{sublabel}</div>}
      {children}
      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}

function PlainInput({ error, ...props }) {
  return <input className={error ? "has-error" : ""} {...props} />;
}

function PhoneField({ ccValue, phoneValue, onChange, phoneError }) {
  return (
    <div className="phone-wrap">
      <select
        className="country-code-select"
        name="country_code"
        value={ccValue}
        onChange={onChange}
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      <input
        type="tel"
        className={`phone-number-input${phoneError ? " has-error" : ""}`}
        name="phone"
        value={phoneValue}
        onChange={onChange}
        placeholder="8482 1888"
      />
    </div>
  );
}

function PMDropdown({ value, onChange, error }) {
  return (
    <div className="select-wrap">
      <select
        name="pm"
        value={value}
        onChange={onChange}
        className={[error ? "has-error" : "", value ? "has-value" : ""].join(" ").trim()}
      >
        <option value="">Select project manager</option>
        {PM_OPTIONS.map((pm) => (
          <option key={pm} value={pm}>{pm}</option>
        ))}
      </select>
    </div>
  );
}

function ProductsMultiSelect({ selected, onChange, error }) {
  function toggle(value) {
    const next = selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value];
    onChange(next);
  }
  return (
    <div className={`products-multiselect${error ? " has-error" : ""}`}>
      {PRODUCTS_OPTIONS.map(p => (
        <button
          key={p.value}
          type="button"
          className={`product-chip${selected.includes(p.value) ? " selected" : ""}`}
          onClick={() => toggle(p.value)}
        >
          <span className="chip-check">
            {selected.includes(p.value) && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <polyline points="1.5,5 4,7.5 8.5,2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          {p.label}
        </button>
      ))}
    </div>
  );
}

function ThankYou({ onReset }) {
  return (
    <div className="form-card">
      <div className="form-body" style={{ paddingTop: 48, paddingBottom: 52 }}>
        <div className="thankyou-logo">
          <img src="/logo.webp" alt="EPOS Logo" />
        </div>
        <div className="thankyou-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
            stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="thankyou-title">Thank you for submitting!</h2>
        <p className="thankyou-note">
          You may find the submitted deals automatically created in HubSpot.
          Should you have any inquiries please contact EPOS Sales OPS team.
        </p>
        <button className="submit-another-btn" onClick={onReset}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Submit Another Referral
        </button>
      </div>
    </div>
  );
}

function ContactFields({ fields, errors, onChange, onProductsChange, startNum }) {
  const n = (i) => `${startNum + i}.`;
  const hasOthers = fields.products.includes("OTHERS");
  return (
    <>
      <div className="two-col">
        <FieldGroup label={`${n(0)} First Name`} required error={errors.first_name}>
          <PlainInput
            type="text" name="first_name" value={fields.first_name}
            onChange={onChange} error={errors.first_name} placeholder="First name"
          />
        </FieldGroup>
        <FieldGroup label={`${n(1)} Last Name`}>
          <PlainInput
            type="text" name="last_name" value={fields.last_name}
            onChange={onChange} placeholder="Last name"
          />
        </FieldGroup>
      </div>

      <FieldGroup label={`${n(2)} Phone Number`} required error={errors.phone}>
        <PhoneField
          ccValue={fields.country_code}
          phoneValue={fields.phone}
          onChange={onChange}
          phoneError={errors.phone}
        />
      </FieldGroup>

      <FieldGroup label={`${n(3)} PIC 1 Designation`}>
        <PlainInput
          type="text" name="designation" value={fields.designation}
          onChange={onChange} placeholder="e.g. Director, Manager"
        />
      </FieldGroup>

      <FieldGroup label={`${n(4)} Products/Services Interested`} required error={errors.products}>
        <ProductsMultiSelect
          selected={fields.products}
          onChange={onProductsChange}
          error={errors.products}
        />
      </FieldGroup>

      {hasOthers && (
        <FieldGroup label={`${n(5)} Please specify`} required error={errors.products_other}>
          <PlainInput
            type="text" name="products_other" value={fields.products_other}
            onChange={onChange} error={errors.products_other}
            placeholder="Please specify the product/service"
          />
        </FieldGroup>
      )}

      <FieldGroup label={`${hasOthers ? n(6) : n(5)} Additional Notes`}>
        <PlainInput
          type="text" name="additional_notes" value={fields.additional_notes}
          onChange={onChange}
          placeholder="Please add any relevant info that may help Inbound team"
          style={{ fontStyle: "italic" }}
        />
      </FieldGroup>

      <FieldGroup label={`${hasOthers ? n(7) : n(6)} Project Manager`} required error={errors.pm}>
        <PMDropdown value={fields.pm} onChange={onChange} error={errors.pm} />
      </FieldGroup>
    </>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function App() {
  const [page, setPage]                 = useState("form");
  const [referralType, setReferralType] = useState(null);
  const [fields, setFields]             = useState(initialFields);
  const [errors, setErrors]             = useState({});
  const [typeError, setTypeError]       = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [apiError, setApiError]         = useState("");

  function handleTypeSelect(type) {
    setReferralType(type);
    setTypeError(false);
    setErrors({});
    setApiError("");
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  }

  function handleProductsChange(newSelected) {
    setFields(prev => ({ ...prev, products: newSelected }));
    if (errors.products) setErrors(prev => ({ ...prev, products: "" }));
  }

  function validate() {
    if (!referralType) { setTypeError(true); return false; }
    const newErrors = {};
    REQUIRED[referralType].forEach((key) => {
      if (!fields[key] || fields[key].trim() === "")
        newErrors[key] = `${FIELD_LABELS[key]} is required.`;
    });
    // Phone validation — must be exactly 8 digits starting with 6, 8 or 9
    const digits = fields.phone.replace(/\D/g, "");
    if (!digits) {
      newErrors.phone = "Phone Number is required.";
    } else if (!/^[689]\d{7}$/.test(digits)) {
      newErrors.phone = "Please enter a valid 8-digit SG number starting with 6, 8 or 9.";
    }
    // Products validation
    if (fields.products.length === 0) {
      newErrors.products = "Products/Services Interested is required.";
    }
    if (fields.products.includes("OTHERS") && !fields.products_other.trim()) {
      newErrors.products_other = "Please specify the product/service.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      referral_type:   referralType,
      source:          SOURCE_MAP[referralType],
      first_name:      fields.first_name,
      last_name:       fields.last_name,
      phone:           `${fields.country_code} ${fields.phone}`.trim(),
      designation:     fields.designation,
      project_manager: fields.pm,
      products:        fields.products.join(", "),
      products_other:  fields.products_other,
      additional_notes: fields.additional_notes,
      ...(referralType === "MERCHANT"
        ? { company_referred_from: fields.company_from, company_referral: fields.company_ref }
        : { company_name: fields.company }
      ),
    };

    const backupKey = `referral_backup_${Date.now()}`;
    localStorage.setItem(backupKey, JSON.stringify({ saved_at: new Date().toISOString(), ...payload }));

    setSubmitting(true);
    try {
      const res = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      localStorage.removeItem(backupKey);
      setPage("thankyou");
    } catch {
      setApiError("Something went wrong. Your data has been saved locally — please screenshot this page or retry.");
    } finally {
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleReset() {
    setPage("form");
    setReferralType(null);
    setFields(initialFields);
    setErrors({});
    setTypeError(false);
    setApiError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (page === "thankyou") return <ThankYou onReset={handleReset} />;

  return (
    <div className="form-card">
      <div className="form-header">
        <div className="form-logo"><img src="/logo.webp" alt="EPOS Logo" /></div>
        <h1 className="form-title">Referral Form</h1>
      </div>

      <div className="form-body">
        <form onSubmit={handleSubmit} noValidate>

          {/* ── Q1: Referral Type ── */}
          <div className="q-block">
            <div className="q-top-label">
              1. What type of referral is this?<span className="req"> *</span>
            </div>
            <div className="type-buttons">
              {["OWN", "MERCHANT", "BCRS"].map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`type-btn${referralType === type ? " active" : ""}`}
                  onClick={() => handleTypeSelect(type)}
                >
                  <span className="radio-ring"><span className="radio-dot" /></span>
                  {type}
                </button>
              ))}
            </div>
            {typeError && (
              <div className="type-error visible">Please select a referral type.</div>
            )}
          </div>

          {/* ── Q2: Source (auto-filled, read-only) ── */}
          {referralType && (
            <div className="q-block fade-in">
              <div className="q-top-label">2. Source</div>
              <div className="source-display">{SOURCE_MAP[referralType]}</div>
            </div>
          )}

          {/* ── Dynamic fields based on type ── */}
          {referralType && (
            <div className="fade-in">
              <hr className="section-divider" />

              {/* OWN — single company name, then contact fields */}
              {(referralType === "OWN" || referralType === "BCRS") && (
                <>
                  <FieldGroup
                    label="3. Company Name"
                    required
                    error={errors.company}
                    sublabel="Include the outlet location (e.g. EPOS Pte Ltd @ Orchard)"
                  >
                    <PlainInput
                      type="text" name="company" value={fields.company}
                      onChange={handleChange} error={errors.company}
                      placeholder="EPOS Pte Ltd @ Orchard"
                    />
                  </FieldGroup>
                  <ContactFields
                    fields={fields} errors={errors}
                    onChange={handleChange}
                    onProductsChange={handleProductsChange}
                    startNum={4}
                  />
                </>
              )}

              {/* MERCHANT — two company fields, then contact fields */}
              {referralType === "MERCHANT" && (
                <>
                  <FieldGroup
                    label="3. Company Name (Referred From)"
                    required
                    error={errors.company_from}
                  >
                    <PlainInput
                      type="text" name="company_from" value={fields.company_from}
                      onChange={handleChange} error={errors.company_from}
                      placeholder="Enter referring company name"
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="4. Company Name (Referral)"
                    required
                    error={errors.company_ref}
                    sublabel="Include the outlet location (e.g. EPOS Pte Ltd @ Orchard)"
                  >
                    <PlainInput
                      type="text" name="company_ref" value={fields.company_ref}
                      onChange={handleChange} error={errors.company_ref}
                      placeholder="EPOS Pte Ltd @ Orchard"
                    />
                  </FieldGroup>
                  <ContactFields
                    fields={fields} errors={errors}
                    onChange={handleChange}
                    onProductsChange={handleProductsChange}
                    startNum={5}
                  />
                </>
              )}

              {apiError && (
                <div className="error-msg" style={{ marginBottom: 14 }}>{apiError}</div>
              )}

              <hr className="section-divider" />
              <button type="submit" className="submit-btn" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Referral"}
              </button>
            </div>
          )}

        </form>
      </div>
    </div>
  );
}
