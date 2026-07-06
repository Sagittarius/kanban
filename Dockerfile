# 阶段1: 依赖安装
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 阶段2: 构建
FROM deps AS builder
COPY . .
RUN pnpm run build

# 阶段3: 生产依赖，供启动前迁移脚本使用
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# 阶段4: 标准 Next standalone 运行时
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV KANBAN_LOG_DIR=/data/logs
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl iputils-ping vim-tiny \
  && rm -rf /var/lib/apt/lists/*
ARG KANBAN_APP_VERSION=1.5.2
ARG KANBAN_IMAGE_TAG=kanban:unknown
ENV KANBAN_APP_VERSION=${KANBAN_APP_VERSION}
ENV KANBAN_IMAGE_TAG=${KANBAN_IMAGE_TAG}

COPY --from=builder /app/.next/standalone ./
RUN mv /app/server.js /app/next-server.js
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/CHANGELOG.md ./CHANGELOG.md
COPY --from=prod-deps /app/node_modules ./node_modules

RUN mkdir -p /data/logs
RUN chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["sh", "/app/scripts/docker-entrypoint.sh"]
