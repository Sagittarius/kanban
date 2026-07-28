# 私有化部署与诊断

本文档用于内网或私有 Docker 环境部署。当前项目运行方式为标准 Next.js Node runtime，构建产物使用 Next standalone，容器入口为 `node server.js`。该入口会内部启动 Next standalone，并在 HTML 响应中确保 early diagnostics、core-js 和浏览器兼容检测早于客户端 bundle 执行。

## 部署方式

### SQLite 单机部署

```bash
docker compose -f docker-compose.sqlite.yml up -d --build
```

关键配置：

- `KANBAN_DB_DRIVER=sqlite`
- `KANBAN_SQLITE_PATH=/data/kanban.sqlite`
- `KANBAN_SQLITE_BACKUP_DIR=/data/backups`
- `KANBAN_LOG_DIR=/data/logs`
- `/data` 卷同时保存数据库、备份和日志

### PostgreSQL 部署

```bash
docker compose -f docker-compose.postgres.yml up -d --build
```

关键配置：

- `postgres:16-alpine`
- `POSTGRES_URL=postgres://...@postgres:5432/kanban`
- `KANBAN_DB_DRIVER=postgres`
- 应用等待 PostgreSQL healthcheck 通过后启动
- 默认容器启动前执行 `scripts/migrate-postgres.mjs`
- 如设置 `KANBAN_AUTO_UPGRADE=false`，容器启动前只做 PostgreSQL 维护预检；检测到待迁移结构时，首页会进入维护升级页面，确认后再执行迁移

### 手工运行

```bash
pnpm install --frozen-lockfile
pnpm run build
KANBAN_DB_DRIVER=sqlite KANBAN_SQLITE_PATH=.data/kanban.sqlite node scripts/migrate-local-sqlite.mjs
KANBAN_AUTH_SECRET=change-this-secret KANBAN_SESSION_TIMEOUT=24h pnpm run start
```

启动方式说明：

- `pnpm run start`：标准 Next.js 生产启动，使用 `next start`
- `pnpm run start:standalone`：模拟 Docker，直接运行项目根目录的 `server.js`
- Docker：由 `scripts/docker-entrypoint.sh` 先执行迁移/升级，再运行 `node server.js`

`server.js` 是 standalone 包装入口，内部代理 Next standalone 服务。

## 生产安全配置

上线前必须修改：

- `KANBAN_AUTH_SECRET`
- `KANBAN_SUPER_ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `POSTGRES_URL` 中的数据库密码

建议配置：

- `KANBAN_SESSION_TIMEOUT=24h`，登录会话有效期；支持 `s`、`m`、`h`、`d`，不带单位时按秒处理
- HTTPS 环境设置 `KANBAN_COOKIE_SECURE=true`
- 使用 PostgreSQL 时不要保留 compose 示例里的 `change-this-password`
- 将 `/data` 或 `/data/logs` 挂载到持久化存储
- 限制 `/admin` 和 `/admin/diagnostics` 的网络访问范围

## 日志位置

Docker 镜像默认开启控制台日志和文件日志：

- 控制台：`docker logs kanban`
- 应用日志：`/data/logs/kanban.log`
- 关键业务日志：`/data/logs/kanban-business.log`

默认日志目录由 `KANBAN_LOG_DIR=/data/logs` 控制。SQLite compose 会随 `/data` 数据卷保留日志；PostgreSQL compose 使用 `kanban-logs` 卷保留应用日志。

## 常用诊断命令

```bash
docker logs kanban --tail 200
docker logs kanban -f
docker exec -it kanban sh
tail -n 200 /data/logs/kanban.log
tail -f /data/logs/kanban.log
grep '"level":"error"' /data/logs/kanban.log
grep '"msg":"api request crashed"' /data/logs/kanban.log
grep '"msg":"page render failed"' /data/logs/kanban.log
grep '"msg":"client error reported"' /data/logs/kanban.log
grep '"source":"resource-error"' /data/logs/kanban.log
```

## 按 Request ID 定位

页面渲染失败时，错误页会展示 `Request ID`。API 请求失败时，响应头和错误响应体也会带 `requestId`。

```bash
grep '"requestId":"替换为实际 Request ID"' /data/logs/kanban.log
```

同一个 `requestId` 可以串起：

- `api request started` / `api request completed` / `api request crashed`
- `page render completed` / `page render failed`
- `client error reported`

客户端错误还会包含 `clientSessionId`、`route`、`activeBoardId`、`url`、`userAgent`、`appVersion`。资源加载错误会包含 `resourceTag` 和 `resourceUrl`。

## 后台诊断页

超级管理员可访问：

```text
/admin/diagnostics
```

诊断页展示最近错误日志、客户端错误、资源加载错误、应用版本、镜像标签、数据库类型和日志配置。它读取当前应用日志文件末尾的 JSON 记录，不替代 `docker logs` 和 `kanban.log` 原始日志。

## 静态资源排查

如果页面无样式或白屏，优先检查：

- 浏览器 Network 里 CSS/JS 是否返回 200
- CSS 响应头 `Content-Type` 是否为 `text/css`
- JS chunk 是否返回 200，是否被代理改写
- `/api/client-errors` 是否记录了 `resource-error`
- 控制台是否出现 `Object.hasOwn is not a function`、chunk load 或 hydration 错误

## 旧浏览器兼容

项目实现基线为 Chrome/Edge 87、Firefox 90、Safari 15。为了获得最佳体验，建议用户升级到 Chrome/Edge 109、Firefox 115、Safari 16.4 以上。

兼容措施：

- Tailwind CSS 3.4 + Autoprefixer + Browserslist
- 页面启动前内联 diagnostics script
- 客户端 bundle 前执行 `core-js-bundle/minified.js`
- Chrome/Edge 87 以下和低于推荐版本的提示页都允许用户继续访问
- 特效、拖拽、浮层和滚动容器应避免只在新 Chromium 才稳定的新 CSS/API

## 脱敏规则

结构化日志会对字段名或字符串中的敏感内容脱敏，包括：

- `password`
- `token`
- `secret`
- `cookie`
- `authorization bearer`

排障时不要把真实密码、令牌或 cookie 手工写进日志、截图或工单。
