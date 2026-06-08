# 私有化部署与数据库选择

本项目现在通过 `KANBAN_DB_DRIVER` 选择数据库驱动，业务层只依赖 repository / database adapter，不再直接依赖 Cloudflare D1 API。

## 支持的数据库

| 场景 | KANBAN_DB_DRIVER | 说明 |
| --- | --- | --- |
| Cloudflare Workers / D1 | `d1` | 使用绑定名 `DB`，迁移仍由 `wrangler d1 migrations apply` 执行。 |
| 单机内网部署 | `sqlite` | 使用 Node.js 内置 `node:sqlite`，数据库文件由 `KANBAN_SQLITE_PATH` 指定。 |
| 团队/生产内网部署 | `postgres` | 使用 `POSTGRES_URL` 或 `DATABASE_URL` 指向 PostgreSQL。 |

默认行为：未指定 `KANBAN_DB_DRIVER` 时，运行在 Workers 且存在 `DB` 绑定则使用 D1；否则使用 SQLite。

## Docker + SQLite

适合单机、低维护成本部署：

```bash
cp docker-compose.sqlite.yml docker-compose.yml
# 修改 KANBAN_AUTH_SECRET 为长随机字符串
# 修改 KANBAN_SUPER_ADMIN_PASSWORD 为初始超级管理员密码
docker compose up -d --build
```

访问：

```text
http://服务器IP:3000
```

数据保存在 Docker volume `kanban_sqlite` 中。也可以把 `KANBAN_SQLITE_PATH` 改成绑定挂载路径，例如 `/data/kanban.sqlite`。

## Docker + PostgreSQL

适合多人使用、备份恢复和后续扩展：

```bash
cp docker-compose.postgres.yml docker-compose.yml
# 修改 POSTGRES_PASSWORD、POSTGRES_URL、KANBAN_AUTH_SECRET、KANBAN_SUPER_ADMIN_PASSWORD
docker compose up -d --build
```

应用启动时会执行 `scripts/migrate-postgres.mjs`，自动应用 `migrations/postgres` 目录中的迁移。

## 非 Docker SQLite 部署

```bash
pnpm install
pnpm run build
KANBAN_DB_DRIVER=sqlite \
KANBAN_SQLITE_PATH=/opt/kanban-data/kanban.sqlite \
KANBAN_AUTH_SECRET='替换成长随机字符串' \
KANBAN_SUPER_ADMIN_USERNAME=admin \
KANBAN_SUPER_ADMIN_PASSWORD='admin@123' \
./node_modules/.bin/vinext start --hostname 0.0.0.0
```

## 非 Docker PostgreSQL 部署

```bash
pnpm install
pnpm run build
KANBAN_DB_DRIVER=postgres \
POSTGRES_URL='postgres://kanban:kanban_password@127.0.0.1:5432/kanban' \
KANBAN_AUTH_SECRET='替换成长随机字符串' \
KANBAN_SUPER_ADMIN_USERNAME=admin \
KANBAN_SUPER_ADMIN_PASSWORD='admin@123' \
./node_modules/.bin/vinext start --hostname 0.0.0.0
```

## 初始化账号

系统启动后如果 `users` 表为空，会创建一个超级管理员：

```text
用户名：KANBAN_SUPER_ADMIN_USERNAME，默认 admin
密码：KANBAN_SUPER_ADMIN_PASSWORD，默认 admin@123
默认时区：KANBAN_DEFAULT_TIMEZONE，默认 Asia/Shanghai
```

登录后请进入后台管理创建普通用户。普通用户的默认密码是：

```text
{用户名}@123
```

用户名只允许英文和数字。

## 忘记密码后的数据库重置脚本

重置超级管理员 `admin` 为 `admin@123`：

SQLite / D1：

```bash
sqlite3 /data/kanban.sqlite < scripts/reset-super-admin-password.sql
# D1 示例
wrangler d1 execute project-kanban-board --file scripts/reset-super-admin-password.sql
```

PostgreSQL：

```bash
psql "$POSTGRES_URL" -f scripts/reset-super-admin-password.postgres.sql
```

为任意用户生成一次性 SQL：

```bash
node scripts/reset-password-sql.mjs zhangsan zhangsan@123
```

将输出的 `UPDATE users ...` 语句复制到 SQLite、D1 或 PostgreSQL 执行即可。
