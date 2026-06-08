FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

ENV PORT=3000
ENV NODE_ENV=production

RUN pnpm run build

RUN mkdir -p /data

EXPOSE 3000

CMD ["sh", "-c", "\
  if [ \"$KANBAN_DB_DRIVER\" = 'postgres' ]; then \
    echo 'Running PostgreSQL migrations...'; \
    node scripts/migrate-postgres.mjs; \
  else \
    echo 'Running SQLite migrations...'; \
    node scripts/migrate-local-sqlite.mjs; \
  fi && \
  node_modules/.bin/vinext start --hostname 0.0.0.0"]
