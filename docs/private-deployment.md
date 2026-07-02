# 私有部署日志定位

本文档记录内网或私有化 Docker 部署时的日志查看方式。完整部署步骤以仓库根目录 `README.md` 为准。

## 日志位置

Docker 镜像默认开启控制台日志和文件日志：

- 控制台：`docker logs kanban`
- 文件：`/data/logs/kanban.log`
- 关键业务日志：`/data/logs/kanban-business.log`

默认日志目录由 `KANBAN_LOG_DIR=/data/logs` 控制。SQLite compose 会随 `/data` 数据卷保留日志；PostgreSQL compose 会用 `kanban-logs` 卷保留应用日志。

## 常用命令

```bash
docker logs kanban --tail 200
docker logs kanban -f
docker exec -it kanban sh
tail -n 200 /data/logs/kanban.log
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

## 脱敏规则

结构化日志会对字段名或字符串中的敏感内容脱敏，包括：

- `password`
- `token`
- `secret`
- `cookie`
- `authorization bearer`

排障时不要把真实密码、令牌或 cookie 手工写进日志、截图或工单。
