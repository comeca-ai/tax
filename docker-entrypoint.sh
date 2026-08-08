#!/bin/sh
# reembolsa.ia — entrypoint de produção (self-hosted)
# 1) aguarda o banco, 2) aplica migrações, 3) seed idempotente, 4) sobe o app
set -e

echo "▶ Aguardando banco de dados..."
TRIES=0
until node -e "const m=require('mysql2/promise');m.createConnection(process.env.DATABASE_URL).then(c=>{c.end();process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; do
  TRIES=$((TRIES+1))
  if [ "$TRIES" -ge 30 ]; then
    echo "✗ Banco indisponível após 30 tentativas. Verifique DATABASE_URL."
    exit 1
  fi
  sleep 2
done
echo "✓ Banco disponível"

echo "▶ Aplicando migrações (drizzle-kit migrate)..."
npm run db:migrate

echo "▶ Seed (idempotente — matriz de regras + dados demo)..."
npx tsx db/seed.ts || echo "⚠ Seed pulado (já aplicado ou erro não fatal)"

echo "▶ Subindo reembolsa.ia na porta 3000..."
exec npm start
