# 实现计划

依据《需求分析.md》制定。每个阶段以「能运行、能验证」为边界。

---

## 0. 已确认的实现决策

需求文档中标注为「实现时选定一种」的条目，以及实现前必须补充定义的语义，在此固化。后续实现与 `docs/api.md` 均以本节为准。

| 条目 | 决定 | 理由 |
|------|------|------|
| 校验失败状态码 | `422` | FastAPI / Pydantic 默认值，无需额外异常处理器 |
| `page_size` 超过 100 | 返回 `422` | 静默截断会让前端误以为拿到了全部数据 |
| 成员传 `include_deleted=true` | 返回 `403` | 需求文档 7.3 的倾向 |
| 路径前缀 | 统一加 `/api` | nginx 将 `/api/*` 反代到后端，前端为同源请求，免去 CORS 与跨域携带 token 的配置 |
| JWT 过期时间 | 24 小时 | 内部工具，减少重复登录 |

补充语义定义：

- **PUT 全量更新**：必须提交 `title`、`assignee`、`status`、`priority`；`description` 可省略，省略即视为清空为 `null`。这是 PUT 与 PATCH 的唯一区别，不明确则两个接口行为重合。
- **数据库访问**：同步 SQLAlchemy 2.0 + `psycopg`。本期无高并发诉求，同步代码调试成本更低。
- **建表方式**：lifespan 中执行 `Base.metadata.create_all`，不引入 Alembic（迁移不在本期范围）。

受 `/api` 前缀影响，需求文档 7.1、7.2 的路径表在实现与 API 文档中一律加前缀，例如 `GET /api/health`、`POST /api/auth/login`、`GET /api/tasks`。

### 测试约定

每个阶段完成后必须补齐并跑通对应测试，再进入下一阶段。

- 位置：`backend/tests/`，按领域分文件（`test_health.py`、`test_auth.py`、后续 `test_users.py` / `test_tasks.py` / `test_stats.py`）。
- 运行：在 `backend/` 下执行 `pip install -r requirements-dev.txt`，再执行 `pytest`。
- 数据库：测试使用 SQLite 内存库，不依赖 Docker 或本机 PostgreSQL；生产与本地联调仍用 compose 中的 PostgreSQL。
- 覆盖范围：该阶段新增/改动的接口（状态码、权限、校验、响应字段），以及相关纯函数（如密码哈希、JWT、权限判定）。
- 阶段 1+2 已覆盖：健康检查、登录成败、`/auth/me` 鉴权、密码哈希、JWT 编解码、初始管理员引导幂等。

### Git 与部署约定

- 远程仓库：`https://github.com/lienz123666/Task-Management-System.git`
- 每个阶段测试通过后提交并推送。
- 最终部署目标是 **Linux 服务器 + Docker Compose**（PostgreSQL、后端、前端三容器）。本地 Windows 与服务器共用同一套 `docker-compose.yml` 和 `.env.example`，不引入 Windows 专用启动脚本作为部署路径。
- 服务器上只提交代码与 `.env.example`；真实 `.env` 在服务器本地创建，不入库。
- 对外入口以前端 nginx（默认 `8080`）为准；`8000` 仅为调试端口，上线时可在 compose 中不映射。

---

## 1. 可运行的空壳 + 数据库

目标：`docker-compose up` 起三个容器，`curl /api/health` 返回 200，浏览器能打开首页。

1. 建立需求文档 2.2 的目录骨架（`backend/`、`frontend/`、`docs/`）
2. `backend/requirements.txt`、`backend/Dockerfile`
3. `app/config.py` — pydantic-settings 读取数据库 URL、JWT 密钥与过期时间、初始管理员凭据
4. `app/database.py` — 引擎、`SessionLocal`、`Base`
5. `app/main.py` — 仅创建 app、挂载 health 路由、空 lifespan
6. `app/routers/health.py` — `GET /api/health`
7. `docker-compose.yml` — postgres 配 healthcheck，backend 用 `depends_on: condition: service_healthy`
8. `frontend/nginx.conf`（静态文件 + `/api` 反代）、`frontend/Dockerfile`、占位 `index.html`
9. `.env.example`、`.gitignore`

验收：三容器 healthy；`/api/health` 可访问；后端日志显示数据库连接成功。

---

## 2. 数据模型 + 认证

目标：用环境变量引导出的管理员账号登录并取得 token。

1. `app/models.py` — `User`（`username` 唯一索引）、`Task`（`assignee_id` 外键指向 users，`deleted_at` 可空）
2. `app/security.py` — 密码 hash / verify（passlib + bcrypt）、JWT encode / decode
3. `app/schemas/auth.py`、`app/schemas/user.py` — 登录请求、token 响应、用户响应（不含 `password_hash`）
4. `app/crud/user.py` — 按用户名查询、创建、列表
5. `app/deps.py` — `get_db`、`get_current_user`（失败 401）、`require_admin`（失败 403）
6. `app/main.py` lifespan 补充建表与引导首位管理员：先查库中是否已有 admin，有则跳过
7. `app/routers/auth.py` — `POST /api/auth/login`、`GET /api/auth/me`

验收：容器首次启动自动建出管理员；可用其登录取得 token；不带 token 访问 `/api/auth/me` 得 401；伪造或过期 token 得 401；二次启动不重复创建管理员。

测试：`backend/tests/test_health.py`、`test_auth.py`、`test_security.py`、`test_bootstrap.py` 全部通过。

---

## 3. 用户管理

目标：管理员可创建用户；所有登录用户可获取用户名单以填充负责人下拉框。

1. `app/schemas/user.py` 补充创建请求（`username` / `password` / `role`）
2. `app/crud/user.py` 补充重名检查
3. `app/routers/users.py` — `POST /api/users`（`require_admin`）、`GET /api/users`（登录即可）

验收：管理员创建 member 成功；member 调 `POST /api/users` 得 403；重名创建返回明确校验错误而非 500；响应中不出现密码哈希。

---

## 4. 任务的创建、详情、更新、软删除

权限逻辑的主要部分，单独成阶段。

1. `app/schemas/task.py` — 创建、PUT、PATCH（字段全 optional）、响应（含 `assignee_username`）
2. 字段校验：`title` 去除两端空格后非空且不超过 200 个 Unicode 字符；`description` 不超过 2000；`priority` 必填；`status` 默认 `todo`
3. `app/crud/task.py` — 创建、按 id 查询（可选是否包含已删）、更新、软删除；所有查询默认附加 `deleted_at IS NULL`
4. 共享的权限判定函数：管理员，或 `task.assignee_id == current_user.id`
5. `app/routers/tasks.py` — `POST`、`GET /{id}`、`PUT /{id}`、`PATCH /{id}`、`DELETE /{id}`

需逐条实现的边界（对应需求文档 7.6）：

- 更新或删除已软删任务返回 `404`，而非 `403`（视为不存在）
- 成员 GET 已软删任务 id 返回 `404`；管理员 GET 可见
- 成员改动他人负责的任务返回 `403`
- 变更 `assignee` 后原负责人立即失去改删权
- `assignee_id` 指向不存在的用户返回校验错误
- 更新成功刷新 `updated_at`；创建时 `updated_at` 等于 `created_at`
- `id`、`created_at`、`updated_at`、`deleted_at` 由服务端生成，客户端提交无效

验收：上述每条边界各执行一次请求确认。

---

## 5. 列表查询与统计

1. `GET /api/tasks` 过滤：`status` / `priority` / `assignee`，组合为 AND，精确匹配
2. 分页：`page` 从 1 起、默认 1；`page_size` 默认 20、上限 100，超限 `422`；响应含 `items` / `total` / `page` / `page_size`
3. 排序：优先级 `high > medium > low` 在前，同优先级内 `created_at` 降序。需用 `CASE WHEN priority = 'high' THEN 0 ...` 表达，不可直接按字符串排序（否则得到字母序 `doing / done / todo`）
4. `include_deleted`：仅管理员有效，成员传入返回 `403`
5. `GET /api/stats` — 总数与三种状态计数，单条 `GROUP BY` 查询；恒定排除已软删，不受过滤条件与 `include_deleted` 影响

验收：造 6~8 条不同优先级与创建时间的任务，确认排序为「high 在前、同级新的在前」；确认带 `include_deleted` 时 `/api/stats` 数字不变。

---

## 6. 前端

1. `js/api.js` — fetch 封装，统一注入 `Authorization` 头，遇 401 跳回登录
2. `js/auth.js` — 登录、token 存取（localStorage）、当前用户信息缓存
3. `index.html` + `css/styles.css` — 登录视图与主视图
4. `js/app.js` — 任务列表渲染（过滤器、分页控件）、创建 / 编辑表单（负责人下拉来自 `GET /api/users`）、删除确认、统计数字区
5. 按角色控制界面：非管理员隐藏创建用户入口；他人负责的任务不显示编辑与删除按钮

验收：完整走通管理员登录 → 创建 member → 创建任务 → member 登录 → 仅能改动自己负责的任务。

---

## 7. 文档与验收

1. `docs/api.md` — 与实现逐条对齐，含本文第 0 节确定的状态码与分页行为
2. `docs/deployment.md` — 面向 Linux 服务器：Docker / Compose 安装、`.env` 配置、`docker compose up -d --build`、JWT 过期时间、端口与防火墙
3. `docs/troubleshooting.md`、`README.md`、`deploy.sh`（在服务器上执行：拉代码、检查 `.env`、构建并启动、健康检查）
4. 按需求文档第 13 节验收清单逐项核对
5. 在 Linux 上用同一套 compose 做一次完整冒烟（登录、建用户、建任务、统计）

---

## 阶段依赖与交付建议

阶段 1 → 2 → 3 → 4 → 5 必须顺序进行，每层都依赖前一层的 `deps.py` 与 `models.py`。

阶段 6 的前端需等阶段 5 的接口齐备才能全量联调，但 `api.js` 与 `auth.js` 在阶段 3 之后即可先行编写。

阶段 7 的 `docs/api.md` 建议随实现同步记录，不集中到最后补写。

建议将阶段 1 与阶段 2 合并为第一次交付：只有能登录之后才有可验证的功能，单独交付空壳意义有限。
