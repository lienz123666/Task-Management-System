# 故障排查

先看容器是否都在跑，再对症状查下面的记录。通用命令：

```bash
docker compose ps
docker compose logs --tail=80 backend
docker compose logs --tail=80 db
docker compose logs --tail=80 frontend
```

---

## 真实排障记录

以下三件都在本仓库开发过程中实际遇到，不是按文档想象出来的条目。

### 1. 下拉框文字和箭头叠在一起

**现象：** 工作台「负责人」以及看板里禁用的部门/负责人下拉，选中的文字会顶到右侧小三角下面，长用户名更明显。

**排查：** 浏览器里看计算样式。项目用 CSS 去掉了系统箭头（`appearance: none`），自己画了一张 SVG 当背景。`padding-right` 不够，文字和背景图抢同一块区域；Edge 上还有 `::-ms-expand` 再画一层系统箭头。

**原因：** 自定义下拉只藏了原生箭头，没有给文字留出箭头宽度。

**处理：** 在 `frontend/css/styles.css` 里固定右侧内边距和背景图位置，并隐藏 `::-ms-expand`。对应提交 `5150c81`（`fix: 避免下拉文字与箭头重叠`）。改完后强制刷新 8080；若 Docker 前端仍是旧 CSS，按第 2 条重建镜像。

### 2. 改了 `frontend/`，浏览器还是旧页面

**现象：** 本地已经把看板占位换成环/柱/排行，或改了 `app.js`，`http://localhost:8080` 仍显示「图表与排行后续接入」，或 JS 报错找不到新模块。

**排查：**

1. 宿主机文件确实已保存。
2. `docker compose exec frontend ls /usr/share/nginx/html/js` 里没有新的 `stats.js`，或 `index.html` 时间戳仍是旧的。
3. `frontend/Dockerfile` 是 `COPY` 进 nginx 镜像，`docker-compose.yml` **没有**把 `frontend/` 挂进容器。

**原因：** 前端镜像构建时把静态文件打进去。之后改磁盘上的源码不会进正在跑的容器。开发时曾用 `docker cp` 应急拷进 `vibe-training-frontend-1`，页面能立刻变，但容器一重建就丢。

**处理：** 不要长期依赖 `docker cp`。改前端后执行：

```bash
docker compose up -d --build frontend
```

浏览器强制刷新。后端 Python 同理：改 `app/` 后要 `--build backend`（后端镜像同样是 COPY，不是热挂载）。

### 3. 本机 `pytest` 连上了开发用 PostgreSQL

**现象：** 在 `backend/` 跑测试时卡住或改到了 Docker 里的真实任务数据；或者报连不上 `db:5432`（测试进程不在 compose 网络里）。

**排查：** `app/config.py` 会读 `.env`。若先 `import app.main` 再改环境变量，Pydantic Settings 已经按开发库初始化。测试和 Docker 会打到同一套库。

**原因：** 测试必须在**导入应用之前**把 `DATABASE_URL` 指到 SQLite。

**处理：** 保持 `backend/tests/conftest.py` 文件顶部先写 `os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"` 再 import。本机验证：

```bash
cd backend
uv sync --group dev
uv run pytest
```

测试不应要求 Docker。若仍连 Postgres，检查是否从错误目录启动、或自己写了会提前 import 应用的脚本。

---

## 其他常见情况

### 容器起不来

- **db 一直 unhealthy：** `.env` 的 `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` 必须与**第一次**初始化 volume 时一致。Postgres 只在空数据卷上读这些变量，改密码后继续用旧 `pgdata` 会认证失败。处理：改回原值，或（会丢数据）`docker compose down -v` 后重建。
- **backend 反复重启：** 日志若提示缺少 `JWT_SECRET` / `ADMIN_PASSWORD`，补全 `.env` 后 `docker compose up -d`。
- **数据库未就绪：** 后端 lifespan 会重试连库约 20 秒。仍失败则看 db 的 healthcheck。

### 打不开页面

- 对外入口是 **8080**，不是 8000（8000 是 FastAPI `/docs`）。
- `curl -i http://127.0.0.1:8080/` 应 200 且为 HTML。
- `curl -i http://127.0.0.1:8080/api/health` 应返回 `{"status":"ok"}`。页面 200 但 `/api` 502：nginx 反代不到 backend，看 frontend/backend 日志是否在同一 compose 网络。

### 登录失败

- 401「用户名或密码错误」：默认用户名是 `ADMIN_USERNAME`（常为 `admin`），密码是**首次启动写入库**的 `ADMIN_PASSWORD`。之后只改 `.env` 不会改库里的密码。
- 页面能开但登录无反应：看 `/api/auth/login` 是否 502。经 8080 访问是同源，不要用 `localhost:8000` 的页面去打 8080 的 API。
- 登录后立刻掉线：系统时间偏差过大可能导致 JWT 失败，检查 NTP。

### 403 / 404 / 422

- 成员改他人任务、创建用户、传 `include_deleted=true`：预期 **403**。
- 已删除任务对成员不可见、对已删再删：预期 **404**。
- 标题为空或超 200 字、优先级未传、`page_size > 100`、用户名重复、负责人 id 不存在：预期 **422**，看响应 `detail`。

### 找不到 `uv`

测试与本地 uvicorn 走 uv：https://docs.astral.sh/uv/
