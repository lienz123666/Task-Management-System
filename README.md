# 员工任务管理系统

内部任务管理工具：FastAPI + PostgreSQL + 原生前端，用 Docker Compose 一键启动。

远程仓库：<https://github.com/lienz123666/Task-Management-System.git>

## 本地启动

```bash
cp .env.example .env
# 编辑 .env：至少设置 JWT_SECRET、ADMIN_PASSWORD
docker compose up -d --build
```

- 前端：<http://localhost:8080>
- 后端（调试）：<http://localhost:8000/docs>
- 初始管理员：`.env` 中的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（仅库中尚无管理员时生效）

## 运行测试

测试使用 SQLite 内存库，不需要 Docker。

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

每个开发阶段完成后都应补测试并跑通 `pytest`，再提交。

## Linux 服务器部署（概要）

服务器需要安装 Docker Engine 与 Compose 插件。部署步骤与本地相同：克隆本仓库、在服务器上创建 `.env`、执行 `docker compose up -d --build`。详细说明见后续 `docs/deployment.md`。

不要把 `.env` 提交进 Git。
