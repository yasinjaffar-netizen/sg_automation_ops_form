# ────────────────────────────────────────────────────────────────
# EPOS Referral — FastAPI Backend (Multi-stage build)
# ────────────────────────────────────────────────────────────────

# ─── Stage 1: compile dependencies ────────────────────────────
FROM python:3.12-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Use Alibaba mirror — significantly faster on ECS (Alibaba Cloud network)
ENV PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
RUN pip install --no-cache-dir --user --trusted-host mirrors.aliyun.com -r requirements.txt

# ─── Stage 2: lean runtime (no build tools) ───────────────────
FROM python:3.12-slim

WORKDIR /app

COPY --from=builder /root/.local /home/appuser/.local
COPY . .

RUN useradd -m -u 1001 appuser && chown -R appuser /app /home/appuser/.local
USER appuser
ENV PATH=/home/appuser/.local/bin:$PATH

EXPOSE 8000

# Healthcheck hits /health (checks DB connectivity), not /
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# --proxy-headers + --forwarded-allow-ips: trust X-Forwarded-* from Nginx
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
