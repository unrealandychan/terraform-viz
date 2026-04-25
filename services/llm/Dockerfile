FROM node:20-alpine AS base
WORKDIR /app

FROM base AS builder
COPY package*.json ./
COPY packages/graph-schema/package.json ./packages/graph-schema/
COPY packages/pricing-types/package.json ./packages/pricing-types/
COPY packages/llm-types/package.json ./packages/llm-types/
COPY services/llm/package.json ./services/llm/
RUN npm install --workspaces --if-present

COPY packages/ ./packages/
COPY services/llm/ ./services/llm/
COPY tsconfig.base.json ./
RUN cd services/llm && npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/services/llm/dist ./services/llm/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/llm/package.json ./services/llm/package.json
WORKDIR /app/services/llm
CMD ["node", "dist/main.js"]
