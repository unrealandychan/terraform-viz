FROM node:20-alpine AS base
WORKDIR /app

FROM base AS builder
COPY package*.json ./
COPY packages/graph-schema/package.json ./packages/graph-schema/
COPY packages/pricing-types/package.json ./packages/pricing-types/
COPY services/pricing/package.json ./services/pricing/
RUN npm install --workspaces --if-present

COPY packages/ ./packages/
COPY services/pricing/ ./services/pricing/
COPY tsconfig.base.json ./
# Copy optional pricing catalog data if it exists
COPY pricing/ ./pricing/ 2>/dev/null || true
RUN cd services/pricing && npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/services/pricing/dist ./services/pricing/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/pricing/package.json ./services/pricing/package.json
# Copy catalog data if present
COPY --from=builder /app/pricing ./pricing
WORKDIR /app/services/pricing
USER appuser
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- http://localhost:3002/health || exit 1
CMD ["node", "dist/main.js"]
