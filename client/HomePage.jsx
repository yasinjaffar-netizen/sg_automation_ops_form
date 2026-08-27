import { useEffect } from "react";
import "./home.css";

const FORMS = [
  {
    title: "Referral Form",
    desc: "Submit a customer referral — Sales' own, Merchant or BCRS.",
    href: "/",
    external: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M22 11h-6" />
      </svg>
    ),
  },
  {
    title: "Internal Referral Form",
    desc: "Refer a lead from another team, or from / to the MA channel.",
    href: "/interteam",
    external: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3 4 7l4 4" />
        <path d="M4 7h16" />
        <path d="m16 21 4-4-4-4" />
        <path d="M20 17H4" />
      </svg>
    ),
  },
  {
    title: "Refund Form",
    desc: "Request a customer refund. Opens the WorkApp form in a new tab.",
    href: "https://workapp.antgroup-inc.cn/app/75458094/form/f9db4621d66afcaba",
    external: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
        <path d="M12 17.5v-11" />
      </svg>
    ),
  },
  {
    title: "EPOS Jobsheet Form",
    desc: "Deployment jobsheet for a signed deal — creates a HubSpot ticket.",
    href: "/jobsheet",
    external: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
];

export default function HomePage() {
  useEffect(() => {
    document.title = "EPOS Sales Operations — Forms";
  }, []);

  return (
    <div className="home-root">
      <div className="home-shell">
        <header className="home-header">
          <img src="/logo.webp" alt="EPOS" className="home-logo" />
          <h1 className="home-title">Sales Operations</h1>
          <p className="home-subtitle">Choose a form to get started.</p>
        </header>

        <div className="home-grid">
          {FORMS.map((f) => (
            <a
              key={f.title}
              className="home-card"
              href={f.href}
              {...(f.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <span className="home-card-icon">{f.icon}</span>
              <span className="home-card-body">
                <span className="home-card-title">
                  {f.title}
                  {f.external && (
                    <svg className="home-card-ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="opens in a new tab">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <path d="M15 3h6v6M10 14 21 3" />
                    </svg>
                  )}
                </span>
                <span className="home-card-desc">{f.desc}</span>
              </span>
              <svg className="home-card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          ))}
        </div>

        <footer className="home-footer">EPOS Sales Operations · Internal use only</footer>
      </div>
    </div>
  );
}
