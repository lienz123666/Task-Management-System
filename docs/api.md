# API 说明

路径一律带 `/api` 前缀。除健康检查与登录外，请求头需携带：

```http
Authorization: Bearer <access_token>
```

时间戳均为 UTC，ISO 8601。校验失败统一 **422**；未认证 **401**；已认证但权限不足 **403**；当前用户不可见的资源 **404**。

JWT 有效期由 `JWT_EXPIRE_HOURS` 决定，默认 **24 小时**。登录响应中的 `expires_in` 为秒。

---

## 健康检查

### `GET /api/health`

无需登录。

```json
{ "status": "ok" }
```

---

## 认证

### `POST /api/auth/login`

请求：

```json
{ "username": "admin", "password": "..." }
```

成功 200：

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 86400
}
```

用户名或密码错误：**401**，`detail` 为「用户名或密码错误」。缺字段：**422**。

### `GET /api/auth/me`

返回当前用户（不含密码）：

```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "created_at": "2026-09-14T02:00:00Z"
}
```

`role` 仅为 `admin` 或 `member`。

---

## 用户

### `GET /api/users`

任意已登录用户。用于负责人下拉。按创建顺序返回全部用户，不含 `password_hash`。

### `POST /api/users`

仅管理员。成功 **201**。

```json
{ "username": "alice", "password": "...", "role": "member" }
```

- 成员调用：**403**
- 用户名已被占用或非法角色：**422**
- 用户名去两端空格后不能为空，最长 64；密码最长 128

无开放注册接口。首位管理员由环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 在库中尚无管理员时引导创建。

---

## 任务

任务状态：`todo` / `doing` / `done`。优先级：`high` / `medium` / `low`。无状态机限制。

对外一条任务：

```json
{
  "id": 1,
  "title": "核对单据",
  "description": null,
  "assignee_id": 2,
  "assignee_username": "alice",
  "status": "todo",
  "priority": "high",
  "created_at": "2026-09-14T02:00:00Z",
  "updated_at": "2026-09-14T02:00:00Z",
  "deleted_at": null
}
```

创建与更新里负责人字段名为 **`assignee`（用户 id）**；响应里为 `assignee_id` + `assignee_username`。

### `POST /api/tasks`

已登录即可。成功 **201**。必填：`title`、`assignee`、`priority`。可选：`description`、`status`（默认 `todo`）。

- `title`：去两端空格后非空，最长 200 个 Unicode 字符
- `description`：可空，最长 2000
- 负责人必须是已存在用户，否则 **422**「负责人不存在」
- 客户端不可指定 `id` / 时间戳

成员可以把负责人指定为任意已存在用户。

### `GET /api/tasks`

查询参数：

| 参数 | 说明 |
|------|------|
| `status` | 可选，精确匹配 |
| `priority` | 可选，精确匹配 |
| `assignee` | 可选，用户 id |
| `page` | 从 1 开始，默认 1 |
| `page_size` | 默认 20，最大 100；超过 100 为 **422** |
| `include_deleted` | 仅管理员。成员传入 **403** |

多个过滤条件为 **AND**。默认不含已软删。

排序：优先级 `high > medium > low`，同级按 `created_at` 降序。

响应：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 20
}
```

### `GET /api/tasks/{id}`

- 未删除：任意登录用户可见
- 已删除：管理员可见；成员 **404**

### `PUT /api/tasks/{id}`

全量更新。必须提交 `title`、`assignee`、`status`、`priority`；省略 `description` 视为清空为 `null`。

权限：管理员，或当前负责人。无权限 **403**。已删除任务 **404**。

### `PATCH /api/tasks/{id}`

只传要改的字段。权限与 PUT 相同。变更 `assignee` 后，原负责人若不是管理员则立即失去改删权。

### `DELETE /api/tasks/{id}`

软删除，写入 `deleted_at`。成功 **204**。权限与更新相同。已删除后再删 **404**。无恢复接口。

---

## 统计

### `GET /api/stats`

已登录即可。始终统计**全库未删除**任务，不受列表过滤、分页、`include_deleted` 影响。

```json
{ "total": 10, "todo": 4, "doing": 3, "done": 3 }
```

---

## 权限摘要

| 操作 | 成员 | 管理员 |
|------|------|--------|
| 查看未删任务 / 统计 / 用户名单 | 允许 | 允许 |
| 创建任务 | 允许 | 允许 |
| 改 / 删任务 | 仅自己当前负责的 | 全部未删任务 |
| 创建用户 | 403 | 允许 |
| `include_deleted=true` | 403 | 允许 |
| GET 已删任务详情 | 404 | 允许 |
