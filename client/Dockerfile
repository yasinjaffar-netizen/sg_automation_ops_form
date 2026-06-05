# ────────────────────────────────────────────────────────────────
# EPOS Referral - React Frontend (Multi-stage build)
# ────────────────────────────────────────────────────────────────

# ─── Stage 1: Build the React app ─────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./

# Use Alibaba npm mirror — faster installs on ECS (Alibaba Cloud network)
RUN npm config set registry https://registry.npmmirror.com && npm ci --prefer-offline

COPY . .

# VITE_API_URL="" → all fetch() calls use relative paths (/api/...)
# Nginx proxies those to the backend container — no hardcoded URLs in the build
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ─── Stage 2: Serve with Nginx ────────────────────────────────
FROM nginx:1.27-alpine

RUN rm -rf /usr/share/nginx/html/*

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
