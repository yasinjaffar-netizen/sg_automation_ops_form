import { useState } from "react";
import "./shared.css";

const API_ENDPOINT = "/api/interteam-referral";

const SOURCE_MAP = {
  INTERNAL: "Internal Referral",
  MA:       "MA Referral",
};

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

const initialFields = {
  company_name: "", first_name: "", last_name: "",
  country_code: "+65", phone: "", designation: "", antding_staff_id: "",
  products: "", products_other: "", additional_notes: "",
};

const REQUIRED_FIELDS = ["company_name", "first_name", "phone", "antding_staff_id", "products"];
const FIELD_LABELS = {
  company_name:     "Company Name",
  first_name:       "First Name",
  phone:            "Phone Number",
  antding_staff_id: "ANTDing Staff ID",
  products:         "Products/Services Interested",
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

// ── Main Component ────────────────────────────────────────────
export default function InterTeamForm() {
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

  function validate() {
    if (!referralType) { setTypeError(true); return false; }
    const newErrors = {};
    REQUIRED_FIELDS.forEach((key) => {
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
    // Products other validation
    if (fields.products === "OTHERS" && !fields.products_other.trim()) {
      newErrors.products_other = "Please specify the product/service.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      referral_type:    referralType,
      source:           SOURCE_MAP[referralType],
      company_name:     fields.company_name,
      first_name:       fields.first_name,
      last_name:        fields.last_name,
      phone:            `${fields.country_code} ${fields.phone}`.trim(),
      designation:      fields.designation,
      antding_staff_id: fields.antding_staff_id,
      products:         fields.products === "OTHERS" ? fields.products_other : fields.products,
      additional_notes: fields.additional_notes,
    };
    const backupKey = `interteam_backup_${Date.now()}`;
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
        <h1 className="form-title">Internal Referral Form</h1>
      </div>

      <div className="form-body">
        <form onSubmit={handleSubmit} noValidate>

          {/* Q1 Referral Type */}
          <div className="q-block">
            <div className="q-top-label">
              1. What type of referral is this?<span className="req"> *</span>
            </div>
            <div className="type-buttons" style={{ display: "flex", gap: "8px" }}>
              {["INTERNAL", "MA"].map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`type-btn${referralType === type ? " active" : ""}`}
                  onClick={() => handleTypeSelect(type)}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  <span className="radio-ring"><span className="radio-dot" /></span>
                  {type === "INTERNAL" ? "Internal" : "MA"}
                </button>
              ))}
            </div>
            {typeError && (
              <div className="type-error visible">Please select a referral type.</div>
            )}
          </div>

          {/* Q2 Source — auto-filled based on type */}
          {referralType && (
            <div className="q-block fade-in">
              <div className="q-top-label">2. Source</div>
              <div className="source-display">{SOURCE_MAP[referralType]}</div>
            </div>
          )}

          {/* Fields — shown after type is selected */}
          {referralType && (
            <div className="fade-in">
              <hr className="section-divider" />

              {/* Q3 Company Name */}
              <FieldGroup
                label="3. Company Name"
                required
                error={errors.company_name}
                sublabel="Include the outlet location (e.g. EPOS Pte Ltd @ Orchard)"
              >
                <PlainInput
                  type="text" name="company_name" value={fields.company_name}
                  onChange={handleChange} error={errors.company_name}
                  placeholder="EPOS Pte Ltd @ Orchard"
                />
              </FieldGroup>

              {/* Q3 & Q4 Name */}
              <div className="two-col">
                <FieldGroup label="4. First Name" required error={errors.first_name}>
                  <PlainInput
                    type="text" name="first_name" value={fields.first_name}
                    onChange={handleChange} error={errors.first_name}
                    placeholder="First name"
                  />
                </FieldGroup>
                <FieldGroup label="5. Last Name">
                  <PlainInput
                    type="text" name="last_name" value={fields.last_name}
                    onChange={handleChange} placeholder="Last name"
                  />
                </FieldGroup>
              </div>

              {/* Q5 Phone */}
              <FieldGroup label="6. Phone Number" required error={errors.phone}>
                <div className="phone-wrap">
                  <select
                    className="country-code-select"
                    name="country_code"
                    value={fields.country_code}
                    onChange={handleChange}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    className={`phone-number-input${errors.phone ? " has-error" : ""}`}
                    name="phone" value={fields.phone}
                    onChange={handleChange} placeholder="8482 1888"
                  />
                </div>
              </FieldGroup>

              {/* Q6 Designation */}
              <FieldGroup label="7. PIC 1 Designation">
                <PlainInput
                  type="text" name="designation" value={fields.designation}
                  onChange={handleChange} placeholder="e.g. Director, Manager"
                />
              </FieldGroup>

              {/* Q8 Products */}
              <FieldGroup
                label="8. Products/Services Interested"
                required
                error={errors.products}
              >
                <div className="select-wrap">
                  <select
                    name="products"
                    value={fields.products}
                    onChange={handleChange}
                    className={errors.products ? "has-error" : ""}
                  >
                    <option value="">Select a product/service</option>
                    {PRODUCTS_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </FieldGroup>

              {fields.products === "OTHERS" && (
                <FieldGroup label="9. Please specify" required error={errors.products_other}>
                  <PlainInput
                    type="text" name="products_other" value={fields.products_other}
                    onChange={handleChange} error={errors.products_other}
                    placeholder="Please specify the product/service"
                  />
                </FieldGroup>
              )}

              <FieldGroup label={`${fields.products === "OTHERS" ? "10." : "9."} Additional Notes`}>
                <PlainInput
                  type="text" name="additional_notes" value={fields.additional_notes}
                  onChange={handleChange}
                  placeholder="Please add any relevant info that may help Inbound team"
                  style={{ fontStyle: "italic" }}
                />
              </FieldGroup>

              {/* ANTDing Staff ID */}
              <FieldGroup
                label={`${fields.products === "OTHERS" ? "11." : "10."} ANTDing Staff ID`}
                required
                error={errors.antding_staff_id}
                sublabel="Find the Job ID via profile settings in the ANTDing app."
              >
                <PlainInput
                  type="text" name="antding_staff_id" value={fields.antding_staff_id}
                  onChange={handleChange} placeholder="e.g. 123456"
                />
              </FieldGroup>

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
