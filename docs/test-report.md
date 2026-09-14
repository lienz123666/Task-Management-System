# 测试报告

记录关键场景的验证结果，对应需求文档第 13 节验收清单与列表/统计/权限边界。

| 项 | 内容 |
|----|------|
| 日期 | 2026-09-14 |
| 机器 | Windows 10，Python 3.12.7 |
| 命令 | 在 `backend/` 下执行 `uv run pytest` |
| 库 | SQLite 内存库（`tests/conftest.py` 在导入应用前设置 `DATABASE_URL`，不连 Docker 里的 PostgreSQL） |
| 结果 | **52 passed**，约 32s（1 条 Starlette `BlockingPortal` 弃用警告，与用例无关） |

前端冒烟在 `http://localhost:8080`（Docker Compose：frontend 8080、backend 8000、db 健康）。

---

## 1. 自动化（pytest）

### 1.1 健康检查与认证

| 场景 | 用例 | 期望 | 结果 |
|------|------|------|------|
| 健康检查无需登录 | `test_health_ok`、`test_health_does_not_require_login` | `GET /api/health` 200，`{"status":"ok"}` | 通过 |
| 正确账号登录 | `test_login_success` | 200，返回 `access_token` | 通过 |
| 错密码 / 未知用户 | `test_login_wrong_password`、`test_login_unknown_user` | 401，文案为「用户名或密码错误」 | 通过 |
| 缺字段 | `test_login_missing_field_is_422` | 422 | 通过 |
| 无 token / 伪造 token | `test_me_without_token`、`test_me_with_forged_token` | `/api/auth/me` 401 | 通过 |
| 有效 token | `test_me_with_valid_token` | 200，不含密码哈希 | 通过 |
| 引导首位管理员 | `test_lifespan_creates_initial_admin` | 空库启动后可用 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 登录 | 通过 |
| 引导幂等 | `test_ensure_initial_admin_is_idempotent` | 再次启动不重复创建 | 通过 |
| 密码不明文；JWT 可编解码 | `test_security.py` 四条 | 哈希不可逆回明文；非法 token 解码失败 | 通过 |

### 1.2 用户

| 场景 | 用例 | 期望 | 结果 |
|------|------|------|------|
| 未登录 | `test_list_users_requires_login`、`test_create_user_requires_login` | 401 | 通过 |
| 管理员创建成员并可登录 | `test_admin_can_create_member_and_list_users`、`test_created_member_can_login` | 201；新账号能拿 token | 通过 |
| 管理员可再创建管理员 | `test_admin_can_create_another_admin` | 201，`role=admin` | 通过 |
| 成员不可创建用户 | `test_member_cannot_create_user` | 403 | 通过 |
| 成员可读用户名单 | `test_member_can_list_users` | 200，供负责人下拉 | 通过 |
| 重名 / 非法角色 / 空用户名 | `test_duplicate_username_is_422` 等 | 422 | 通过 |

### 1.3 任务 CRUD 与权限

| 场景 | 用例 | 期望 | 结果 |
|------|------|------|------|
| 未登录不能访问任务/统计 | `test_create_task_requires_login`、`test_list_and_stats_require_login` | 401 | 通过 |
| 优先级必填；状态默认 todo | `test_create_requires_priority_and_existing_assignee`、`test_create_task_defaults_status_todo` | 缺 priority 或无效负责人 422；默认 `todo` | 通过 |
| 标题校验 | `test_create_title_validation` | 空白或超 200 字 422 | 通过 |
| 忽略客户端伪造的 id/时间戳 | `test_create_task_ignores_client_ids_and_timestamps` | 服务端自行生成 | 通过 |
| 成员可给他人派活、可看全部未删 | `test_member_can_create_for_others_and_view_all` | 200 | 通过 |
| 成员只能改/删自己负责的 | `test_member_cannot_update_or_delete_others_task`、`test_member_can_update_and_delete_own_task` | 他人 403；自己 200 | 通过 |
| 管理员可改任意未删任务 | `test_admin_can_update_any_task`、`test_admin_can_mutate_any_task` | 允许 | 通过 |
| PUT 全量；状态可回退 | `test_put_requires_full_fields_and_allows_status_rollback` | 缺字段 422；`done`→`todo` 允许 | 通过 |
| 改负责人后原成员立即失权 | `test_assignee_change_revokes_old_member_immediately` | 再 PATCH/DELETE 为 403 | 通过 |
| 软删除：成员 404，管理员详情可见 | `test_soft_delete_hides_from_member_but_admin_can_get` | 成员 GET 404；管理员 GET 仍可见 | 通过 |
| 对已删再改/再删、未知 id | `test_mutate_deleted_task_is_404`、`test_unknown_task_is_404` | 404 | 通过 |

### 1.4 列表过滤、分页、排序、统计

| 场景 | 用例 | 期望 | 结果 |
|------|------|------|------|
| 默认分页 20、不含已删 | `test_list_default_pagination_and_excludes_deleted` | `page_size=20`；已删不出现 | 通过 |
| `page_size>100` / `page=0` | `test_page_size_over_100_is_422`、`test_page_starts_at_one` | 422 | 通过 |
| 过滤精确匹配且 AND | `test_filters_are_exact_and_combined_with_and` | status、priority、assignee 可组合 | 通过 |
| 非法枚举 | `test_invalid_filter_is_422` | 422 | 通过 |
| 排序：优先级再按创建时间降序 | `test_sorts_by_priority_then_created_at_desc` | high→medium→low，同级新的在前 | 通过 |
| 分页切片 | `test_pagination_slices_sorted_results` | 页之间 id 不重叠，`total` 一致 | 通过 |
| 成员 `include_deleted=true` | `test_member_include_deleted_is_403` | 403 | 通过 |
| 管理员列表可含已删 | `test_admin_include_deleted_lists_soft_deleted` | 已删出现且带 `deleted_at` | 通过 |
| 统计不含已删、忽略查询参数；含 priority / assignees | `test_stats_exclude_deleted_and_ignore_list_filters` | 带 `status`/`include_deleted` 结果不变；已删不计入；assignees 按件数降序 | 通过 |

---

## 2. 手工冒烟（Docker Compose）

环境：`docker compose up -d --build` 后三容器运行；`GET /api/health` 200；Swagger `http://localhost:8000/docs` 200。

| 场景 | 操作 | 期望 | 结果 |
|------|------|------|------|
| 一键启动 | 浏览器打开 8080 | 登录页或已登录工作台 | 通过 |
| 成员登录 | `member_verify` | 进入工作台，无「用户与权限」「已删除」入口 | 通过 |
| 列表 CRUD | 工作台新建 / 打开编辑 / 软删（仅自己的任务出删除按钮） | 保存后列表更新；他人任务无删除 | 通过 |
| 过滤 | 状态「待办」、优先级「中」、负责人下拉 | 列表为 AND 结果 | 通过 |
| 统计 KPI | 打开「任务统计看板」 | 总数 14，与未删任务一致 | 通过 |
| 图表 | 状态环、优先级柱、负责人排行 | 有真实件数；待办约 79%；完成率用 `done/count`（如 dave 50%） | 通过 |
| 点图筛选 | 点待办图例 → 工作台；再点「中」；再点 dave | 只改对应筛选，分页第 1 页；待办 11 条；待办+中为 10 条；再叠 dave 后 0 条（dave 无待办+中） | 通过 |
| 再点取消 | 再点 dave | 负责人回到「全部」，其它筛选仍在 | 通过 |
| 空态 | 用空统计渲染三图 | 三处「还没有任务」，没有可点筛选 | 通过 |
| 「其余」 | 超过 7 人时第 8 档合并 | 点「其余」不跳转 | 通过 |
| 已删不进图 | 对比 `/api/stats` 与带 `include_deleted` 的列表 | 统计 `total` 小于含已删的列表 `total` | 通过 |
| 管理员 | `GET /api/stats`（admin token） | 与成员同一套未删聚合，图不含已删 | 通过 |

时间段、部门、导出仍为禁用占位，不在本期验收范围。

---

## 3. 结论

关键场景均有结果：接口层 52 条自动化全部通过；Compose 上登录、CRUD、过滤、统计与看板点选均已核对。未覆盖项：Linux 实机 `./deploy.sh` 冒烟（需目标服务器）、前端没有单独的 JS 单测（以浏览器冒烟代替）。
