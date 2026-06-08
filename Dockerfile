FROM node:22-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --no-frozen-lockfile

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV KANBAN_DB_DRIVER=sqlite
COPY --from=builder /app ./
EXPOSE 3000
CMD ["sh", "-c", "if [ \"$KANBAN_DB_DRIVER\" = \"postgres\" ]; then node scripts/migrate-postgres.mjs; else node scripts/migrate-local-sqlite.mjs; fi && ./node_modules/.bin/vinext start --hostname 0.0.0.0"]
