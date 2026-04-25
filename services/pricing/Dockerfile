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
COPY pricing/ ./pricing/
COPY tsconfig.base.json ./
RUN cd services/pricing && npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/services/pricing/dist ./services/pricing/dist
COPY --from=builder /app/pricing ./pricing
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/pricing/package.json ./services/pricing/package.json
WORKDIR /app/services/pricing
CMD ["node", "dist/main.js"]
