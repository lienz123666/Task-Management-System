# Linux 服务器部署

本地 Windows 与 Linux 服务器使用同一套 `docker-compose.yml` 和 `.env.example`。对外入口是前端 nginx（默认 **8080**）；`8000` 仅用于调试 OpenAPI，上线可不映射。

## 1. 安装 Docker

以 Debian / Ubuntu 为例（需 root 或 sudo）：

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"
```

注销再登录后执行 `docker compose version` 确认插件可用。其他发行版见 [Docker 官方文档](https://docs.docker.com/engine/install/)。

## 2. 取得代码

```bash
git clone https://github.com/lienz123666/Task-Management-System.git
cd Task-Management-System
```

## 3. 配置 `.env`

```bash
cp .env.example .env
```

至少修改：

| 变量 | 说明 |
|------|------|
| `POSTGRES_PASSWORD` | 数据库密码 |
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
```

`deploy.sh` 会检查 `.env` 必填项、构建并启动三个容器，然后请求 `http://127.0.0.1:8080/api/health`。

浏览器访问 `http://<服务器IP>:8080`，用 `.env` 里的管理员账号登录。

## 5. 端口与防火墙

| 端口 | 用途 |
|------|------|
| 8080 | 对外：页面 + `/api` 反代 |
| 8000 | 调试：FastAPI `/docs`。上线可在 `docker-compose.yml` 里删掉 backend 的 `ports` |
| 5432 | 仅容器内，compose 未映射到宿主机 |

开放 8080 示例：

```bash
sudo ufw allow 8080/tcp
sudo ufw enable
```

## 6. 日常操作

```bash
docker compose ps
docker compose logs -f backend
docker compose pull   # 若改用预构建镜像时
git pull
./deploy.sh           # 更新代码后重新构建
```

数据在 Docker volume `pgdata` 中，重建容器不会丢库。若要彻底清空数据：`docker compose down -v`（不可恢复）。

前端镜像构建时需要能访问 Tailwind / Google Fonts CDN；离线环境需另行本地化静态资源（不在本期范围）。
