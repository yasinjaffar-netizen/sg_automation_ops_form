# ─── Backend Dockerfile ───────────────────────────────────────────────────────## Stage 1: install all dependencies
ARG REPO_PUBLIC=reg.docker.alibaba-inc.com/alipay/
FROM ${REPO_PUBLIC}7u2-common-custom:python-3.12-slim.0406 AS deps

WORKDIR /install

# Install system dependencies (libpq for PostgreSQL)
RUN echo "deb https://mirrors.aliyun.com/debian/ trixie main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    echo "deb https://mirrors.aliyun.com/debian/ trixie-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
    echo "deb https://mirrors.aliyun.com/debian-security/ trixie-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
    rm -f /etc/apt/sources.list.d/*.sources && \
    apt-get update && apt-get install -y --no-install-recommends libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

ENV PIP_INDEX_URL=http://mirrors.aliyun.com/pypi/simple/

COPY requirements.txt .
RUN pip install --no-cache-dir --trusted-host mirrors.aliyun.com -r requirements.txt


# ─── Stage 2: runtime (inherits from deps — uvicorn already installed) ────────
FROM deps AS runtime

WORKDIR /app

# Copy application source
COPY . .

# Non-root user for security
RUN useradd -m -u 1001 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--forwarded-allow-ips", "*", \
     "--proxy-headers"]
