# 项目看板

一个基于 Sites vinext starter 的项目管理看板，用于跟踪项目、任务状态、优先级、进度、阻塞和活动记录。

## 功能

- 项目、优先级和关键词筛选
- 项目增删改查、完成归档、归档总结和恢复
- 需求池、开发中、测试中、已完成四列看板
- 任务拖拽移动、列内排序、拖入回收站删除
- dnd-kit 多列拖拽，拖动时卡片实时浮动让位
- 任务详情抽屉，包括状态、负责人、截止日、描述、标签、阻塞项和阻塞说明
- 多任务拆解 checklist，完成后联动任务进度
- 临期、逾期和超期完成任务醒目标注
- Linear、GitHub、Notion、Atlassian 四套日常主题
- 系统参数表，可配置临期天数和活动记录保留天数
- 独立全局活动记录面板，记录项目、任务、任务拆解和跨阶段移动，并按保留天数自动清理
- SQLite/D1 持久化项目、任务、任务拆解、系统参数和活动记录

## 本地开发

vinext dev 使用 Miniflare 模拟 Cloudflare Workers 运行时，需要同时执行本地 SQLite 迁移和 Miniflare D1 迁移：

```bash
cd /Users/vincent/Projects/project-kanban-board
pnpm install
pnpm run db:migrate:local       # SQLite 迁移（.data/kanban.sqlite）
pnpm run db:migrate:d1:local    # Miniflare D1 迁移（.wrangler/state/）
pnpm run dev
pnpm run lint
pnpm run build
```

也可使用快捷命令一键启动：`pnpm run local:dev`

## 内网部署

不要在内网服务器执行 `pnpm install`。依赖需要在一台能访问 npm registry 的同操作系统、同 CPU 架构机器上提前装好，并把 `node_modules/` 和 `dist/` 一起打包带入内网。  
你现在的开发机是 macOS ARM64，而内网服务器是 Linux ARM64，所以不能直接把 macOS 上装出来的 `node_modules/` 复制到服务器。最稳妥的做法是先在 Linux ARM64 环境里完成依赖安装和打包，再把离线包传到内网。

### 1. ARM Linux 服务器部署

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

#### 1.1 在 ARM64 构建环境准备离线包

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

#### 1.2 在内网 ARM Linux 服务器解压

```bash
mkdir -p /opt/project-kanban-board
tar -xzf project-kanban-board-offline.tgz -C /opt/project-kanban-board
cd /opt/project-kanban-board
```

#### 1.3 初始化或升级 SQLite

```bash
mkdir -p /opt/project-kanban-board-data
KANBAN_SQLITE_PATH=/opt/project-kanban-board-data/kanban.sqlite node scripts/migrate-local-sqlite.mjs
```

`KANBAN_SQLITE_PATH` 指向真实业务数据库文件。后续升级新版本时继续执行这条迁移命令即可，不会清空已有数据。

#### 1.4 启动服务

```bash
PORT=3000 KANBAN_SQLITE_PATH=/opt/project-kanban-board-data/kanban.sqlite ./node_modules/.bin/vinext start --hostname 0.0.0.0
```

同一局域网内访问：

```text
http://服务器IP:3000
```

#### 1.5 systemd 示例

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

#### 1.6 升级流程

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

### 2. Windows 服务器部署

Windows 服务器也可以部署，但要注意两点：

- 不要把 Linux 或 macOS 的 `node_modules/` 直接拷到 Windows 上
- Windows 上启动可执行文件是 `vinext.cmd`，不是 `vinext`

#### 2.1 在 Windows 构建机准备离线包

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

打包时同样要排除 `.git`、`.data`、`.next`、`.vinext` 和其它运行时缓存目录。离线包需要包含 `node_modules`、`dist`、`scripts`、`drizzle`、`package.json` 和 `pnpm-lock.yaml`。

#### 2.2 在 Windows 服务器解压

```powershell
New-Item -ItemType Directory -Force -Path C:\project-kanban-board | Out-Null
Expand-Archive -Path C:\project-kanban-board-offline.zip -DestinationPath C:\project-kanban-board -Force
Set-Location C:\project-kanban-board
```

#### 2.3 初始化或升级 SQLite

```powershell
New-Item -ItemType Directory -Force -Path C:\project-kanban-board-data | Out-Null
$env:KANBAN_SQLITE_PATH = 'C:\project-kanban-board-data\kanban.sqlite'
node scripts/migrate-local-sqlite.mjs
```

#### 2.4 启动服务

```powershell
$env:PORT = '3000'
$env:KANBAN_SQLITE_PATH = 'C:\project-kanban-board-data\kanban.sqlite'
.\node_modules\.bin\vinext.cmd start --hostname 0.0.0.0
```

局域网访问地址：

```text
http://服务器IP:3000
```

#### 2.5 Windows 后台运行

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

#### 2.6 Windows 升级流程

```powershell
Stop-Service project-kanban-board
Remove-Item -Recurse -Force C:\project-kanban-board
Expand-Archive -Path C:\project-kanban-board-offline.zip -DestinationPath C:\project-kanban-board -Force
Set-Location C:\project-kanban-board
$env:KANBAN_SQLITE_PATH = 'C:\project-kanban-board-data\kanban.sqlite'
node scripts/migrate-local-sqlite.mjs
Start-Service project-kanban-board
```

## Docker 部署

### 构建多平台镜像

项目支持在 x86_64 (amd64) 和 ARM64 (aarch64) 架构上构建和运行。

#### 本地单平台构建

```bash
# 构建当前架构镜像
docker build -t project-kanban-board:latest .

# 指定架构构建
docker build --platform linux/amd64 -t project-kanban-board:amd64 .
docker build --platform linux/arm64 -t project-kanban-board:arm64 .
```

#### 多平台构建并推送到镜像仓库

```bash
# 创建 multi-platform builder（仅首次）
docker buildx create --name kanban-builder --use

# 构建 amd64 + arm64 并推送到 Docker Hub
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t your-registry/project-kanban-board:latest \
  --push .

# 或只构建不推送，导出为本地 tar
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t project-kanban-board:latest \
  --output type=tar,dest=kanban-multiarch.tar .
```

### SQLite 部署

```bash
docker compose -f docker-compose.sqlite.yml up -d
```

- 数据持久化在 Docker volume `kanban-data` 中
- 容器启动时自动执行 SQLite 迁移
- 访问 `http://服务器IP:3000`
- 默认管理员：`admin` / `admin@123`

指定宿主机目录存放数据库：

```bash
KANBAN_DATA_DIR=/opt/kanban-data docker compose -f docker-compose.sqlite.yml up -d
```

### PostgreSQL 部署

```bash
# 设置 PostgreSQL 密码
export POSTGRES_PASSWORD=your_secure_password
export KANBAN_AUTH_SECRET=your_random_secret
docker compose -f docker-compose.postgres.yml up -d
```

- PostgreSQL 16 Alpine 镜像，数据持久化在 `pgdata` volume
- kanban 容器等待 PG healthcheck 通过后启动
- 自动执行 PostgreSQL 迁移

### Docker 离线部署

适合内网无法联网的服务器。

#### 1. 在外网构建机上准备

```bash
# 构建镜像（指定目标服务器架构，如 ARM64）
docker build --platform linux/arm64 -t project-kanban-board:v1.0 .

# 导出镜像为 tar
docker save -o project-kanban-board-v1.0.tar project-kanban-board:v1.0

# 压缩（可选）
gzip project-kanban-board-v1.0.tar
```

如果目标服务器是 x86_64：

```bash
docker build --platform linux/amd64 -t project-kanban-board:v1.0 .
docker save -o project-kanban-board-v1.0-amd64.tar project-kanban-board:v1.0
```

导出多架构镜像包（同时支持 amd64 和 arm64）：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t project-kanban-board:v1.0 \
  --output type=oci,dest=kanban-v1.0-oci.tar .
```

#### 2. 传输到内网服务器

```bash
scp project-kanban-board-v1.0.tar.gz user@内网服务器:/opt/
# 或使用 U 盘、移动硬盘等物理介质
```

#### 3. 在内网服务器上导入并运行

```bash
# 解压
gunzip project-kanban-board-v1.0.tar.gz

# 导入镜像
docker load -i project-kanban-board-v1.0.tar

# 创建数据目录
mkdir -p /opt/kanban-data

# SQLite 模式运行
docker run -d \
  --name kanban \
  -p 3000:3000 \
  -v /opt/kanban-data:/data \
  -e KANBAN_AUTH_SECRET=your-random-secret \
  -e KANBAN_SUPER_ADMIN_USERNAME=admin \
  -e KANBAN_SUPER_ADMIN_PASSWORD=your-secure-password \
  --restart unless-stopped \
  project-kanban-board:v1.0

# 或使用 docker compose（需将镜像 tag 写入 compose 文件）
docker compose -f docker-compose.sqlite.yml up -d
```

#### 4. 确认运行状态

```bash
docker logs kanban
curl http://localhost:3000
```

### 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `KANBAN_DB_DRIVER` | `sqlite` | 数据库驱动：`sqlite` 或 `postgres` |
| `KANBAN_SQLITE_PATH` | `.data/kanban.sqlite` | SQLite 数据库文件路径 |
| `POSTGRES_URL` | - | PostgreSQL 连接字符串 |
| `KANBAN_AUTH_SECRET` | 内置占位 | Session 加密密钥，生产必须修改 |
| `KANBAN_SUPER_ADMIN_USERNAME` | `admin` | 初始超级管理员用户名 |
| `KANBAN_SUPER_ADMIN_PASSWORD` | `admin@123` | 初始超级管理员密码，部署后立即修改 |

## 活动记录

活动记录是全局审计日志，不属于某个任务详情。项目创建、项目更新、归档/恢复、任务创建、任务更新、状态变更、删除、跨阶段移动、任务拆解创建/勾选/删除会写入 `task_activity` 表。纯拖拽排序只保存卡片位置，不写活动记录。跨阶段移动会记录任务名称和阶段变化。访问看板或活动接口时会按系统参数 `activity_retention_days` 自动清理过期记录，默认保留 180 天。

## 数据库

```bash
pnpm run db:generate
pnpm run db:migrate:local
```

schema 位于 `db/schema.ts`，生成的迁移文件位于 `drizzle/`。系统参数存放在 `system_parameters` 表，当前包含 `due_soon_days` 和 `activity_retention_days`，前端系统参数抽屉和 `/api/settings` 会读写这些值。任务完成时间存放在 `tasks.completed_at`，用于判断已完成任务是否超期完成。
