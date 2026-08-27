# EPOS Referral System

A full-stack referral management system for the EPOS Sales Operations team. Sales reps (BDs) and internal teams submit referrals via web forms; the system persists submissions to PolarDB (PostgreSQL) and automatically creates linked Contact, Company and Deal records in HubSpot CRM.

The same deployment also serves the **Deployment Jobsheet Form** at `/jobsheet` — a
separate form that searches an existing HubSpot Deal, auto-fills Contact/Company,
and on submit creates a HubSpot **Ticket** (plus a jobsheet PDF and DingTalk/email
notifications). It uses its own HubSpot Service Key (`HUBSPOT_JOBSHEET_TOKEN`) and
has no database — HubSpot is the system of record.

---

## Repository Structure

```
epos-referral/
├── client/               # React frontend
│   ├── App.jsx           # Main Referral Form (OWN, MERCHANT, BCRS)
│   ├── InterTeamForm.jsx # Internal Referral Form (INTERNAL, MA)
│   ├── JobsheetForm.jsx  # Deployment Jobsheet Form (/jobsheet — HubSpot Tickets)
│   ├── formSchema.js     # Jobsheet field/option lists + hardware config
│   ├── api.js            # Jobsheet API client
│   ├── jobsheet.css      # Jobsheet styling (all scoped under .jobsheet-root)
│   ├── shared.css        # Shared styling (referral forms)
│   ├── main.jsx          # React entry point (path → App / InterTeamForm / JobsheetForm)
│   ├── public/           # Static assets (logo, favicon)
│   ├── vite.config.js
│   ├── nginx.conf        # Nginx config (serves SPA + proxies /api/ to backend)
│   └── Dockerfile
├── server/               # FastAPI backend
│   ├── main.py           # Referral API + PolarDB + HubSpot CRM; mounts jobsheet router
│   ├── jobsheet.py       # Jobsheet APIRouter — HubSpot Tickets + PDF + DingTalk/email
│   ├── requirements.txt  # Python dependencies
│   └── Dockerfile
├── docker-compose.yml    # Full-stack orchestration (ECS deployment)
├── .env                  # Secrets — never commit this
├── .env.example          # Required variables reference
└── README.md
```

---

## Form Routes

| Path         | Form                                        |
|--------------|---------------------------------------------|
| `/`          | Main Referral Form (for Sales reps)         |
| `/interteam` | Internal Referral Form (for internal/MA)    |
| `/jobsheet`  | Deployment Jobsheet Form (creates HubSpot Tickets) |

---

## Tech Stack

**Frontend**
- React 19 + Vite
- Vanilla CSS (no UI library)
- Served by Nginx inside Docker

**Backend**
- Python 3.12 + FastAPI
- Uvicorn server (Docker)
- Deployed on Alibaba Cloud ECS

**Data Storage**
- PolarDB PostgreSQL (Alibaba Cloud)
- Local JSON fallback (ephemeral, container only)

**Integrations**
- HubSpot CRM API
- fpdf2 (jobsheet PDF), DingTalk custom-bot + SMTP (jobsheet notifications)

---

## Jobsheet form (`/jobsheet`)

- Searches an existing HubSpot Deal, auto-fills Contact/Company, then collects
  ~90 deployment fields and creates a HubSpot **Ticket** (one custom property per
  field — `FIELD_PROPERTY_MAP` / `HARDWARE_PROPERTY_MAP` / `DELIVERY_STATUS_PROPERTY`
  in `server/jobsheet.py`). A mapped property that doesn't exist on the portal is
  skipped silently rather than failing the request; every submitted field is also
  in the jobsheet PDF and `server/jobsheets.json` (debug only, ephemeral).
- Frontend is scoped under `.jobsheet-root` so `jobsheet.css` cannot collide with
  the referral forms' `shared.css`.
- **Known gap:** `GET /api/search-deal` and `GET /api/deal-details/{id}` are
  unauthenticated and return Contact PII (name/phone/email). Restrict at the
  Ingress (IP allowlist) or add an API key before relying on this in production.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

| Variable                | Description                                    |
|-------------------------|------------------------------------------------|
| `HUBSPOT_ACCESS_TOKEN`  | HubSpot token for the referral forms (Contact/Company/Deal) |
| `PG_HOST`               | PolarDB endpoint hostname                      |
| `PG_PORT`               | PostgreSQL port (default: 5432)                |
| `PG_DB`                 | Database name                                  |
| `PG_USER`               | Database user                                  |
| `PG_PASSWORD`           | Database password                              |
| `PG_SSL_MODE`           | SSL mode (default: `require` for PolarDB)      |

**Jobsheet form** (`/jobsheet`) — separate HubSpot Service Key + settings:

| Variable                     | Description                                             |
|------------------------------|--------------------------------------------------------|
| `HUBSPOT_JOBSHEET_TOKEN`     | HubSpot Service Key for the jobsheet form (Tickets, Files, Owners) |
| `HUBSPOT_TICKET_PIPELINE_ID` | Ticket pipeline the jobsheet ticket lands in           |
| `HUBSPOT_TICKET_STAGE_ID`    | Ticket stage within that pipeline                      |
| `DEFAULT_TICKET_OWNER_ID`    | HubSpot owner every jobsheet ticket is assigned to     |
| `DINGTALK_WEBHOOK_URL`       | Custom-bot webhook for the "new jobsheet" notification (optional) |
| `DINGTALK_SECRET`            | Only if the DingTalk bot uses "Add Sign" security      |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `EMAIL_FROM` / `EMAIL_NOTIFY_TO` | Email notification per jobsheet (optional — blank `SMTP_HOST`/`EMAIL_NOTIFY_TO` skips email) |

---

## Local Development

```bash
# 1. Start the backend
cd server
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 2. Start the frontend (separate terminal)
cd client
npm install
npm run dev
```

Frontend: http://localhost:5173 — Vite proxies `/api/*` to the backend automatically.

---

## Deployment (Alibaba Cloud ECS)

```bash
# On your ECS instance
git pull
docker compose up --build -d

# Check logs
docker compose logs -f
```

Nginx (port 80) is publicly accessible. FastAPI (port 8000) is internal only — only reachable from Nginx inside the Docker network.

---

## Referral Types

| Type      | Form              | Deal Stage             |
|-----------|-------------------|------------------------|
| OWN       | Main Referral     | Outbound Lead (For BDs)|
| MERCHANT  | Main Referral     | Outbound Lead (For BDs)|
| BCRS      | Main Referral     | Outbound Lead (For BDs)|
| INTERNAL  | Internal Referral | New Inbound            |
| MA        | Internal Referral | New Inbound            |

---

## API Endpoints

| Method | Endpoint                       | Description                        |
|--------|--------------------------------|------------------------------------|
| GET    | `/`                            | Health check                       |
| GET    | `/health`                      | Health check (+ DB status)         |
| POST   | `/api/referral`                | Submit main referral form          |
| POST   | `/api/interteam-referral`      | Submit internal referral form      |
| GET    | `/api/search-deal?q=`          | Jobsheet: search HubSpot Deals     |
| GET    | `/api/deal-details/{deal_id}`  | Jobsheet: Deal + Contact + Company  |
| POST   | `/api/jobsheet`                | Jobsheet: create HubSpot Ticket    |

---

## Owner

Kalaivani, Business OPS Analyst EPOS
