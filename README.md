# 项目看板

基于标准 Next.js App Router 和 Node.js runtime 的私有化项目管理看板，用于跟踪项目、任务状态、优先级、进度、阻塞、活动记录和审计日志。

## 功能

- 登录鉴权、用户角色、团队、看板授权、后台管理和个人资料管理
- 多看板隔离，支持看板成员、看板团队和看板切换
- 项目、任务、任务拆解、优先级、负责人、测试员、截止日、阻塞项和关键词筛选
- 需求池、设计中、开发中、测试中、已完成五列看板，支持拖拽排序和跨列移动
- 项目负载大屏，支持团队/项目筛选、人员状态、负载排行、任务池和公开访问开关
- 系统参数、活动记录、审计日志、结构化 JSON 运行日志和客户端错误上报
- SQLite / PostgreSQL 双数据库驱动，支持 SQLite 安全升级和 SQLite 到 PostgreSQL 一次性迁移
- 旧版浏览器兼容处理，最低实现基线面向 Edge 87 / 旧 Chromium 环境，推荐 Chrome/Edge 109+、Firefox 115+、Safari 16.4+

## 技术栈

- Next.js 16 App Router
- React 19
- Drizzle ORM
- Tailwind CSS 3.4 + Autoprefixer
- dnd-kit
- SQLite `node:sqlite` / PostgreSQL `pg`

当前部署目标是标准 Next.js Node runtime。运行、构建和 Docker 部署不依赖旧的适配型运行时。

## 快速开始

```bash
pnpm install
cp .env.development.example .env.development.local
pnpm run local:dev
```

常用命令：

```bash
pnpm run dev              # next dev
pnpm run dev:auth         # 开启鉴权开发
pnpm run dev:noauth       # 关闭鉴权开发
pnpm run build            # next build
pnpm run start            # next start
pnpm run start:standalone # node server.js，模拟 Docker standalone 入口
pnpm run local:dev        # 读取环境变量，监听 0.0.0.0 启动开发服务
pnpm run local:dev:sqlite # 执行本地 SQLite 迁移后启动开发服务
pnpm run local:start      # 读取环境变量，监听 0.0.0.0 启动生产服务
pnpm run local:start:sqlite # 执行本地 SQLite 迁移后启动生产服务
pnpm run lint
```

本地开发默认读取 `.env.development.local`。推荐复制 `.env.development.example` 后按实际数据库调整：

```bash
cp .env.development.example .env.development.local
```

常用环境变量：

- `KANBAN_DB_DRIVER=sqlite|postgres`
- `POSTGRES_URL=postgres://user:password@host:5432/kanban`
- `KANBAN_PG_POOL_MAX=10`
- `KANBAN_PG_IDLE_TIMEOUT_MS=30000`
- `KANBAN_PG_CONNECTION_TIMEOUT_MS=5000`
- `KANBAN_SQLITE_PATH=.data/kanban.sqlite`
- `KANBAN_AUTH_ENABLED=true`
- `KANBAN_AUTH_SECRET=change-this-secret`
- `KANBAN_COOKIE_SECURE=true`
- `KANBAN_SUPER_ADMIN_USERNAME=admin`
- `KANBAN_SUPER_ADMIN_PASSWORD=admin@123`
- `KANBAN_LOG_DIR=/data/logs`
- `KANBAN_LOG_FILE_ENABLED=true`

生产环境必须修改 `KANBAN_AUTH_SECRET`、默认管理员密码和 PostgreSQL 默认密码。

## Docker 部署

### SQLite

```bash
docker compose -f docker-compose.sqlite.yml up -d --build
```

SQLite compose 使用：

- `KANBAN_DB_DRIVER=sqlite`
- `KANBAN_SQLITE_PATH=/data/kanban.sqlite`
- `KANBAN_SQLITE_BACKUP_DIR=/data/backups`
- `KANBAN_LOG_DIR=/data/logs`
- 数据、备份和日志持久化在 `/data`

### PostgreSQL

```bash
docker compose -f docker-compose.postgres.yml up -d --build
```

PostgreSQL compose 使用 `postgres:16-alpine`，应用服务等待数据库 healthcheck 通过后启动，并在启动前执行 `scripts/migrate-postgres.mjs`。

### 镜像构建

```bash
docker build -t halfroom/kanban:beta-1.5.1 .

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t halfroom/kanban:beta-1.5.1 \
  --push .
```

Dockerfile 使用 Next standalone 输出：

- 构建阶段执行 `pnpm run build`
- 运行阶段复制 `.next/standalone`、`.next/static`、`public`、`scripts`、`drizzle`、`migrations`
- 容器入口先执行数据库迁移/升级，再 `exec node server.js`
- `server.js` 会内部启动 Next standalone，并在 HTML 响应中确保 early diagnostics、core-js 和浏览器兼容检测早于客户端 bundle 执行
- 不依赖 `dist` 目录

本地生产启动区分：

- `pnpm run start`：标准 Next.js 生产启动，直接运行 `next start`
- `pnpm run start:standalone`：运行 `node server.js`，模拟 Docker 中的 standalone 包装入口
- Docker：通过 `scripts/docker-entrypoint.sh` 先执行迁移，再运行 `node server.js`

导出 arm64 离线包：

```bash
docker buildx build \
  --platform linux/arm64 \
  -t halfroom/kanban:beta-1.5.1-arm64 \
  --load .

docker save halfroom/kanban:beta-1.5.1-arm64 | gzip > halfroom-kanban-beta-1.5.1-linux-arm64.tar.gz
```

导入：

```bash
gunzip -c halfroom-kanban-beta-1.5.1-linux-arm64.tar.gz | docker load
```

## 数据库维护

SQLite 本地迁移：

```bash
pnpm run db:migrate:sqlite:local
KANBAN_DB_DRIVER=sqlite KANBAN_SQLITE_PATH=.data/kanban.sqlite node scripts/migrate-local-sqlite.mjs
```

SQLite 安全升级检查和执行：

```bash
pnpm run db:upgrade:check
pnpm run db:upgrade:safe
```

PostgreSQL 迁移：

```bash
KANBAN_DB_DRIVER=postgres POSTGRES_URL=postgres://kanban:password@localhost:5432/kanban node scripts/migrate-postgres.mjs
```

PostgreSQL 性能建议：

- 生产和多人使用场景优先使用 PostgreSQL
- 根据容器实例数和 PostgreSQL `max_connections` 调整 `KANBAN_PG_POOL_MAX`
- 大屏、看板首屏、审计日志等高频查询已有双驱动索引迁移
- 排查慢查询时优先查看 API 日志 `durationMs` 和 PostgreSQL `EXPLAIN ANALYZE`

SQLite 到 PostgreSQL 一次性迁移：

```bash
pnpm run db:migrate:sqlite-to-postgres:check
pnpm run db:migrate:sqlite-to-postgres
```

## 日志和诊断

Docker 默认开启控制台日志和文件日志：

```bash
docker logs -f kanban
docker exec -it kanban sh
tail -f /data/logs/kanban.log
grep '"level":"error"' /data/logs/kanban.log
grep '"requestId":"实际 Request ID"' /data/logs/kanban.log
```

日志目录：

- 应用日志：`/data/logs/kanban.log`
- 关键业务日志：`/data/logs/kanban-business.log`

错误定位入口：

- API 日志包含 `requestId`、`method`、`path`、`status`、`durationMs`、`userAgent`、`ip`
- 页面渲染失败会记录 `page render failed` 并在错误页展示 `requestId`
- 客户端错误统一上报到 `/api/client-errors`
- React 启动前错误记录 `early-window-error` / `early-unhandledrejection`
- 静态资源加载失败记录 `resource-error`，包含 `resourceTag` 和 `resourceUrl`
- 超级管理员可访问 `/admin/diagnostics` 查看最近错误、客户端错误、资源加载错误、应用版本、数据库类型和日志配置

日志会脱敏 `password`、`token`、`secret`、`cookie`、`authorization bearer` 等敏感字段。

## 旧浏览器兼容

实现基线按 `package.json` 的 Browserslist 维护：

```json
[
  "Chrome >= 87",
  "Edge >= 87",
  "Firefox >= 90",
  "Safari >= 15",
  "not IE 11"
]
```

页面 `<head>` 中会在客户端 bundle 前执行：

- early diagnostics script
- `core-js-bundle/minified.js`
- 浏览器兼容提示脚本

Chrome/Edge 87 以下会提示当前版本低于最低要求，87 到 108 会建议升级到推荐版本；两种场景都允许用户继续访问。开发新功能时，动画、拖拽、浮层、滚动容器和复杂 CSS 必须优先考虑旧 Chromium 可识别的实现和降级表现。

## 版本维护

- 应用版本维护在 `package.json` 的 `version`
- 镜像标识通过 `KANBAN_IMAGE_TAG` 注入，支持 `{version}` 占位符
- Docker 构建可传入 `KANBAN_APP_VERSION` 和 `KANBAN_IMAGE_TAG`

数据库升级只看迁移表和迁移文件，不根据镜像 tag 后缀判断。
