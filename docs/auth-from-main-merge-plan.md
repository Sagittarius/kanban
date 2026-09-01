# Auth Merge Plan

> 历史文档：该计划记录 `feature/auth-from-main` 早期合并思路，当前功能已经进入 1.4.0 主线。实际功能说明、部署方式和环境变量以仓库根目录 `README.md`、`CLAUDE.md` 和当前代码为准。

## Goal

在 `main` 最新代码的基础上，引入以下能力，并在冲突时以 `main` 的现状为基线：

- 鉴权与登录
- 多看板与用户授权
- 多数据库与去除旧云数据库适配

## Principle

- 不在旧的 `feature/private-deploy-multidb-auth` 上继续修归并结果。
- 正确路径是基于 `main` 新建分支，再把私有化特性按模块移植。
- 当 `main` 与私有化分支存在同名功能冲突时，优先保留 `main` 的最近演进结果。

## Confirmed Functional Priority

1. 看板名称：
   - 以 `boards.name` 为准
   - 不再以系统参数 `board_title` 作为实际看板名来源
2. 任务模型：
   - 保留 `main` 当前的 5 阶段看板
   - 保留 `tester`
   - 保留 `designDueDate`
3. 运维能力：
   - 保留 `main` 当前的维护模式、升级流程、本地部署能力

## Database Conflict Items

以下结构冲突已识别，落迁移前需再次确认：

### 1. Users table

私有化分支早期版本仅包含：

- `id`
- `username`
- `password_hash`
- `role`
- `timezone`
- `is_active`

但后续本地分支实际又追加了：

- `display_name`
- `avatar_key`

因此最终用户表应以“鉴权 + profile”完整结构为目标，而不是回退到早期私有化表结构。

### 2. Board ownership model

需要补入以下多看板关系：

- `boards`
- `board_members`
- `projects.board_id`
- `task_activity.board_id`

这会改变数据读取边界、权限边界和默认数据初始化逻辑。

### 3. System parameter conflict

`main` 当前存在系统参数：

- `board_title`

该参数与“创建看板时可设置看板名称”冲突。最终方案应为：

- 实际页面标题来自当前看板实体 `boards.name`
- `board_title` 如保留，只能作为默认模板名或兼容参数，不能覆盖实体看板名

## Module Migration Order

### Stage 1: Safe modules without DB migration

- `lib/password.ts`
- `lib/auth.ts`
- `lib/timezone.ts`
- `lib/ui-options.ts`
- `components/login-page.tsx`
- `components/timezone-boundary.tsx`
- `public/avatars/*`

### Stage 2: Auth shell and admin UI

- `components/authenticated-shell.tsx`
- `components/admin-app.tsx`
- `app/admin/page.tsx`
- `app/page.tsx`

这一步要求先把 repository 接口与当前 `main` 数据结构适配好。

### Stage 3: Session and auth routes

- `lib/server-session.ts`
- `app/api/auth/*`
- `app/api/admin/*`
- `app/api/boards/*`

### Stage 4: Repository and DB adapters

- `db/index.ts`
- `lib/repositories/kanban-repository.ts`
- `board-store` 与 repository 的职责重组

### Stage 5: Database migration

单独设计升级路径，确保：

- 旧 `main` 的 SQLite/Postgres 数据可迁移
- 不破坏现有任务、项目、活动和系统参数
- 默认看板和超级管理员可安全初始化
