#!/usr/bin/env bash
# ============================================================
# reembolsa.ia — Tax Engine | Script de inicialização
# Instala dependências, sincroniza o banco, roda o seed e sobe o app.
# Uso: ./setup.sh [--build]   (--build = modo produção)
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

echo "▶ reembolsa.ia — Tax Engine"
echo "────────────────────────────────────────────"

# 1. Node
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js não encontrado. Instale o Node 20+: https://nodejs.org"
  exit 1
fi
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗ Node $(node -v) detectado — este projeto exige Node 20+."
  exit 1
fi
echo "✓ Node $(node -v)"

# 2. Env
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "⚠ .env criado a partir de .env.example — preencha DATABASE_URL antes de continuar."
    echo "  (Na plataforma Kimi o .env já vem provisionado automaticamente.)"
    exit 1
  else
    echo "✗ .env não encontrado. Defina DATABASE_URL (MySQL) em um arquivo .env."
    exit 1
  fi
fi
echo "✓ .env presente"

# 3. Dependências
echo "▶ Instalando dependências..."
npm install --prefer-offline --no-audit

# 4. Banco
echo "▶ Sincronizando schema do banco (drizzle push)..."
npm run db:push

echo "▶ Seed (matriz de elegibilidade, alíquotas ICMS, dados demo)..."
npx tsx db/seed.ts

# 5. Subir
echo "────────────────────────────────────────────"
echo "✓ Tudo pronto!"
echo "  Admin:    admin@reembolsa.ia.br / Admin@12345"
echo "  Revisor:  revisor@reembolsa.ia.br / Revisor@12345"
echo "  Cliente:  cliente@demo.com.br / Cliente@12345"
echo "────────────────────────────────────────────"

if [ "${1:-}" = "--build" ]; then
  echo "▶ Build de produção..."
  npm run build
  echo "▶ Iniciando servidor de produção em http://localhost:3000"
  npm start
else
  echo "▶ Iniciando dev server em http://localhost:3000"
  npm run dev
fi
