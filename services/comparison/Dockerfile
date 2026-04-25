FROM node:20-alpine AS base
WORKDIR /app

FROM base AS builder
COPY package*.json ./
COPY packages/graph-schema/package.json ./packages/graph-schema/
COPY packages/pricing-types/package.json ./packages/pricing-types/
COPY services/comparison/package.json ./services/comparison/
RUN npm install --workspaces --if-present

COPY packages/ ./packages/
COPY services/comparison/ ./services/comparison/
COPY tsconfig.base.json ./
RUN cd services/comparison && npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/services/comparison/dist ./services/comparison/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/comparison/package.json ./services/comparison/package.json
WORKDIR /app/services/comparison
RUN mkdir -p /app/data/snapshots && chown -R appuser /app/data
USER appuser
EXPOSE 3003
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- http://localhost:3003/health || exit 1
CMD ["node", "dist/main.js"]
