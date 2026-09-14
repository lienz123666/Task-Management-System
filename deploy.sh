#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:8080}"

if [[ ! -f .env ]]; then
  echo "缺少 .env。请先执行：cp .env.example .env 并填写 JWT_SECRET、ADMIN_PASSWORD" >&2
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
  echo " .env 中以下变量为空或未设置：${missing[*]}" >&2
  exit 1
fi

if ! command -v docker >/dev/null; then
  echo "未找到 docker，请先安装 Docker Engine 与 Compose 插件。" >&2
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
