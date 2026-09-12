#!/usr/bin/env bash
# Deploy do reembolsa.ia na VPS — roda DENTRO da pasta do repo (tax-app).
# Uso:  bash scripts/deploy.sh [tag]
# Sem argumento, usa a tag mais recente. Ex.: bash scripts/deploy.sh v1.6.5
set -euo pipefail

TAG="${1:-}"

echo "==> Buscando tags do GitHub…"
git fetch origin --tags --prune

if [ -z "$TAG" ]; then
  TAG="$(git tag --sort=-v:refname | head -1)"
fi
echo "==> Fazendo checkout da $TAG…"
git checkout "$TAG"

echo "==> Instalando dependências…"
npm ci

echo "==> Aplicando migrações do banco…"
npm run db:migrate

echo "==> Build…"
npm run build

echo "==> Reiniciando o app…"
pm2 restart reembolsa

echo "==> Health check…"
sleep 3
curl -sf -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/api/health \
  || curl -sf -o /dev/null -w "HTTP %{http_code}\n" "http://localhost:${PORT:-3000}/api/health"

echo "✅ Deploy da $TAG concluído."
