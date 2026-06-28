# 项目看板

一个基于 Sites vinext starter 的项目管理看板，用于跟踪项目、任务状态、优先级、进度、阻塞和活动记录。

## 阅读指引

- 只想本地跑起来：看 `快速开始`
- 要做离线包部署到内网 Linux / Windows：看 `内网部署`
- 要用 Docker：看 `Docker 部署`
- 要理解升级和回滚：看 `SQLite 安全升级与回滚`
- 要看版本号和镜像 tag 约定：看 `版本维护`

## 功能

- 登录鉴权、用户角色、团队、看板授权和个人资料管理
- 项目、优先级、标签、阶段、临期、超期、阻塞和关键词筛选
- 项目增删改查、完成归档、归档总结和恢复
- 需求池、设计中、开发中、测试中、已完成五列看板
- 任务拖拽移动、列内排序、拖入回收站删除；跨列移动在释放时提交，减少拖拽过程中的 DOM 抖动
- 任务详情抽屉，包括状态、负责人、截止日、描述、标签、阻塞项和阻塞说明
- 任务工作量人日、负责人/测试员与团队成员联动选择
- 多任务拆解 checklist，完成后联动任务进度
- 临期、逾期和超期完成任务醒目标注
- Linear、GitHub、Notion、Atlassian、Neon Grid、Deep Space 等多套主题
- 团队工作饱和度 dashboard，支持多团队、多项目筛选、浅色/暗色方案和公开访问开关
- 系统参数表，可配置临期天数和活动记录保留天数
- 独立全局活动记录面板，记录项目、任务、任务拆解和跨阶段移动，并按保留天数自动清理
- 结构化 JSON 运行日志，支持控制台和文件输出，API 请求自动记录 requestId、耗时、状态码、IP 和 UA
- 登录用户审计日志，记录认证、后台管理、看板、团队、系统参数、项目、任务和拆解任务等关键操作
- SQLite/PostgreSQL 持久化项目、任务、任务拆解、系统参数、活动记录和审计日志

## 版本维护

版本信息分两层维护：

- 应用版本：维护在 `package.json` 的 `version`
- 镜像标识：维护在部署时传入的 `KANBAN_IMAGE_TAG`

发布时的推荐规则：

1. 只手工维护 `package.json.version`
2. 不手工修改 `Dockerfile` 里的 `ARG` 默认值
3. 构建镜像时通过 `--build-arg` 传入真实版本和真实镜像标识

当前升级机制里：

- 数据库是否需要升级，只看 `drizzle/` 中是否存在未应用迁移
- 不根据 `snapshot`、`beta`、`release` 之类的 tag 后缀判断升级
- `KANBAN_IMAGE_TAG` 只用于维护页和 footer 展示当前运行镜像，支持使用 `{version}` 占位符自动引用 `package.json.version`

因此未来发正式版时，不需要改代码逻辑，只需要：

1. 更新 `package.json.version`
2. 构建镜像时传入正式镜像 tag，例如 `kanban:1.1.0` 或 `halfroom/kanban:1.1.0`

`Dockerfile` 中的：

- `ARG KANBAN_APP_VERSION`
- `ARG KANBAN_IMAGE_TAG`

现在只是兜底占位值，避免“不传参数时无法构建”，不是正式发布值来源。

如果当前生产正在跑的镜像名是：

- `kanban:arm64`
- `kanban:amd64`

建议在部署环境里显式传入对应的 `KANBAN_IMAGE_TAG`，这样维护页里显示的镜像名才会和线上真实镜像一致。若希望减少重复维护，也可以写成类似 `halfroom/kanban:{version}` 的形式。

## 快速开始

本项目当前主路径是：

- 本地开发：SQLite
- 单机稳定部署：SQLite
- 新建 PostgreSQL 环境：支持
- SQLite 业务数据迁移到 PostgreSQL：支持一次性迁移脚本

## 本地开发

当前主路径已移除 D1 依赖。本地开发直接使用 SQLite：

```bash
cd /Users/vincent/Projects/project-kanban-board
pnpm install
pnpm run db:migrate:local       # SQLite 迁移（.data/kanban.sqlite）
pnpm run dev
pnpm run lint
pnpm run build
```

也可使用快捷命令一键启动：`pnpm run local:dev`

### 开发环境开关

推荐将开发环境配置写入 `.env.development.local`。可以先复制模板：

```bash
cp .env.development.example .env.development.local
```

常用字段：

- `KANBAN_AUTH_ENABLED=true`：开启鉴权
- `KANBAN_AUTH_ENABLED=false`：关闭鉴权
- `KANBAN_DEFAULT_BOARD_ID=default-board`：新部署初始化默认看板时使用的看板 ID
- 关闭鉴权时，新部署会初始化系统参数 `board_title` 指定名称的默认看板；升级部署会展示数据库里最早创建的看板，页面标题使用 `board_title`
- `KANBAN_SQLITE_PATH=.data/kanban.sqlite`：指定本地 SQLite 路径
- `KANBAN_DB_DRIVER=sqlite`：显式指定本地开发驱动
- `KANBAN_SQLITE_BACKUP_DIR=.data/backups`：本地安全升级前的 SQLite 备份目录
- `KANBAN_AUTO_UPGRADE=false`：本地开发默认关闭自动升级，避免启动时误跑升级
- `KANBAN_MAINTENANCE_STATE_PATH=.data/kanban-maintenance.json`：维护模式状态文件，记录待升级或升级中的状态
- `KANBAN_MAINTENANCE_TOKEN=change-this-maintenance-token`：本地手工升级口令
- `KANBAN_IMAGE_TAG=kanban:dev-{version}`：本地运行标识，供 footer/维护页展示；`{version}` 会自动替换为 `package.json` 里的版本号
- `KANBAN_SUPER_ADMIN_USERNAME=admin`：本地超级管理员用户名
- `KANBAN_SUPER_ADMIN_PASSWORD=admin@123`：本地超级管理员初始密码
- `KANBAN_DEFAULT_TIMEZONE=Asia/Shanghai`：本地默认时区
- `KANBAN_AUTH_SECRET=change-this-secret-in-local-dev`：登录会话签名密钥，用于生成和校验 session cookie

如果不想写 `.env.development.local`，也可以直接使用脚本：

```bash
pnpm run dev:auth
pnpm run dev:noauth
```

## 部署手册

### 内网部署

不要在内网服务器执行 `pnpm install`。依赖需要在一台能访问 npm registry 的同操作系统、同 CPU 架构机器上提前装好，并把 `node_modules/` 和 `dist/` 一起打包带入内网。  
你现在的开发机是 macOS ARM64，而内网服务器是 Linux ARM64，所以不能直接把 macOS 上装出来的 `node_modules/` 复制到服务器。最稳妥的做法是先在 Linux ARM64 环境里完成依赖安装和打包，再把离线包传到内网。

#### 1. ARM Linux 服务器部署

推荐在一台 Linux ARM64 环境里打包，环境可以是：

- 一台能联网的 Linux ARM64 构建机
- 一台 Linux ARM64 虚拟机
- 在 Mac 上启动一个 `linux/arm64` 容器来做构建

如果你只有 Mac mini M4，也可以用 Docker 在 `linux/arm64` 容器里构建，但容器内安装出来的依赖必须来自 Linux ARM64 环境，不能直接使用 macOS 原生依赖。

一个可执行的 Docker 方式是：

```bash
docker run --rm --platform linux/arm64 -it \
  -v "$PWD":/app \
  -w /app \
  node:22-bookworm-slim bash

corepack enable
corepack prepare pnpm@10 --activate
pnpm install --frozen-lockfile
pnpm run db:migrate:local
pnpm run build
```

##### 1.1 在 ARM64 构建环境准备离线包

```bash
cd /Users/vincent/Projects/project-kanban-board
pnpm install --frozen-lockfile
pnpm run db:migrate:local
pnpm run build
tar \
  --exclude .git \
  --exclude .data \
  --exclude project-kanban-board-offline.tgz \
  --exclude .next \
  --exclude .wrangler \
  --exclude .vinext \
  -czf project-kanban-board-offline.tgz .
```

打包完成后确认离线包包含 `node_modules/`、`dist/server/index.js`、`scripts/migrate-local-sqlite.mjs`、`package.json` 和 `pnpm-lock.yaml`。把 `project-kanban-board-offline.tgz` 传到内网服务器。构建环境和内网服务器必须保持兼容的 Linux 发行版、CPU 架构和 Node.js 主版本，否则部分依赖可能无法运行。

##### 1.2 在内网 ARM Linux 服务器解压

```bash
mkdir -p /opt/project-kanban-board
tar -xzf project-kanban-board-offline.tgz -C /opt/project-kanban-board
cd /opt/project-kanban-board
```

##### 1.3 初始化或升级 SQLite

```bash
mkdir -p /opt/project-kanban-board-data
KANBAN_SQLITE_PATH=/opt/project-kanban-board-data/kanban.sqlite node scripts/migrate-local-sqlite.mjs
```

`KANBAN_SQLITE_PATH` 指向真实业务数据库文件。后续升级新版本时继续执行这条迁移命令即可，不会清空已有数据。

##### 1.4 启动服务

```bash
PORT=3000 KANBAN_SQLITE_PATH=/opt/project-kanban-board-data/kanban.sqlite ./node_modules/.bin/vinext start --hostname 0.0.0.0
```

同一局域网内访问：

```text
http://服务器IP:3000
```

##### 1.5 systemd 示例

```ini
[Unit]
Description=Project Kanban Board
After=network.target

[Service]
WorkingDirectory=/opt/project-kanban-board
Environment=PORT=3000
Environment=KANBAN_SQLITE_PATH=/opt/project-kanban-board-data/kanban.sqlite
ExecStart=/opt/project-kanban-board/node_modules/.bin/vinext start --hostname 0.0.0.0
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

保存为 `/etc/systemd/system/project-kanban-board.service` 后执行：

```bash
systemctl daemon-reload
systemctl enable --now project-kanban-board
systemctl status project-kanban-board
```

##### 1.6 升级流程

```bash
systemctl stop project-kanban-board
rm -rf /opt/project-kanban-board
mkdir -p /opt/project-kanban-board
tar -xzf project-kanban-board-offline.tgz -C /opt/project-kanban-board
cd /opt/project-kanban-board
KANBAN_SQLITE_PATH=/opt/project-kanban-board-data/kanban.sqlite node scripts/migrate-local-sqlite.mjs
systemctl start project-kanban-board
```

业务数据在 `/opt/project-kanban-board-data/kanban.sqlite`，不要放在应用目录里，避免升级覆盖。

#### 2. Windows 服务器部署

Windows 服务器也可以部署，但要注意两点：

- 不要把 Linux 或 macOS 的 `node_modules/` 直接拷到 Windows 上
- Windows 上启动可执行文件是 `vinext.cmd`，不是 `vinext`

##### 2.1 在 Windows 构建机准备离线包

如果你的服务器是 Windows，最稳妥的方式是在一台能联网的 Windows 机器上构建离线包：

```powershell
cd C:\Users\vincent\Projects\project-kanban-board
pnpm install --frozen-lockfile
pnpm run db:migrate:local
pnpm run build
$items = Get-ChildItem -Force | Where-Object {
  $_.Name -notin @('.git', '.data', '.next', '.vinext', 'project-kanban-board-offline.zip')
}
Compress-Archive -Path $items.FullName -DestinationPath project-kanban-board-offline.zip -Force
```

打包时同样要排除 `.git`、`.data`、`.next`、`.vinext` 和其它运行时缓存目录。离线包需要包含 `node_modules`、`dist`、`scripts`、`drizzle`、`migrations`、`package.json` 和 `pnpm-lock.yaml`。

##### 2.2 在 Windows 服务器解压

```powershell
New-Item -ItemType Directory -Force -Path C:\project-kanban-board | Out-Null
Expand-Archive -Path C:\project-kanban-board-offline.zip -DestinationPath C:\project-kanban-board -Force
Set-Location C:\project-kanban-board
```

##### 2.3 初始化或升级 SQLite

```powershell
New-Item -ItemType Directory -Force -Path C:\project-kanban-board-data | Out-Null
$env:KANBAN_SQLITE_PATH = 'C:\project-kanban-board-data\kanban.sqlite'
node scripts/migrate-local-sqlite.mjs
```

##### 2.4 启动服务

```powershell
$env:PORT = '3000'
$env:KANBAN_SQLITE_PATH = 'C:\project-kanban-board-data\kanban.sqlite'
.\node_modules\.bin\vinext.cmd start --hostname 0.0.0.0
```

局域网访问地址：

```text
http://服务器IP:3000
```

##### 2.5 Windows 后台运行

Windows 机器最稳妥的方式是用 `NSSM` 把服务挂成 Windows Service。步骤如下：

```powershell
nssm install project-kanban-board
```

在弹窗里填写：

- Application：`C:\project-kanban-board\node_modules\.bin\vinext.cmd`
- Arguments：`start --hostname 0.0.0.0`
- Startup directory：`C:\project-kanban-board`

如果你希望服务启动前自动迁移数据库，也可以把 `Application` 指向 `powershell.exe`，再让它先执行迁移命令后启动主进程：

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "$env:KANBAN_SQLITE_PATH='C:\project-kanban-board-data\kanban.sqlite'; node scripts/migrate-local-sqlite.mjs; .\node_modules\.bin\vinext.cmd start --hostname 0.0.0.0"
```

##### 2.6 Windows 升级流程

```powershell
Stop-Service project-kanban-board
Remove-Item -Recurse -Force C:\project-kanban-board
Expand-Archive -Path C:\project-kanban-board-offline.zip -DestinationPath C:\project-kanban-board -Force
Set-Location C:\project-kanban-board
$env:KANBAN_SQLITE_PATH = 'C:\project-kanban-board-data\kanban.sqlite'
node scripts/migrate-local-sqlite.mjs
Start-Service project-kanban-board
```

### Docker 部署

#### 选择哪种部署方式

- `docker-compose.sqlite.yml`：单机部署，使用 SQLite，当前最完整
- `docker-compose.postgres.yml`：新部署使用 PostgreSQL
- `docker run` / `docker load`：适合内网离线导入镜像

如果你只是要稳定上线，优先用 SQLite。  
如果你要从零新建一套 PostgreSQL 环境，也可以直接用 PG。  
如果你现在已经有 SQLite 业务数据，可以使用仓库内的一次性迁移脚本导入到全新的 PostgreSQL 库；但它不是双向同步工具，也不是增量迁移工具。

#### 构建镜像

项目支持在 `amd64` 和 `arm64` 架构上构建。

运行镜像使用多阶段构建：builder 阶段安装完整依赖并编译，runner 阶段只安装生产依赖，避免 eslint、wrangler、tailwind、drizzle-kit、typescript 等开发依赖进入最终镜像。

本地单平台构建：

```bash
docker build -t project-kanban-board:latest .
docker build --platform linux/amd64 -t project-kanban-board:amd64 .
docker build --platform linux/arm64 -t project-kanban-board:arm64 .
```

多平台构建并推送：

```bash
docker buildx create --name kanban-builder --use

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t your-registry/project-kanban-board:latest \
  --push .
```

如果只想导出多架构离线包：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t project-kanban-board:latest \
  --output type=tar,dest=kanban-multiarch.tar .
```

#### SQLite Compose 部署

直接启动：

```bash
docker compose -f docker-compose.sqlite.yml up -d
```

这份 compose 做了这些约定：

- `KANBAN_DB_DRIVER=sqlite`
- 数据文件默认在容器内 `/data/kanban.sqlite`
- 备份目录默认在 `/data/backups`
- `KANBAN_AUTO_UPGRADE=true`
- `KANBAN_IMAGE_TAG=kanban:sqlite-{version}`

当前默认使用 Docker volume `kanban-data` 持久化数据。  
如果你要改成宿主机目录挂载，请直接改 `docker-compose.sqlite.yml` 的 `volumes`。

等价的 `docker run` 示例：

```bash
docker run -d \
  --name kanban \
  -p 3000:3000 \
  -v /opt/kanban-data:/data \
  -e KANBAN_DB_DRIVER=sqlite \
  -e KANBAN_SQLITE_PATH=/data/kanban.sqlite \
  -e KANBAN_SQLITE_BACKUP_DIR=/data/backups \
  -e KANBAN_AUTO_UPGRADE=true \
  -e KANBAN_IMAGE_TAG=kanban:sqlite-{version} \
  --restart unless-stopped \
  your-image:tag
```

#### PostgreSQL Compose 部署

PostgreSQL 当前支持范围：

- PostgreSQL 新库初始化：支持
- PostgreSQL 后续表结构升级：支持，依赖 `migrations/postgres/*.sql`
- SQLite 业务数据迁移到 PostgreSQL：支持一次性迁移脚本

直接启动：

```bash
export POSTGRES_PASSWORD=your_secure_password
docker compose -f docker-compose.postgres.yml up -d
```

这份 compose 做了这些约定：

- `postgres:16-alpine`
- `KANBAN_DB_DRIVER=postgres`
- `POSTGRES_URL=postgres://...`
- `KANBAN_IMAGE_TAG=kanban:postgres-{version}`
- `kanban` 容器等待 PG healthcheck 通过后再启动

等价的 `docker run` 示例：

```bash
docker run -d \
  --name kanban \
  -p 3000:3000 \
  -e KANBAN_DB_DRIVER=postgres \
  -e POSTGRES_URL=postgres://kanban:your_password@postgres-host:5432/kanban \
  -e KANBAN_IMAGE_TAG=kanban:postgres-{version} \
  --restart unless-stopped \
  your-image:tag
```

如果你已经有 SQLite 业务数据，要迁移到全新的 PostgreSQL 库，使用：

```bash
POSTGRES_URL=postgres://kanban:your_password@postgres-host:5432/kanban \
KANBAN_SQLITE_PATH=.data/kanban.sqlite \
pnpm run db:migrate:sqlite-to-postgres:check

POSTGRES_URL=postgres://kanban:your_password@postgres-host:5432/kanban \
KANBAN_SQLITE_PATH=.data/kanban.sqlite \
pnpm run db:migrate:sqlite-to-postgres
```

这条脚本的行为是：

- 先自动执行 `migrations/postgres/*.sql`
- 检查目标 PG 是否为空
- 默认只允许迁移到空 PG 库
- 如果目标 PG 已有数据，需显式加 `--force-clear`
- 导入完成后会逐表校验行数和主键集合，不一致会直接报错

示例：

```bash
POSTGRES_URL=postgres://kanban:your_password@postgres-host:5432/kanban \
KANBAN_SQLITE_PATH=.data/kanban.sqlite \
node scripts/migrate-sqlite-to-postgres.mjs --force-clear
```

#### Docker 离线部署

适合内网无法联网的服务器。

##### 1. 外网构建机生成镜像包

ARM64：

```bash
docker build \
  --platform linux/arm64 \
  --build-arg KANBAN_APP_VERSION=1.1.0 \
  --build-arg KANBAN_IMAGE_TAG=halfroom/kanban:arm64-snapshot-1.1.0 \
  -t halfroom/kanban:arm64-snapshot-1.1.0 .

docker save -o kanban-arm64-snapshot-1.1.0.tar halfroom/kanban:arm64-snapshot-1.1.0
gzip kanban-arm64-snapshot-1.1.0.tar
```

AMD64：

```bash
docker build --platform linux/amd64 -t halfroom/kanban:amd64-snapshot-1.1.0 .
docker save -o kanban-amd64-snapshot-1.1.0.tar halfroom/kanban:amd64-snapshot-1.1.0
```

多架构 OCI 包：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t halfroom/kanban:multiarch-snapshot-1.1.0 \
  --output type=oci,dest=kanban-1.1.0-oci.tar .
```

##### 2. 传到内网服务器

```bash
scp kanban-arm64-snapshot-1.1.0.tar.gz user@内网服务器:/opt/
```

也可以用 U 盘或其它物理介质。

##### 3. 导入镜像并启动

```bash
gunzip kanban-arm64-snapshot-1.1.0.tar.gz
docker load -i kanban-arm64-snapshot-1.1.0.tar
```

SQLite 模式：

```bash
mkdir -p /opt/kanban-data

docker run -d \
  --name kanban \
  -p 3000:3000 \
  -v /opt/kanban-data:/data \
  -e KANBAN_DB_DRIVER=sqlite \
  -e KANBAN_SQLITE_PATH=/data/kanban.sqlite \
  -e KANBAN_SQLITE_BACKUP_DIR=/data/backups \
  -e KANBAN_AUTO_UPGRADE=false \
  -e KANBAN_MAINTENANCE_TOKEN=change-this-token \
  -e KANBAN_IMAGE_TAG=kanban:arm64-{version} \
  --restart unless-stopped \
  kanban:arm64
```

PostgreSQL 模式：

```bash
docker run -d \
  --name kanban \
  -p 3000:3000 \
  -e KANBAN_DB_DRIVER=postgres \
  -e POSTGRES_URL=postgres://kanban:your_password@postgres-host:5432/kanban \
  -e KANBAN_IMAGE_TAG=kanban:postgres-{version} \
  --restart unless-stopped \
  halfroom/kanban:beta-1.1.0
```

##### 4. 确认运行状态

```bash
docker logs kanban
curl http://localhost:3000
```

## 升级与回滚

### SQLite 安全升级与回滚

当前版本的升级机制遵循一条规则：**升级失败时不破坏原有数据库**。

容器启动时会执行：

1. 检查 `drizzle/` 下是否有未应用迁移
2. 如果有，先把当前数据库备份到 `KANBAN_SQLITE_BACKUP_DIR`
3. 基于数据库副本执行迁移
4. 迁移成功后再替换正式库
5. 任一步失败，保留原库不动，并保留备份路径供人工回滚

### 手动检查是否需要升级

```bash
KANBAN_SQLITE_PATH=/data/kanban.sqlite node scripts/upgrade-local-sqlite.mjs --check
```

### 手动执行安全升级

```bash
KANBAN_SQLITE_PATH=/data/kanban.sqlite \
KANBAN_SQLITE_BACKUP_DIR=/data/backups \
node scripts/upgrade-local-sqlite.mjs
```

### 从备份手动回滚

```bash
KANBAN_SQLITE_PATH=/data/kanban.sqlite \
node scripts/restore-local-sqlite-backup.mjs /data/backups/kanban.backup.2026-06-19T09-00-00-000Z.v0.1.0.sqlite
```

回滚脚本在覆盖当前库之前，也会先额外保存一份当前库快照。

### 维护态升级机制

- 默认 `KANBAN_AUTO_UPGRADE=true`，容器启动时自动升级
- 如果你希望先人工确认，再升级数据库：

```bash
-e KANBAN_AUTO_UPGRADE=false
```

此时容器会：

1. 启动前做迁移预检
2. 如果数据库已是最新版本，直接进入正常业务页面
3. 如果存在待执行迁移，服务继续启动，但全站进入维护页
4. 业务 API 会统一返回 `503`
5. 管理员可以在维护页输入 `KANBAN_MAINTENANCE_TOKEN` 后执行安全升级
6. 升级成功后自动解除维护态并恢复看板

维护页不会提供“一键程序回滚”或“一键数据库回滚”。程序回滚通过回退 Docker 镜像完成；数据库恢复通过备份文件人工执行。

### 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `KANBAN_DB_DRIVER` | `sqlite` | 数据库驱动，`sqlite` 或 `postgres` |
| `KANBAN_SQLITE_PATH` | `.data/kanban.sqlite` | SQLite 数据文件路径，仅 SQLite 模式使用 |
| `KANBAN_SQLITE_BACKUP_DIR` | `<db目录>/backups` | SQLite 升级前备份目录，仅 SQLite 模式使用 |
| `KANBAN_AUTO_UPGRADE` | `true` | 是否在容器启动时自动执行 SQLite 安全升级 |
| `KANBAN_MAINTENANCE_TOKEN` | - | 维护页手工升级口令，`KANBAN_AUTO_UPGRADE=false` 时建议配置 |
| `KANBAN_IMAGE_TAG` | `kanban:<version>` | 维护页和 footer 展示的运行镜像标识，支持 `{version}` 占位符 |
| `KANBAN_DEFAULT_BOARD_ID` | `default-board` | 新部署初始化默认看板时使用的看板 ID |
| `KANBAN_LOG_LEVEL` | `info`/开发为 `debug` | 结构化运行日志级别：`debug`、`info`、`warn`、`error` |
| `KANBAN_LOG_CONSOLE` | `true` | 是否输出 JSON 日志到 stdout/stderr，设置为 `false` 可关闭 |
| `KANBAN_LOG_FILE` | - | 指定完整日志文件路径，例如 `/data/logs/kanban.log` |
| `KANBAN_LOG_DIR` | Docker 为 `/data/logs` | 未设置 `KANBAN_LOG_FILE` 时，日志写入该目录下的 `kanban.log` |
| `POSTGRES_URL` | - | PostgreSQL 连接字符串，仅 PostgreSQL 模式使用 |

## 活动记录

活动记录是面向看板协作的业务动态，不属于某个任务详情。项目创建、项目更新、归档/恢复、任务创建、任务更新、状态变更、删除、跨阶段移动、任务拆解创建/勾选/删除会写入 `task_activity` 表。纯拖拽排序只保存卡片位置，不写活动记录。跨阶段移动会记录任务名称和阶段变化。访问看板或活动接口时会按系统参数 `activity_retention_days` 自动清理过期记录，默认保留 180 天。

## 日志与审计

服务端运行日志统一输出为结构化 JSON。API 入口会记录 `requestId`、`operation`、HTTP 方法、路径、状态码、耗时、IP 和 User-Agent；未捕获异常和前端运行时上报的 client error 会记录错误名称、消息和堆栈。生产 Docker 镜像默认设置 `KANBAN_LOG_DIR=/data/logs`，因此会同时输出控制台日志并写入 `/data/logs/kanban.log`。

审计日志存放在 `audit_logs` 表，和普通协作活动记录分离。登录成功/失败、退出登录、修改密码、用户管理、看板管理、团队管理、系统参数、项目、任务、任务拆解和跨阶段移动等关键操作都会写入审计表。后台管理提供 `审计` 页签，超管可查看最近全局审计记录，项目经理只查看自己的审计记录。

## 数据库

```bash
pnpm run db:generate
pnpm run db:migrate:local
pnpm run db:migrate:sqlite-to-postgres:check
pnpm run db:migrate:sqlite-to-postgres
```

schema 位于 `db/schema.ts`，SQLite 迁移文件位于 `drizzle/`，PostgreSQL 迁移文件位于 `migrations/postgres/`。系统参数存放在 `system_parameters` 表，当前包含 `due_soon_days`、`activity_retention_days`、`task_card_stripe_enabled`、看板名称和阶段名称等参数，前端系统参数抽屉和 `/api/settings` 会读写这些值。任务完成时间存放在 `tasks.completed_at`，用于判断已完成任务是否超期完成。登录用户审计记录存放在 `audit_logs` 表，SQLite 到 PostgreSQL 迁移脚本会同步迁移该表。

## 镜像版本

当前维护态升级方案对应的 ARM 镜像标签：

```text
halfroom/kanban:arm64-snapshot-1.1.0
```
