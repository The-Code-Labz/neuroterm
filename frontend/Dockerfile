FROM node:20-alpine AS builder

WORKDIR /app

# Declare build arg so Vite can see it at build time
ARG VITE_AUTH_TOKEN
ENV VITE_AUTH_TOKEN=${VITE_AUTH_TOKEN}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
