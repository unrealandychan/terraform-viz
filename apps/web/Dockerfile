FROM node:20-alpine AS base
WORKDIR /app

FROM base AS builder
COPY package*.json ./
COPY packages/graph-schema/package.json ./packages/graph-schema/
COPY packages/pricing-types/package.json ./packages/pricing-types/
COPY packages/llm-types/package.json ./packages/llm-types/
COPY apps/web/package.json ./apps/web/
RUN npm install --workspaces --if-present

COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY tsconfig.base.json ./
RUN cd apps/web && npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
# Standalone Next.js output
COPY --from=builder --chown=appuser:appgroup /app/apps/web/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=appuser:appgroup /app/apps/web/public ./apps/web/public
WORKDIR /app
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
