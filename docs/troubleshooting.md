# 故障排查

## 容器起不来

```bash
docker compose ps
docker compose logs backend
docker compose logs db
```

- **db 一直 unhealthy**：检查 `.env` 的 `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` 是否与首次初始化时一致。Postgres 只在空数据卷上读这些变量，改密码后若仍用旧 volume，会认证失败。处理：确认变量，或（会丢数据）`docker compose down -v` 后重建。
- **backend 反复重启**：日志里若提示缺少 `JWT_SECRET` / `ADMIN_PASSWORD`，补全 `.env` 后 `docker compose up -d`。
- **数据库未就绪**：后端 lifespan 会重试连库约 20 秒。若仍失败，看 db 的 healthcheck 是否通过。

## 打不开页面

- 确认访问的是 **8080** 而不是 8000。
- `curl -i http://127.0.0.1:8080/` 应返回 200 与 HTML。
- `curl -i http://127.0.0.1:8080/api/health` 应返回 `{"status":"ok"}`。若前端 200 但 `/api` 502，说明 nginx 反代不到 backend，查看 `docker compose logs frontend` 与 backend 是否在同一 compose 网络。

## 登录失败

- 401「用户名或密码错误」：核对账号。默认引导用户名是 `ADMIN_USERNAME`（常为 `admin`），密码是**首次启动时**写入的 `ADMIN_PASSWORD`，之后改 `.env` 不会改库里的密码。
- 页面能开但登录无反应：浏览器控制台看 `/api/auth/login` 是否 502/CORS。经 8080 访问应为同源，不要混用 `localhost:8000` 的页面去打 8080 的 API。
- 登录后立刻掉线：系统时间偏差过大可能导致 JWT 校验失败；检查服务器 NTP。

## 403 / 404

- 成员改他人任务、创建用户、传 `include_deleted=true`：预期 **403**。
- 已删除任务对成员不可见、对已删任务再删：预期 **404**。
- 管理员才能看到侧栏「用户与权限」「已删除任务」。

## 接口 422

常见原因：标题为空或超 200 字、优先级未传、`page_size > 100`、用户名重复、负责人为不存在的用户 id。响应 `detail` 会说明原因。

## 测试在本机失败

测试不走 Docker，使用 SQLite 内存库：

```bash
cd backend
uv sync --group dev
uv run pytest
```

若提示找不到 `uv`，先安装：https://docs.astral.sh/uv/

## 前端样式或脚本未更新

前端镜像把 `index.html`、`css/`、`js/` 打进 nginx，改代码后必须重新构建：

```bash
docker compose up -d --build frontend
```

浏览器请强制刷新（避开缓存）。
