# 权限控制重构暂存方案

日期：2026-07-02

本文档用于暂存权限控制重构方案。当前先不动工，等基础业务需求完成后，再按这里的方向继续引入和重构。

## 结论

当前项目已经有权限控制，但不是一套可长期扩展的权限架构。

现状更接近：

- 用户角色硬编码：`super_admin`、`project_manager`、`development_manager`、`team_member`
- 资源关系硬编码：看板 owner/viewer/admin、团队成员、任务负责人、测试员
- 页面、组件、API route、repository 各自判断权限
- 前端部分按钮甚至通过注入 CSS 隐藏

建议方向：

先做一层中心化的 policy/ability 权限模块，采用 CASL 风格的 `can(user, action, resource, context)` 判断模型。第一阶段不急着引入数据库权限表，也不急着上 OpenFGA 这类重型方案。

## 业内方案选择

### 推荐：CASL 风格 Ability/Policy

适合当前项目。

特点：

- 前后端都能使用同一套动作和资源语义
- 前端菜单、按钮可读同一份权限结果
- 服务端 API/repository 可用同一套 `requirePermission`
- 对 TypeScript/React 友好
- 可以先自己实现纯函数，后续再平滑切到 CASL 库

适用判断示例：

```ts
can(user, "update", "task", { task, board, settings });
can(user, "manage", "settings", { board });
can(user, "view", "admin");
```

### 可选：CASL

如果决定直接用成熟库，优先考虑 CASL。

优点：

- 成熟、轻量
- React 集成自然
- `can("update", "Task")` 表达清晰

缺点：

- 数据库查询过滤仍要自己实现
- 当前项目资源关系较多，仍需要封装 context 构建逻辑

### 暂不建议：Casbin

Casbin 更适合权限策略需要配置化、存数据库、做后台授权管理的阶段。

它适合未来场景：

- 自定义角色
- 后台配置角色权限
- 用户单独授权
- 多租户权限模型

但现在直接上 Casbin 会偏重，迁移成本和概念负担较高。

### 暂不建议：OpenFGA / Zanzibar 类系统

这类方案适合多系统、微服务、统一授权中心和复杂组织关系。

当前项目是单体看板系统，现阶段引入会把权限问题复杂化。

## 当前代码里的主要问题

### 1. 角色判断散落

示例位置：

- `lib/server-session.ts`：`requireAdminUser` 直接判断角色
- `lib/repositories/kanban-repository.ts`：`isManagementRole`、`canCreateTasks`、`requireBoardRead` 等判断集中但未抽象成通用 policy
- `components/authenticated-shell.tsx`：顶部菜单用 `canUseAdmin`
- `components/kanban-app.tsx`：看板页用 `canManageProjects`、`canEditTask`
- `components/admin-app.tsx`：后台页使用 `permissions.canManageUsers` 和局部角色判断

问题：

同一个业务能力在多个地方以不同形式表达。后续新增角色或新增按钮时，很容易漏改某个入口。

### 2. UI 权限和服务端权限没有统一来源

服务端 repository 有兜底，这是正确的。但前端菜单/按钮显示逻辑不是从服务端统一权限结果派生。

风险：

- 前端显示一个按钮，但服务端拒绝
- 前端隐藏一个入口，但服务端其实允许
- 角色变化后菜单、按钮、接口行为不一致

### 3. 使用 CSS 隐藏按钮是技术债信号

`authenticated-shell` 中存在类似通过 style 注入隐藏按钮的做法。

这只能作为临时补丁，不应该作为权限体系的一部分。

目标应改为：

```tsx
{permissions.settings.canManage ? <SettingsButton /> : null}
```

而不是：

```tsx
<style>{'button[title="系统参数"]{display:none!important}'}</style>
```

### 4. 权限粒度已经超出纯 RBAC

当前系统并不只是“角色决定一切”。

还包含：

- 看板 owner/viewer
- 看板关联团队
- 团队 owner/member
- 项目所属团队
- 任务负责人/测试员
- 系统参数开关
- 大屏公开访问

因此单纯 RBAC 不够，应采用：

RBAC + resource context + relationship checks

## 推荐目标架构

新增目录：

```text
lib/permissions/
  permission-types.ts
  permission-context.ts
  define-ability.ts
  require-permission.ts
  ui-permissions.ts
```

### permission-types.ts

定义稳定的资源和动作枚举。

```ts
export type PermissionAction =
  | "view"
  | "create"
  | "update"
  | "delete"
  | "manage"
  | "archive"
  | "grant"
  | "revoke";

export type PermissionResource =
  | "admin"
  | "user"
  | "team"
  | "board"
  | "project"
  | "task"
  | "subtask"
  | "settings"
  | "auditLog"
  | "dashboard";
```

### permission-context.ts

统一承载判断需要的上下文。

```ts
export type PermissionContext = {
  board?: BoardSummary;
  project?: Project;
  task?: BoardTask;
  team?: TeamSummary;
  targetUser?: ManagedUser;
  settings?: SystemSettings;
};
```

### define-ability.ts

集中表达规则。

```ts
export function can(
  user: CurrentUser,
  action: PermissionAction,
  resource: PermissionResource,
  context: PermissionContext = {}
) {
  // 所有权限规则集中放这里
}
```

第一阶段不需要追求 DSL，先用清晰的纯函数即可。

### require-permission.ts

服务端统一强制入口。

```ts
export function requirePermission(
  user: CurrentUser,
  action: PermissionAction,
  resource: PermissionResource,
  context?: PermissionContext
) {
  if (!can(user, action, resource, context)) {
    throw new Error("Forbidden");
  }
}
```

后续 repository 里的 `requireBoardRead`、`requireBoardWrite`、`requireBoardAdmin` 可以逐步变成这个函数的薄封装。

### ui-permissions.ts

给前端一个稳定结构，避免组件里到处写角色判断。

```ts
export type UiPermissions = {
  menu: {
    admin: boolean;
    dashboard: boolean;
    profile: boolean;
  };
  settings: {
    canManage: boolean;
  };
  project: {
    canCreate: boolean;
    canUpdate: boolean;
    canArchive: boolean;
  };
  task: {
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    canRework: boolean;
  };
};
```

页面只消费 `UiPermissions`，不直接关心角色。

## 第一阶段不建议改数据库

当前数据结构已经足够支撑中心化权限判断：

- `users.role`
- `boards.owner_user_id`
- `board_members`
- `teams.owner_user_id`
- `team_members`
- `board_teams`
- `projects.team_id`
- `tasks.owner_user_id`
- `tasks.tester_user_id`
- `system_parameters`

只有后续明确要支持这些能力时，再考虑新增权限表：

- 自定义角色
- 后台配置角色权限
- 给用户单独授权
- 给团队单独授权某个菜单或按钮
- 权限变更审计

## 初始权限矩阵草案

此矩阵需要在正式动工前和业务口径再确认。

| 资源/动作 | 超管 | 项目经理 | 开发经理 | 团队成员 |
| --- | --- | --- | --- | --- |
| 进入后台 | 是 | 是 | 是 | 否 |
| 管理用户 | 是 | 受系统参数控制 | 受系统参数控制 | 否 |
| 创建超管 | 是 | 否 | 否 | 否 |
| 管理团队 | 是 | 自己负责的团队 | 自己负责的团队 | 否 |
| 管理看板 | 是 | 自己负责/有权限的看板 | 自己负责/有权限的看板 | 否 |
| 查看看板 | 是 | 有看板或团队关系 | 有看板或团队关系 | 有看板或团队关系 |
| 管理系统参数 | 是 | 否 | 否 | 否 |
| 创建项目 | 是 | 有看板写权限 | 有看板写权限 | 否 |
| 编辑项目 | 是 | 有看板写权限 | 有看板写权限 | 否 |
| 归档项目 | 是 | 有看板写权限 | 有看板写权限 | 否 |
| 创建任务 | 是 | 是 | 是 | 是 |
| 编辑任务 | 是 | 是 | 是 | 仅本人相关任务 |
| 删除任务 | 是 | 是 | 是 | 仅本人相关任务 |
| 任务拆解 | 是 | 是 | 是 | 仅本人相关任务 |
| 查看审计 | 是 | 自己范围内 | 自己范围内 | 否 |
| 查看负载大屏 | 是 | 自己范围内 | 自己范围内 | 自己范围内；公开开关开启时可匿名 |

## 迁移步骤建议

### 第 0 步：先冻结口径

输出正式权限矩阵，确认每个角色、每类资源、每个按钮/API 的行为。

这一步不改代码。

### 第 1 步：新增 policy 层

新增 `lib/permissions`。

先只迁移纯判断逻辑，不动页面结构、不改数据库。

### 第 2 步：接入前端菜单和按钮

优先替换这些位置：

- 顶部菜单
- 系统参数按钮
- 新建项目/编辑项目/归档项目按钮
- 后台用户 tab
- 任务编辑/删除/返工按钮

目标：

前端不再直接写 `user.role === ...`。

### 第 3 步：接入 API route 和 repository

把现有 `requireXxx` 函数改成调用统一 policy。

保留函数名作为兼容层，减少一次性改动范围。

示例：

```ts
async requireBoardWrite(actor: CurrentUser, boardId: string) {
  const board = await this.getBoardSummaryById(actor, boardId);
  requirePermission(actor, "update", "board", { board });
}
```

### 第 4 步：统一返回 UI permissions

在 `getBoard`、后台初始化接口、用户会话接口中返回可直接消费的权限结构。

前端组件只读权限结果，不重复推导。

### 第 5 步：补测试

至少补三类测试：

- `can()` 权限矩阵单元测试
- repository 强制权限测试
- 前端关键按钮显示/隐藏测试

## 验收标准

完成重构后，应满足：

- 新增一个角色时，主要只改 `lib/permissions`
- 新增一个按钮时，先定义资源动作，再从 `UiPermissions` 读取
- 服务端和前端使用同一套权限语义
- 删除 CSS 隐藏权限按钮的做法
- repository 仍是最终安全边界
- README 里的角色权限说明和 policy 保持一致

## 暂缓项

这些不是第一阶段目标：

- 自定义角色管理
- 权限后台配置页面
- 权限表设计
- OpenFGA/Casbin 引入
- 多租户组织模型

等现有业务需求稳定后，再评估是否需要进入第二阶段。
