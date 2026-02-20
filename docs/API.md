# API - DataGuardian

Base URL:

- `http://localhost:3000/api`

Publico (sem auth):

- `GET /health`
- `GET /metrics` (formato Prometheus)

Observacao: todas as rotas em `/api/*` exigem sessao autenticada, exceto `/api/auth/*`.

## Auth

- `GET /api/auth/status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Datasources

- `GET /api/datasources`
- `POST /api/datasources`
- `GET /api/datasources/:id`
- `PUT /api/datasources/:id`
- `DELETE /api/datasources/:id`
- `POST /api/datasources/:id/test`
- `GET /api/datasources/:id/schema`
- `POST /api/datasources/:id/query`
- `POST /api/datasources/:id/tables`

Tipos suportados:

- `postgres`, `mysql`, `mariadb`, `mongodb`, `sqlserver`, `sqlite`, `files`

## Storage Locations

- `GET /api/storage-locations`
- `POST /api/storage-locations`
- `POST /api/storage-locations/test`
- `GET /api/storage-locations/:id`
- `PUT /api/storage-locations/:id`
- `DELETE /api/storage-locations/:id`
- `POST /api/storage-locations/:id/test`
- `GET /api/storage-locations/:id/files?path=`
- `DELETE /api/storage-locations/:id/files?path=`
- `POST /api/storage-locations/:id/files/copy`
- `GET /api/storage-locations/:id/files/download?path=`

## Backup Jobs

- `GET /api/backup-jobs`
- `POST /api/backup-jobs`
- `GET /api/backup-jobs/:id`
- `PUT /api/backup-jobs/:id`
- `DELETE /api/backup-jobs/:id`
- `POST /api/backup-jobs/:id/run`

### Retention policy atual

Preferencial:

```json
{
  "max_backups": 3,
  "auto_delete": true
}
```

Compatibilidade legada:

```json
{
  "keep_daily": 7,
  "keep_weekly": 4,
  "keep_monthly": 12,
  "auto_delete": true
}
```

### Backup options

Campos usados hoje:

- `compression`: `gzip | zstd | lz4 | none`
- `storage_strategy`: `fallback | replicate`
- `storage_targets`: lista ordenada de storages

## Executions

- `GET /api/executions`
- `GET /api/executions/:id`
- `GET /api/executions/:id/logs`
- `POST /api/executions/:id/cancel`
- `POST /api/executions/:id/retry-upload`
- `DELETE /api/executions/:id`

## Backups (exploracao e restore)

- `GET /api/backups/datasources`
- `GET /api/backups/datasources/:datasourceId`
- `POST /api/backups/:executionId/restore`

`POST /restore` retorna `202` e cria execucao `queued` com `operation=restore` em metadata.
O processamento e feito pelo `restore-worker` na `restore-queue`.

Restore suportado:

- `postgres`
- `mysql`
- `mariadb`

Campos de body no restore:

```json
{
  "storage_location_id": "uuid-opcional",
  "drop_existing": true,
  "verification_mode": false,
  "keep_verification_database": false,
  "confirmation_phrase": "RESTAURAR"
}
```

Confirmacao obrigatoria:

- restore normal: `confirmation_phrase = "RESTAURAR"`
- restore verification mode: `confirmation_phrase = "VERIFICAR RESTORE"`

## Health

- `GET /api/health`
- `GET /api/health/datasources`
- `GET /api/health/storage`

## Dashboard

- `GET /api/dashboard/overview`

## Notifications

- `GET /api/notifications`
- `PUT /api/notifications/read-all`
- `PUT /api/notifications/:id/read`
- `DELETE /api/notifications/:id`

## Audit Logs

- `GET /api/audit-logs`

## Access (RBAC)

- `GET /api/access/permissions`
- `GET /api/access/roles`
- `POST /api/access/roles`
- `PUT /api/access/roles/:id`
- `DELETE /api/access/roles/:id`
- `GET /api/access/users`
- `POST /api/access/users`
- `PUT /api/access/users/:id`
- `PUT /api/access/users/:id/password`
- `DELETE /api/access/users/:id`

## System

- `GET /api/system/settings`
- `POST /api/system/settings`
- `PUT /api/system/settings`
- `POST /api/system/settings/test-smtp`
- `POST /api/system/settings/whatsapp/qr`
- `GET /api/system/settings/:key`
- `PUT /api/system/settings/:key`
- `DELETE /api/system/settings/:key`
- `GET /api/system/notification-templates`
- `POST /api/system/notification-templates`
- `PUT /api/system/notification-templates/:id`
- `POST /api/system/notification-templates/:id/new-version`

## Permissoes (resumo)

As rotas protegidas exigem permissao RBAC. Exemplos:

- `backup_jobs.run` para `POST /api/backup-jobs/:id/run`
- `backups.restore` para `POST /api/backups/:executionId/restore`
- `backups.restore_verify` para `verification_mode=true`
- `storage.download` para download no explorer
- `audit.read` para auditoria
- `access.manage` para gerenciamento de usuarios/roles

## Status codes usados

- `200` sucesso
- `201` criado
- `202` aceito para processamento async
- `204` sem corpo
- `400` entrada invalida / erro de operacao
- `401` nao autenticado
- `404` nao encontrado
- `409` conflito de regra de negocio
- `422` validacao
- `503` dependencia indisponivel (ex: Redis/Storage)
