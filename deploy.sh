#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:8080}"

if [[ ! -f .env ]]; then
  echo "缺少 .env。请先执行：cp .env.example .env 并填写 JWT_SECRET、ADMIN_PASSWORD、POSTGRES_PASSWORD" >&2
  exit 1
fi

if grep -q $'\r' .env; then
  echo ".env 含 Windows 换行（CRLF）。请在 Linux 上 git clone 后再 cp .env.example .env，或执行：sed -i 's/\\r\$//' .env" >&2
  exit 1
fi

missing=()
while IFS= read -r key; do
  if ! grep -E "^${key}=.+" .env >/dev/null; then
    missing+=("$key")
  fi
done <<'EOF'
JWT_SECRET
ADMIN_PASSWORD
POSTGRES_PASSWORD
EOF

if [[ ${#missing[@]} -gt 0 ]]; then
  echo ".env 中以下变量为空或未设置：${missing[*]}" >&2
  exit 1
fi

unsafe=()
for key in POSTGRES_PASSWORD POSTGRES_USER POSTGRES_DB; do
  value="$(grep -E "^${key}=" .env | head -n1 | cut -d= -f2-)"
  if [[ "$value" == *[@:/\#]* ]]; then
    unsafe+=("$key")
  fi
done
if [[ ${#unsafe[@]} -gt 0 ]]; then
  echo ".env 中 ${unsafe[*]} 含 @ : / #，compose 拼 DATABASE_URL 会出错。请改成不含这些符号的值。" >&2
  exit 1
fi

if ! command -v docker >/dev/null; then
  echo "未找到 docker，请先安装 Docker Engine 与 Compose 插件。" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "未找到 docker compose 插件。Debian/Ubuntu：sudo apt-get install -y docker-compose-plugin" >&2
  exit 1
fi
if ! command -v curl >/dev/null; then
  echo "未找到 curl。健康检查需要它：sudo apt-get install -y curl" >&2
  exit 1
fi

docker compose up -d --build

echo "等待健康检查 ${FRONTEND_URL}/api/health ..."
ok=0
for _ in $(seq 1 45); do
  if curl -fsS "${FRONTEND_URL}/api/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -ne 1 ]]; then
  echo "健康检查失败。查看日志：docker compose logs --tail=80 backend frontend" >&2
  exit 1
fi

echo "部署完成。打开 ${FRONTEND_URL}"
