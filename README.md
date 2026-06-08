# EPOS Referral System

A full-stack referral management system for the EPOS Sales Operations team. Sales reps (BDs) and internal teams submit referrals via web forms; the system persists submissions to PolarDB (PostgreSQL) and automatically creates linked Contact, Company and Deal records in HubSpot CRM.

---

## Repository Structure

```
epos-referral/
├── client/               # React frontend
│   ├── App.jsx           # Main Referral Form (OWN, MERCHANT, BCRS)
│   ├── InterTeamForm.jsx # Internal Referral Form (INTERNAL, MA)
│   ├── shared.css        # Shared styling
│   ├── main.jsx          # React entry point
│   ├── public/           # Static assets (logo, favicon)
│   ├── vite.config.js
│   ├── nginx.conf        # Nginx config (serves SPA + proxies /api/ to backend)
│   └── Dockerfile
├── server/               # FastAPI backend
│   ├── main.py           # API endpoints + PolarDB + HubSpot CRM
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

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

| Variable                | Description                                    |
|-------------------------|------------------------------------------------|
| `HUBSPOT_ACCESS_TOKEN`  | HubSpot Private App token                      |
| `PG_HOST`               | PolarDB endpoint hostname                      |
| `PG_PORT`               | PostgreSQL port (default: 5432)                |
| `PG_DB`                 | Database name                                  |
| `PG_USER`               | Database user                                  |
| `PG_PASSWORD`           | Database password                              |
| `PG_SSL_MODE`           | SSL mode (default: `require` for PolarDB)      |

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

| Method | Endpoint                   | Description                   |
|--------|----------------------------|-------------------------------|
| GET    | `/`                        | Health check                  |
| POST   | `/api/referral`            | Submit main referral form     |
| POST   | `/api/interteam-referral`  | Submit internal referral form |

---

## Owner

Kalaivani, Business OPS Analyst EPOS
