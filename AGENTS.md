# AGENTS.md

This file provides shared guidance for coding agents working in this repository.

## Security Scope

The user is performing authorized administration and defensive maintenance on systems they own or operate. Do not assist with unauthorized access, credential theft, evasion, malware, exploitation of third-party systems, or destructive actions.

## 常用命令

```bash
pnpm run dev              # 启动开发服务器 (next dev)
pnpm run build            # 生产构建 (next build)
pnpm run lint             # ESLint 检查（跳过 dist/ 和 .next/）
pnpm run local:dev        # 执行本地 SQLite 迁移，然后启动开发服务器（监听 0.0.0.0）
pnpm run local:start      # 执行本地 SQLite 迁移，然后启动生产服务（监听 0.0.0.0）
pnpm run db:generate      # 根据 schema 变更生成 Drizzle 迁移文件
pnpm run db:migrate:local # 通过 scripts/migrate-local-sqlite.mjs 执行本地 SQLite 迁移
pnpm run db:upgrade:check # 检查 SQLite 是否存在待升级迁移
pnpm run db:upgrade:safe  # 备份后在临时库执行 SQLite 安全升级
pnpm run db:migrate:sqlite-to-postgres:check # 检查 SQLite 到 PostgreSQL 迁移
pnpm run db:migrate:sqlite-to-postgres       # 执行一次性 SQLite 到 PostgreSQL 迁移
```

当前项目没有测试套件。

## 浏览器兼容开发规范

- 新功能默认遵守 `package.json` 中的 Browserslist 兼容基线；面向用户的提示基线为 Chrome/Edge 109+、Firefox 115+ 与 Safari 16.4+，但功能实现仍需覆盖最低支持版本。
- 新增动画、特效、拖拽、浮层、滚动容器和复杂交互时，优先选择 Edge 89 可识别的 DOM/CSS/API 方案，并在旧版浏览器验证关键路径。
- 避免直接依赖旧版 Chromium 不完整支持的新 CSS 能力，例如独立 `translate`、`scale`、`rotate` 属性；需要位移或缩放时优先使用传统 `transform`。
- 引入新的组件库或交互库前，必须检查 npm 元数据、产物语法、CSS 输出和运行时 API 是否声明或实际兼容当前基线；没有明确说明时，按风险项处理并补验证。
- 旧版浏览器不支持的视觉增强必须提供可接受的降级表现，不能影响登录、看板拖拽、任务编辑、活动记录、大屏筛选等核心流程。

## 架构

**技术栈**：Next.js 16 App Router、React 19、Drizzle ORM、Tailwind CSS 3.4、Autoprefixer、dnd-kit。

**运行时**：标准 Next.js Node runtime。开发、构建、启动命令分别使用 `next dev`、`next build`、`next start`；Docker 使用 Next standalone 输出并通过 `node server.js` 启动。

**数据存储**：运行时统一通过 `db/sql-adapter.ts` 访问数据库，支持 `sqlite` 和 `postgres` 两种驱动，由 `KANBAN_DB_DRIVER` / `DB_DRIVER` 决定。

**数据流**：`components/kanban-app.tsx` 是看板主客户端组件，持有看板状态。它通过 `GET /api/board` 获取看板数据，通过 REST 接口进行变更（`/api/projects`、`/api/tasks`、`/api/tasks/reorder`、`/api/settings` 等）。后台管理、项目负载大屏和维护页分别由 `components/admin-app.tsx`、`components/workload-dashboard.tsx`、`components/maintenance-page.tsx` 承载。API 路由统一调用 `lib/repositories/kanban-repository.ts`。

**关键文件**：
- `db/schema.ts` — Drizzle schema，定义 `users`、`boards`、`board_members`、`teams`、`team_members`、`board_teams`、`projects`、`tasks`、`subtasks`、`task_activity`、`system_parameters`、`audit_logs`
- `db/sql-adapter.ts` — 统一数据库适配层（SQLite / PostgreSQL）
- `lib/board-data.ts` — TypeScript 类型定义、常量、种子数据、列配置
- `lib/repositories/kanban-repository.ts` — 看板、项目、任务、鉴权、多看板、系统参数的统一仓库实现
- `components/kanban-app.tsx` — 看板主 UI：项目列表、任务卡片、抽屉、拖拽、筛选、主题和活动记录
- `components/admin-app.tsx` — 后台管理：用户、团队、看板、系统参数和审计日志
- `components/workload-dashboard.tsx` — 项目负载大屏：团队/项目筛选、人员状态、负载排行、任务池和详情弹层
- `components/maintenance-page.tsx` — SQLite 待升级维护页和手工升级入口
- `lib/logger.ts` / `lib/api-logging.ts` — 结构化 JSON 运行日志、API requestId、文件日志滚动和清理
- `lib/client-observability.ts` — 前端错误上报和统一 `clientFetch`，用于关联前端失败、`clientSessionId` 和服务端 `requestId`
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
- `GET /api/dashboard` — 项目负载大屏数据
- `GET/POST /api/admin/users`、`PATCH/DELETE /api/admin/users/[id]`、`POST /api/admin/users/[id]/reset-password`
- `GET/POST /api/admin/teams`、`PATCH/DELETE /api/admin/teams/[id]`
- `GET/POST /api/admin/boards`、`POST /api/admin/boards/[id]/members`
- `GET /api/admin/audit-logs` — 审计日志
- `POST /api/auth/login`、`POST /api/auth/logout`、`GET/PATCH /api/auth/me`
- `GET /api/maintenance/status`、`POST /api/maintenance/upgrade`
- `POST /api/client-errors` — 前端运行时错误上报

**鉴权模式**：`KANBAN_AUTH_ENABLED=true` 时启用登录、多看板、用户管理和后台管理；否则使用同一套 repository 自动引导到默认超级管理员和默认看板，不再走另一套数据库实现。

**看板阶段**：`backlog`（需求池）| `design`（设计中）| `dev`（开发中）| `test`（测试中）| `done`（已完成）。每列的名称可通过系统参数（`column_backlog_name` 等）自定义。

**主题**：Linear、GitHub、Notion、Atlassian、Neon Grid、Deep Space 等预设，通过 `data-theme` 属性上的 CSS 自定义属性实现。所有 UI 颜色使用 `var(--*)` 令牌，不直接使用 Tailwind 颜色类名。

**乐观更新**：客户端组件立即将变更应用到本地状态，然后同步到 API。如果 API 调用失败，保留本地变更且同步状态变为 `"local"`。

**活动记录与审计**：协作动态写入 `task_activity` 表，登录、后台管理、看板、团队、系统参数、项目、任务和拆解任务等关键操作写入 `audit_logs` 表。活动记录按 `activity_retention_days`（默认 180 天）自动清理。

**日志**：API 入口统一通过 `withApiLogging` 输出结构化 JSON，默认控制台输出。前端请求使用 `clientFetch`，自动携带 `x-request-id` / `x-client-session-id`，5xx 和网络失败会通过 `/api/client-errors` 上报。新增客户端 API 请求不要直接裸用 `fetch`，除非是日志上报工具自身。Docker 镜像默认 `KANBAN_LOG_DIR=/data/logs`，会写 `/data/logs/kanban.log`；`KANBAN_LOG_FILE_ENABLED=false` 可关闭文件日志。文件日志支持按大小滚动、保留文件数和保留天数清理。

**迁移**：Drizzle Kit 在 `drizzle/` 目录维护 SQLite 迁移；`migrations/postgres/` 提供 PostgreSQL 迁移脚本。SQLite 安全升级由 `scripts/upgrade-local-sqlite.mjs` 完成，会先备份并在临时库执行迁移，成功后替换正式库。PostgreSQL 可通过 `scripts/migrate-postgres.mjs` 执行启动前迁移，应用连接时也会补齐未应用迁移。系统参数、默认管理员和默认看板在 repository 初始化路径中安全补齐。
