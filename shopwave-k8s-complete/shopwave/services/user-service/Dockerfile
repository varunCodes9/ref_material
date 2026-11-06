# ── Stage 1: Dependencies ─────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# ── Stage 2: Production image ─────────────────────────────────
FROM node:20-alpine AS runner
# Non-root user (K8s security context ke saath match karta hai)
RUN addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001

WORKDIR /app
COPY --from=deps --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --chown=nodeuser:nodejs . .

USER nodeuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/index.js"]
