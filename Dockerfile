# ─── Frontend Dockerfile ──────────────────────────────────────────────────────
# Stage 1: build the React app
ARG REPO_PUBLIC=reg.docker.alibaba-inc.com/alipay/
FROM ${REPO_PUBLIC}7u2-common-custom:node-20-slim.0406 AS builder

WORKDIR /app

# Install dependencies first (cached layer if package files unchanged)
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com
RUN npm ci --prefer-offline

COPY . .

# VITE_API_URL="" → all fetch() calls use relative paths (e.g. /leads, /auth/…)
# Nginx then proxies those paths to the backend container.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build


# ─── Stage 2: serve with Nginx ────────────────────────────────────────────────
FROM ${REPO_PUBLIC}7u2-common-custom:nginx-1.27-alpine.0406 AS runtime

# Remove the default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy built React app
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom Nginx config (SPA routing + API proxy)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
