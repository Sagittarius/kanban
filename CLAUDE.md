# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
pnpm run dev              # 启动开发服务器 (vinext dev)，默认 SQLite
pnpm run build            # 生产构建 (vinext build)
pnpm run lint             # ESLint 检查
pnpm run db:migrate:local # 通过 scripts/migrate-local-sqlite.mjs 执行本地 SQLite 迁移
pnpm run db:migrate:postgres # 通过 scripts/migrate-postgres.mjs 执行 PostgreSQL 迁移
pnpm run db:generate      # 根据 schema 变更生成 Drizzle 迁移文件
```

## 架构

**技术栈**：`vinext`（兼容 Next.js 的元框架）、React 19、Drizzle ORM、Tailwind CSS v4、dnd-kit。

**多数据库架构**：通过 `DatabaseAdapter` 接口抽象数据库，业务层通过 `KanbanRepository` 访问数据。支持 SQLite（默认）和 PostgreSQL 两种后端。通过 `KANBAN_DB_DRIVER` 环境变量选择。

**数据流**：`app/page.tsx` 服务端渲染登录页或看板，API 路由通过 `lib/repositories/kanban-repository.ts` 访问数据库，`lib/board-store.ts` 为兼容层。

**关键文件**：
- `db/index.ts` — DatabaseAdapter 抽象层，支持 sqlite/postgres
- `lib/repositories/kanban-repository.ts` — 业务 repository，用户/看板/项目/任务/活动 CRUD
- `lib/auth.ts`、`lib/password.ts`、`lib/server-session.ts` — 鉴权与会话
- `lib/timezone.ts` — 用户时区处理
- `components/authenticated-shell.tsx` — 前台看板/后台管理/看板切换外壳
- `components/login-page.tsx` — 离线登录页
- `components/admin-app.tsx` — 用户管理和看板授权后台

**新增 API 路由**：
- `POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`
- `GET/POST /api/admin/users`、`POST /api/admin/users/:id/reset-password`
- `GET /api/admin/boards`、`POST /api/admin/boards/:id/members`
- `GET/POST /api/boards`、`POST /api/boards/:id/select`

**迁移**：SQLite 迁移文件在 `drizzle/` 目录，PostgreSQL 在 `migrations/postgres/`。首次访问时自动执行未应用的迁移。系统参数、超级管理员、默认看板在首次启动时自动初始化。

**已移除技术栈**：不再支持 Cloudflare D1、Wrangler、Workers DB Binding。
