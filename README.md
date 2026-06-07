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

不要在内网服务器执行 `pnpm install`。依赖需要在一台能访问 npm registry 的同系统、同 CPU 架构机器上提前装好，并把 `node_modules/` 和 `dist/` 一起打包带入内网。

### 1. 外网构建机准备离线包

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

打包完成后确认离线包包含 `node_modules/`、`dist/server/index.js`、`scripts/migrate-local-sqlite.mjs`、`package.json` 和 `pnpm-lock.yaml`。把 `project-kanban-board-offline.tgz` 传到内网服务器。外网构建机和内网服务器必须使用兼容的操作系统、CPU 架构和 Node.js 主版本，否则部分原生依赖可能不可用。

### 2. 内网服务器解压

```bash
mkdir -p /opt/project-kanban-board
tar -xzf project-kanban-board-offline.tgz -C /opt/project-kanban-board
cd /opt/project-kanban-board
```

### 3. 初始化或升级 SQLite

```bash
mkdir -p /opt/project-kanban-board-data
KANBAN_SQLITE_PATH=/opt/project-kanban-board-data/kanban.sqlite node scripts/migrate-local-sqlite.mjs
```

`KANBAN_SQLITE_PATH` 指向真实业务数据库文件。后续升级新版本时继续执行这条迁移命令即可，不会清空已有数据。

### 4. 启动服务

```bash
PORT=3000 KANBAN_SQLITE_PATH=/opt/project-kanban-board-data/kanban.sqlite ./node_modules/.bin/vinext start --hostname 0.0.0.0
```

同一局域网内访问：

```text
http://服务器IP:3000
```

### 5. systemd 示例

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

### 6. 升级流程

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

## 活动记录

活动记录是全局审计日志，不属于某个任务详情。项目创建、项目更新、归档/恢复、任务创建、任务更新、状态变更、删除、跨阶段移动、任务拆解创建/勾选/删除会写入 `task_activity` 表。纯拖拽排序只保存卡片位置，不写活动记录。跨阶段移动会记录任务名称和阶段变化。访问看板或活动接口时会按系统参数 `activity_retention_days` 自动清理过期记录，默认保留 180 天。

## 数据库

```bash
pnpm run db:generate
pnpm run db:migrate:local
```

schema 位于 `db/schema.ts`，生成的迁移文件位于 `drizzle/`。系统参数存放在 `system_parameters` 表，当前包含 `due_soon_days` 和 `activity_retention_days`，前端系统参数抽屉和 `/api/settings` 会读写这些值。任务完成时间存放在 `tasks.completed_at`，用于判断已完成任务是否超期完成。
