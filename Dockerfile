FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

ENV PORT=3000
ENV KANBAN_SQLITE_PATH=/data/kanban.sqlite
ENV NODE_ENV=production

RUN pnpm run build

RUN mkdir -p /data

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate-local-sqlite.mjs && node_modules/.bin/vinext start --hostname 0.0.0.0"]
