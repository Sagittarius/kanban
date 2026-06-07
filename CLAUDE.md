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

**技术栈**：`vinext`（Cloudflare 出品的兼容 Next.js 的元框架，运行在 Workers 上）、React 19、Drizzle ORM、Tailwind CSS v4、dnd-kit。

**双模式存储**：应用同时支持 Cloudflare Workers（使用 D1）和内网部署（使用 `node:sqlite` / `DatabaseSync`）。`db/index.ts` 中的 `getDb()` 函数在运行时检测环境，返回对应的 Drizzle 实例。本地 D1 兼容层将 `node:sqlite` 封装为 D1 的 API 接口。

**数据流**：`components/kanban-app.tsx` 是唯一的客户端组件，持有全部状态。它通过 `GET /api/board` 获取看板数据，通过 REST 接口进行变更（`/api/projects`、`/api/tasks`、`/api/tasks/reorder`、`/api/settings` 等）。API 路由是 `lib/board-store.ts` 中函数的薄封装。

**关键文件**：
- `db/schema.ts` — Drizzle schema，定义 `projects`、`tasks`、`subtasks`、`task_activity`、`system_parameters` 五张表
- `db/index.ts` — 双模式数据库客户端（Cloudflare D1 vs 本地 SQLite）
- `lib/board-data.ts` — TypeScript 类型定义、常量、种子数据、列配置
- `lib/board-store.ts` — 全部 CRUD 操作、活动记录、迁移数据填充、系统参数管理
- `components/kanban-app.tsx` — 整个 UI 作为一个大型客户端组件（约 2500 行）：看板列、任务卡片、抽屉、拖拽、筛选、主题
- `app/page.tsx` — 服务端组件，渲染 `KanbanApp` 并传入初始种子数据和中国时区的当天日期
- `scripts/migrate-local-sqlite.mjs` — 独立的 Node.js 脚本，将 Drizzle SQL 迁移应用到本地 SQLite

**API 路由**（Next.js route handlers）：
- `GET /api/board` — 完整看板状态（项目、任务含子任务、活动记录、系统设置）
- `GET/POST /api/projects`、`PATCH/DELETE /api/projects/[id]`
- `GET/POST /api/tasks`、`PATCH/DELETE /api/tasks/[id]`
- `POST /api/tasks/reorder` — 拖拽后的批量状态/排序更新
- `POST /api/tasks/[id]/subtasks`、`PATCH/DELETE /api/tasks/[id]/subtasks/[subtaskId]`
- `GET/PATCH /api/settings` — 系统参数读写
- `GET /api/activity` — 活动记录

**看板阶段**：`backlog`（需求池）| `dev`（开发中）| `test`（测试中）| `done`（已完成）。每列的名称可通过系统参数（`column_backlog_name` 等）自定义。

**主题**：四套预设（Linear、GitHub、Notion、Atlassian），通过 `data-theme` 属性上的 CSS 自定义属性实现。所有 UI 颜色使用 `var(--*)` 令牌，不直接使用 Tailwind 颜色类名。

**乐观更新**：客户端组件立即将变更应用到本地状态，然后同步到 API。如果 API 调用失败，保留本地变更且同步状态变为 `"local"`。看板始终先用 `createSeedBoard()` 渲染，确保页面瞬间呈现。

**活动记录**：所有变更操作（创建/更新/删除/归档/恢复）都会在 `task_activity` 表中写入一条记录。纯拖拽排序不改变阶段时不写活动记录。活动记录按 `activity_retention_days`（默认 180 天）自动清理，每小时最多执行一次。

**迁移**：Drizzle Kit 在 `drizzle/` 目录生成 SQL 文件。本地 SQLite 首次访问数据库时自动执行未应用的迁移。Cloudflare D1 使用 `wrangler d1 migrations apply`。系统参数在首次访问时自动填充默认值。
