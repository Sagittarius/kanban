# 阶段1: 依赖安装
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 阶段2: 构建
FROM deps AS builder
COPY . .
RUN pnpm run build

# 阶段3: 运行时
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ARG KANBAN_APP_VERSION=0.0.0
ARG KANBAN_IMAGE_TAG=kanban:unknown
ENV KANBAN_APP_VERSION=${KANBAN_APP_VERSION}
ENV KANBAN_IMAGE_TAG=${KANBAN_IMAGE_TAG}

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /data
RUN chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 3000

CMD ["sh", "/app/scripts/docker-entrypoint.sh"]
