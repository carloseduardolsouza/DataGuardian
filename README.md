# DataGuardian

Sistema self-hosted para backup e restore de bancos de dados, com UI React, API Express e workers em background.

## Estado atual do projeto

- API REST em `src/api`
- UI React em `interface/`
- Persistencia de metadados em PostgreSQL (Prisma)
- Filas de backup com BullMQ + Redis
- Autenticacao single-user obrigatoria para `/api/*` (exceto `/api/auth/*`)
- Workers:
  - `scheduler` (agenda jobs)
  - `backup` (executa dump, compressao, upload)
  - `health` (verifica datasources e storages)
  - `cleanup` (retencao)

## Funcionalidades principais

- CRUD de Datasources
- CRUD de Storages
- CRUD de Backup Jobs
- Execucao manual imediata (`POST /api/backup-jobs/:id/run`)
- Tela de Execucoes com logs (`GET /api/executions/:id/logs`)
- Retry de upload com artefato local (`POST /api/executions/:id/retry-upload`)
- Explorer de Storage com copiar, deletar e download
- Aba Backups (por datasource) + restore (`POST /api/backups/:executionId/restore`)
- Dashboard com metricas reais (`GET /api/dashboard/overview`)
- Notificacoes

## Retencao (importante)

Politica atual prioriza:

```json
{
  "max_backups": 3,
  "auto_delete": true
}
```

Com isso, ao concluir o 4o backup do mesmo job, o mais antigo e removido.

Compatibilidade legada ainda existe para:

- `keep_daily`
- `keep_weekly`
- `keep_monthly`

## Redis indisponivel

Quando Redis cai:

- servicos de fila (`scheduler` e `backup`) sao desativados
- health e cleanup continuam
- endpoints que dependem de fila retornam indisponibilidade (ex: run manual)

Quando Redis volta, scheduler e backup voltam automaticamente.

## Setup rapido (dev)

1. Instalar dependencias:

```bash
npm install
```

2. Configurar ambiente:

```bash
cp .env.example .env
```

3. Subir infraestrutura:

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

4. Rodar API + UI:

```bash
npm run dev
```

## Scripts

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run db:migrate`
- `npm run db:generate`
- `npm run db:studio`

## Documentacao detalhada

- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/DEVELOPMENT.md`
- `docs/DEPLOYMENT.md`
- `docs/STORAGE.md`
- `docs/MONITORING_AND_BACKUP_OPS.md`
