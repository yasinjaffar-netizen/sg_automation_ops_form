# ─── Leads Data Migration Dockerfile (Web Scrape batch, 2026-08-21) ───────────
#
# PREREQUISITES:
#   insert_leads_web_scrape_2026-08-21.sql is pre-generated from
#   merged_leads_2026-08-21.csv (see New_web_scrape_data/merge_and_dedupe.py
#   and New_web_scrape_data/generate_insert.py in the main repo). Regenerate
#   it if the source CSV changes, then rebuild.
#
# BUILD:
#   docker build -t leads-migration-web-scrape .
#
# RUN:
#   docker run --rm \
#     -e DB_HOST=<host> \
#     -e DB_PORT=5432 \
#     -e DB_USER=<user> \
#     -e DB_PASSWORD=<password> \
#     -e DB_NAME=epos_sales \
#     leads-migration-web-scrape
ARG REPO_PUBLIC=reg.docker.alibaba-inc.com/alipay/
FROM ${REPO_PUBLIC}7u2-common-custom:postgres-16-alpine.0406

WORKDIR /app

# Copy pre-generated SQL file(s) (insert_leads_web_scrape_2026-08-21.sql)
COPY *.sql ./

# Copy and register entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
