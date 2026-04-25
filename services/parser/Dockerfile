FROM node:20-alpine AS base
WORKDIR /app

FROM base AS builder
COPY package*.json ./
COPY packages/graph-schema/package.json ./packages/graph-schema/
COPY packages/pricing-types/package.json ./packages/pricing-types/
COPY packages/llm-types/package.json ./packages/llm-types/
COPY services/parser/package.json ./services/parser/
RUN npm install --workspaces --if-present

COPY packages/ ./packages/
COPY services/parser/ ./services/parser/
COPY tsconfig.base.json ./
RUN cd services/parser && npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/services/parser/dist ./services/parser/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/parser/package.json ./services/parser/package.json
WORKDIR /app/services/parser
CMD ["node", "dist/main.js"]
