# DataGuardian

Plataforma self-hosted para backup e restore de bancos de dados, com API Node.js, workers em background e frontend React.

## Estado atual

- API REST em `src/api`
- Frontend React em `interface/`
- Persistencia de metadados em PostgreSQL (Prisma)
- Filas BullMQ + Redis para backup e restore assincronos
- Autenticacao por sessao + RBAC (usuarios, roles e permissoes)
- Auditoria de acoes sensiveis (`audit_logs`)
- Endpoint Prometheus nativo (`GET /metrics`)

Workers ativos:

- `scheduler` (agenda execucoes)
- `backup` (dump, compressao, upload)
- `restore` (restaura via fila, com retry)
- `health` (saude de datasources/storages)
- `cleanup` (retencao)

## Funcionalidades principais

- CRUD de datasources, storages e backup jobs
- Execucao manual imediata de backup (`POST /api/backup-jobs/:id/run`)
- Restore de backup via fila (`POST /api/backups/:executionId/restore`)
- Modo de verificacao de restore (banco temporario + confirmacao explicita)
- Tela de execucoes com logs (`GET /api/executions/:id/logs`)
- Retry de upload (`POST /api/executions/:id/retry-upload`)
- Explorer de storage com listagem, copia, exclusao e download
- Dashboard com dados reais (`GET /api/dashboard/overview`)
- Health detalhado (`GET /api/health`, `/api/health/datasources`, `/api/health/storage`)
- Notificacoes internas e externas (SMTP, webhook, WhatsApp)
- Templates/versionamento de notificacoes (`/api/system/notification-templates`)

## Retencao

Politica recomendada:

```json
{
  "max_backups": 3,
  "auto_delete": true
}
```

Ao concluir o 4o backup do mesmo job, o backup mais antigo e removido.
Campos legados (`keep_daily`, `keep_weekly`, `keep_monthly`) continuam aceitos por compatibilidade.

## Degradacao sem Redis

Se o Redis ficar indisponivel:

- workers de fila (`scheduler`, `backup`, `restore`) sao desativados
- workers `health` e `cleanup` continuam
- endpoints dependentes de fila retornam `503`

Quando Redis volta, os workers de fila sao reativados automaticamente.

## Setup rapido (dev)

1. Instalar dependencias

```bash
npm install
```

2. Configurar ambiente

```bash
cp .env.example .env
```

3. Subir infraestrutura

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

4. Aplicar migrations e gerar Prisma Client

```bash
npm run db:deploy
npm run db:generate
```

5. Rodar API + UI

```bash
npm run dev
```

## Scripts principais

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run db:migrate`
- `npm run db:deploy`
- `npm run db:generate`
- `npm run db:studio`

## Documentacao

- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/DEVELOPMENT.md`
- `docs/DEPLOYMENT.md`
- `docs/STORAGE.md`
- `docs/MONITORING_AND_BACKUP_OPS.md`
- `docs/IMPROVEMENTS.md`
