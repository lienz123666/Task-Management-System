# Linux 服务器部署

本地 Windows 与 Linux 服务器使用同一套 `docker-compose.yml` 和 `.env.example`。请在服务器上 **git clone**，不要把 Windows 工作区整份拷上去（`deploy.sh` 带 CRLF 会直接跑不起来）。

对外入口是前端 nginx（默认 **8080**）；**8000** 只用于调试 OpenAPI，上线可删掉 `docker-compose.yml` 里 backend 的 `ports`。

## 1. 安装 Docker

需 root 或 sudo。先装 `curl`（`deploy.sh` 的健康检查要用）。

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
. /etc/os-release
sudo curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"
```

`${ID}` 在 Ubuntu 上是 `ubuntu`，Debian 上是 `debian`，不要写死成 ubuntu。其他发行版见 [Docker 官方文档](https://docs.docker.com/engine/install/)。

**注销再登录**后执行：

```bash
docker compose version
```

首次构建需要能访问 Docker Hub（`postgres`、`python`、`nginx`）和 `ghcr.io`（uv 镜像）。拉不下来时先检查出网/镜像加速，而不是反复跑 `deploy.sh`。

## 2. 取得代码

```bash
git clone https://github.com/lienz123666/Task-Management-System.git
cd Task-Management-System
```

目录名是仓库名 `Task-Management-System`，不是本地的 `vibe-training`。

## 3. 配置 `.env`

```bash
cp .env.example .env
```

至少修改：

| 变量 | 说明 |
|------|------|
| `POSTGRES_PASSWORD` | 数据库密码。不要包含 `@` `:` `/` `#`，compose 会把它们拼进 URL |
| `JWT_SECRET` | 足够长的随机串，例如 `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | 首位管理员密码（仅库中还没有管理员时生效） |
| `JWT_EXPIRE_HOURS` | JWT 有效小时数，默认 24 |

不要把服务器上的 `.env` 提交进 Git。修改 `ADMIN_USERNAME` / `ADMIN_PASSWORD` **不会**改已有管理员账号。

## 4. 启动

仓库根目录：

```bash
chmod +x deploy.sh
./deploy.sh
```

或手动：

```bash
docker compose up -d --build
curl -fsS http://127.0.0.1:8080/api/health
```

`deploy.sh` 会检查 `.env`、`docker compose`、`curl`，构建并启动三个容器，再请求 `http://127.0.0.1:8080/api/health`。

浏览器访问 `http://<服务器IP>:8080`，用 `.env` 里的管理员账号登录。

## 5. 端口与防火墙

| 端口 | 用途 |
|------|------|
| 8080 | 对外：页面 + `/api` 反代 |
| 8000 | 调试：FastAPI `/docs`。上线可在 `docker-compose.yml` 里删掉 backend 的 `ports` |
| 5432 | 仅容器内，compose 未映射到宿主机 |

若启用 ufw，**先放行 SSH**，再放行 8080，否则 `ufw enable` 可能把当前连接掐掉：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8080/tcp
sudo ufw enable
```

不需要对外提供 Swagger 时不要放行 8000。

## 6. 日常操作

前后端镜像是本地 `build` 的，更新代码后要重新构建，不要只 `docker compose pull`。

```bash
docker compose ps
docker compose logs -f backend
git pull
./deploy.sh
```

数据在 Docker volume `pgdata` 中，重建容器不会丢库。若要彻底清空数据：`docker compose down -v`（不可恢复）。

页面样式走浏览器访问的 Tailwind / Google Fonts CDN，**不是**构建镜像时下载。服务器只要能拉基础镜像；访问者的浏览器若打不开这些 CDN，页面仍能用，只是样式或图标可能缺失。离线环境需另行本地化静态资源（不在本期范围）。
