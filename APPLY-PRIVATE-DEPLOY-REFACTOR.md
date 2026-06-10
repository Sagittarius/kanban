# 应用私有化部署重构覆盖包

将本覆盖包解压到 `Sagittarius/kanban` 仓库根目录：

```bash
tar -xzf kanban-private-deploy-refactor-overlay.tar.gz -C /path/to/kanban
cd /path/to/kanban
pnpm install --no-frozen-lockfile
pnpm run build
```

SQLite Docker：

```bash
docker compose -f docker-compose.sqlite.yml up -d --build
```

PostgreSQL Docker：

```bash
docker compose -f docker-compose.postgres.yml up -d --build
```

注意：本重构新增 `pg` 依赖。若你的 CI 使用 `pnpm install --frozen-lockfile`，请在联网环境中执行一次 `pnpm install` 并提交更新后的 `pnpm-lock.yaml`。
