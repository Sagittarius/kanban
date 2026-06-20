# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
pnpm run dev              # 启动开发服务器 (vinext dev)
pnpm run build            # 生产构建 (vinext build)
pnpm run lint             # ESLint 检查（跳过 dist/ 和 .next/）
pnpm run local:dev        # 执行本地 SQLite 迁移，然后启动开发服务器（监听 0.0.0.0）
pnpm run local:start      # 执行本地 SQLite 迁移，然后启动生产服务（监听 0.0.0.0）
pnpm run db:generate      # 根据 schema 变更生成 Drizzle 迁移文件
pnpm run db:migrate:local # 通过 scripts/migrate-local-sqlite.mjs 执行本地 SQLite 迁移
```

当前项目没有测试套件。

## 架构

**技术栈**：`vinext`、React 19、Drizzle ORM、Tailwind CSS v4、dnd-kit。

**数据存储**：主路径已移除 D1。运行时统一通过 `db/sql-adapter.ts` 访问数据库，支持 `sqlite` 和 `postgres` 两种驱动，由 `KANBAN_DB_DRIVER` / `DB_DRIVER` 决定。

**数据流**：`components/kanban-app.tsx` 是唯一的客户端组件，持有全部状态。它通过 `GET /api/board` 获取看板数据，通过 REST 接口进行变更（`/api/projects`、`/api/tasks`、`/api/tasks/reorder`、`/api/settings` 等）。API 路由统一调用 `lib/repositories/kanban-repository.ts`。

**关键文件**：
- `db/schema.ts` — Drizzle schema，定义 `users`、`boards`、`board_members`、`projects`、`tasks`、`subtasks`、`task_activity`、`system_parameters`
- `db/sql-adapter.ts` — 统一数据库适配层（SQLite / PostgreSQL）
- `lib/board-data.ts` — TypeScript 类型定义、常量、种子数据、列配置
- `lib/repositories/kanban-repository.ts` — 看板、项目、任务、鉴权、多看板、系统参数的统一仓库实现
- `components/kanban-app.tsx` — 整个 UI 作为一个大型客户端组件（约 2500 行）：看板列、任务卡片、抽屉、拖拽、筛选、主题
- `app/page.tsx` — 服务端组件，根据 `KANBAN_AUTH_ENABLED` 决定是否走登录态，再渲染 `KanbanApp`
- `scripts/migrate-local-sqlite.mjs` — 独立的 Node.js 脚本，将 Drizzle SQL 迁移应用到本地 SQLite

**API 路由**（Next.js route handlers）：
- `GET /api/board` — 完整看板状态（项目、任务含子任务、活动记录、系统设置）
- `GET/POST /api/projects`、`PATCH/DELETE /api/projects/[id]`
- `GET/POST /api/tasks`、`PATCH/DELETE /api/tasks/[id]`
- `POST /api/tasks/reorder` — 拖拽后的批量状态/排序更新
- `POST /api/tasks/[id]/subtasks`、`PATCH/DELETE /api/tasks/[id]/subtasks/[subtaskId]`
- `GET/PATCH /api/settings` — 系统参数读写
- `GET /api/activity` — 活动记录

**鉴权模式**：`KANBAN_AUTH_ENABLED=true` 时启用登录、多看板、用户管理和后台管理；否则使用同一套 repository 自动引导到默认超级管理员和默认看板，不再走另一套数据库实现。

**看板阶段**：`backlog`（需求池）| `dev`（开发中）| `test`（测试中）| `done`（已完成）。每列的名称可通过系统参数（`column_backlog_name` 等）自定义。

**主题**：四套预设（Linear、GitHub、Notion、Atlassian），通过 `data-theme` 属性上的 CSS 自定义属性实现。所有 UI 颜色使用 `var(--*)` 令牌，不直接使用 Tailwind 颜色类名。

**乐观更新**：客户端组件立即将变更应用到本地状态，然后同步到 API。如果 API 调用失败，保留本地变更且同步状态变为 `"local"`。

**活动记录**：所有变更操作（创建/更新/删除/归档/恢复）都会在 `task_activity` 表中写入一条记录。纯拖拽排序不改变阶段时不写活动记录。活动记录按 `activity_retention_days`（默认 180 天）自动清理，每小时最多执行一次。

**迁移**：Drizzle Kit 在 `drizzle/` 目录维护 SQLite 迁移；`migrations/postgres/` 提供 PostgreSQL 初始化脚本。SQLite 首次访问数据库时自动执行未应用迁移；PostgreSQL 首次连接时自动执行 `migrations/postgres/` 下的未应用脚本。系统参数和默认管理员/默认看板在首次访问时自动补齐。
