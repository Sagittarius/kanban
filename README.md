# 项目看板

一个支持私有化部署的项目管理看板，用于跟踪项目、任务状态、优先级、进度、阻塞和活动记录。

## 核心能力

- 多数据库架构：通过 repository / database adapter 隔离业务逻辑与数据库驱动，支持 SQLite 和 PostgreSQL。
- 用户登录与权限：系统初始化超级管理员，超级管理员创建普通用户；普通用户名只支持英文和数字。
- 多看板：每个用户可创建多个看板并快速切换；普通用户只能访问自己的看板和被授权查看的看板。
- 管理后台：超级管理员可以查看全部看板、分配普通用户的看板查看权限、重置普通用户密码。
- 时区感知：登录用户可设置自己的时区，默认 `Asia/Shanghai`，看板日期判断和活动时间展示按用户时区处理。
- 系统参数：仅超级管理员可访问和修改；活动记录按看板维度独立保存和展示。
- 离线登录页：登录页使用本地 CSS/SVG/系统字体，不依赖外部网络素材。
- Docker 部署：提供 SQLite 与 PostgreSQL 两种 Compose 模板。

## 本地开发

```bash
pnpm install
pnpm run db:migrate:local
pnpm run dev
```

默认使用 SQLite：

```bash
KANBAN_DB_DRIVER=sqlite KANBAN_SQLITE_PATH=.data/kanban.sqlite pnpm run dev
```

使用 PostgreSQL：

```bash
KANBAN_DB_DRIVER=postgres POSTGRES_URL='postgres://kanban:kanban_password@127.0.0.1:5432/kanban' pnpm run dev
```

## 初始账号

如果 `users` 表为空，系统启动时会初始化超级管理员：

```text
用户名：admin
密码：admin@123
时区：Asia/Shanghai
```

可通过环境变量覆盖：

```bash
KANBAN_SUPER_ADMIN_USERNAME=admin
KANBAN_SUPER_ADMIN_PASSWORD='admin@123'
KANBAN_DEFAULT_TIMEZONE=Asia/Shanghai
KANBAN_AUTH_SECRET='请替换为长随机字符串'
```

## 部署

详细说明见：[私有化部署与数据库选择](docs/private-deployment.md)。

Docker + SQLite：

```bash
docker compose -f docker-compose.sqlite.yml up -d --build
```

Docker + PostgreSQL：

```bash
docker compose -f docker-compose.postgres.yml up -d --build
```

## 忘记密码

重置超级管理员 `admin` 为 `admin@123`：

```bash
sqlite3 /data/kanban.sqlite < scripts/reset-super-admin-password.sql
psql "$POSTGRES_URL" -f scripts/reset-super-admin-password.postgres.sql
```

为任意用户生成重置 SQL：

```bash
node scripts/reset-password-sql.mjs username username@123
```

## 重要表结构

- `users`：用户、角色、密码哈希、时区。
- `boards`：看板主表。
- `board_members`：看板访问授权。
- `projects`：项目，绑定 `board_id`。
- `tasks` / `subtasks`：任务与拆解项。
- `task_activity`：看板维度活动记录，绑定 `board_id`。
- `system_parameters`：系统参数，仅超级管理员可维护。
