# 项目看板

一个基于 Sites vinext starter 的项目管理看板，用于跟踪项目、任务状态、优先级、进度、阻塞和活动记录。

## 功能

- 项目、优先级和关键词筛选
- 需求池、计划中、进行中、验收中、已完成五列看板
- 任务拖拽移动状态
- 任务详情编辑，包括负责人、截止日、进度、阻塞数和描述
- Cloudflare D1 持久化任务、项目和活动记录

## 本地开发

```bash
pnpm install
pnpm run dev
pnpm run lint
pnpm run build
```

本地开发环境没有 Sites 注入的 D1 绑定时，前端会使用种子数据进行预览。部署到 Sites 后，API 会通过 `.openai/hosting.json` 中声明的 `DB` 绑定读写 D1。

## 数据库

```bash
pnpm run db:generate
```

schema 位于 `db/schema.ts`，生成的迁移文件位于 `drizzle/`。
