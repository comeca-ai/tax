# Deploy — reembolsa.ia (Tax Engine)

Runbook de atualização da aplicação em produção (self-hosted, Docker Compose
atrás de reverse proxy). Este arquivo é público: **nunca** colocar aqui IPs,
domínios de admin, topologia de rede ou segredos — isso vive no repositório
**privado** de infra.

## Modelo mental

- Código: GitHub `comeca-ai/tax` (público), branch `master` + tags SemVer.
- Banco: migrações SQL versionadas em `db/migrations/`, aplicadas
  **automaticamente no boot do container** (`docker-entrypoint.sh` →
  `db/migrations/apply.ts`, idempotente). Nunca rodar `db:push --force`,
  nunca dropar tabelas.
- Por máquina: `docker-compose.override.yml` e pastas de proxy são locais
  (gitignored). O override deve referenciar o serviço **`tax-app`** (não
  `app` — colisão de alias em rede compartilhada já derrubou site).

## Atualização padrão (mudança de código)

```bash
cd <pasta do tax>
git fetch --tags
git checkout v<X.Y.Z>          # tag exata — rollback trivial
docker compose up -d --build
```

Validação pós-deploy (2 min):

1. `docker compose logs --tail=50 tax-app` sem erros; migrações novas
   aparecem como "✓ Migração aplicada"
2. `curl -s -o /dev/null -w "%{http_code}" https://<domínio>` → 200
3. Teste funcional da feature da versão (ver CHANGELOG)

Rollback:

```bash
git checkout v<tag-anterior>
docker compose up -d --build
```

## Atualização de higiene (sem mudança de runtime)

Quando a tag nova só toca repo (lockfile, .gitignore, docs): `git pull` seco,
**sem rebuild/restart** — a imagem rodando continua válida. Confira no
CHANGELOG se a versão é "só higiene" antes de rebuildar à toa.

## Checklist de primeiro deploy numa máquina nova

1. Clone + `.env` a partir de `.env.example` (`APP_SECRET` forte,
   `DATABASE_URL`, `APP_URL` com o domínio público; opcionais: `SMTP_*`,
   `RECEITAWS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`)
2. `docker compose up -d --build` — migrações criam o schema do zero
3. Primeiro usuário cadastrado vira **admin** (v1.2.0); demais entram por
   convite (Equipe → Convidar; sem SMTP o link aparece na resposta)
4. Proxy: aponte o domínio para `tax-app:3000` na rede `tax-net`

## Variáveis de ambiente

Ver `.env.example` — comentários por variável. Segredos **somente** no `.env`
da máquina (gitignored), nunca em arquivos versionados.
