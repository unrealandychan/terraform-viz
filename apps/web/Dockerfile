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
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
WORKDIR /app/apps/web
CMD ["npm", "start"]
