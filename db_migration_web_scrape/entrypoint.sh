#!/bin/sh
set -e

# ─── Validate required env vars ──────────────────────────────────────────────
: "${DB_HOST:?DB_HOST is required}"
: "${DB_PORT:?DB_PORT is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${DB_NAME:?DB_NAME is required}"

export PGPASSWORD="$DB_PASSWORD"

echo "============================================"
echo " Importing leads (web scrape 2026-08-21) to PolarDB"
echo " Host: $DB_HOST:$DB_PORT / DB: $DB_NAME"
echo "============================================"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
     -v ON_ERROR_STOP=1 \
     -c "SET synchronous_commit = off;" \
     -c "SET work_mem = '256MB';" \
     -f insert_leads_web_scrape_2026-08-21.sql

echo ""
echo "============================================"
echo " leads import complete!"
echo "============================================"
