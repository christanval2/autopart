# ── Stage 1 : base ────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache tini
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── Stage 2 : development ─────────────────────────────────────────
FROM base AS development
RUN npm ci --ignore-scripts
COPY tsconfig*.json ./
COPY src ./src
COPY migrations ./migrations
EXPOSE 3000
CMD ["npx", "ts-node-dev", "--respawn", "--transpile-only", "src/server.ts"]

# ── Stage 3 : builder ─────────────────────────────────────────────
FROM development AS builder
RUN npm run build

# ── Stage 4 : production ──────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=base /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Utilisateur non-root
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs appuser
USER appuser

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
