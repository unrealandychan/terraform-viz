# Downloads the official Terraform portable binary at build time.
# Set TERRAFORM_VERSION to pin a specific release.
ARG TERRAFORM_VERSION=1.6.6

FROM node:20-alpine AS base
WORKDIR /app

# Install unzip (needed to extract uploaded archives) and curl (for binary download)
RUN apk add --no-cache unzip curl

# Download and verify the Terraform portable binary
ARG TERRAFORM_VERSION
RUN curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" \
      -o /tmp/terraform.zip \
    && unzip -q /tmp/terraform.zip -d /usr/local/bin \
    && rm /tmp/terraform.zip \
    && chmod +x /usr/local/bin/terraform \
    && terraform version

FROM base AS builder
COPY package*.json ./
COPY apps/terraform-worker/package.json ./apps/terraform-worker/
RUN npm install --workspaces --if-present

COPY apps/terraform-worker/ ./apps/terraform-worker/
COPY tsconfig.base.json ./
RUN cd apps/terraform-worker && npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/apps/terraform-worker/dist ./apps/terraform-worker/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/terraform-worker/package.json ./apps/terraform-worker/package.json
WORKDIR /app/apps/terraform-worker
USER appuser
EXPOSE 3005
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=15s \
  CMD wget -qO- http://localhost:3005/health || exit 1
CMD ["node", "dist/main.js"]
