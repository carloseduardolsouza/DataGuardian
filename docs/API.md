# API - DataGuardian

Base URL:

- `http://localhost:3000/api`

Publico (sem auth):

- `GET /health`
- `GET /metrics` (formato Prometheus)

Observacao: quase todas as rotas em `/api/*` exigem sessao autenticada.
Excecoes publicas: `/api/auth/*` e `/api/integrations/whatsapp/webhook`.

## Auth

- `GET /api/auth/status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Integrations (webhooks publicos)

- `POST /api/integrations/whatsapp/webhook`
  - endpoint inbound do chatbot WhatsApp
  - aceita token opcional via header `x-whatsapp-webhook-token` ou query `?token=...`

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
- `referenced_files` (opcional): copia arquivos referenciados por query SQL
  - `enabled`: boolean
  - `source_type`: `local | ssh` (default `local`)
  - `source` (quando `source_type=ssh`):
    - `host`, `port`, `username`
    - autenticacao por `password` ou `private_key`
  - `discovery_query`: SQL que retorna caminhos de arquivos
  - `path_column` (opcional): nome da coluna com o caminho (se omitido, usa primeira coluna string)
  - `base_directories`: lista de diretorios permitidos para resolucao/copia
  - `missing_file_policy`: `warn | fail`
  - `max_files`: limite maximo de arquivos por execucao

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
- `GET /api/backups/restore-targets`
- `GET /api/backups/:executionId/download?storage_location_id=uuid-opcional`
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
  "target_datasource_id": "uuid-opcional",
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

Campos relevantes de performance em `GET /api/dashboard/overview`:

```json
{
  "performance": {
    "machine": {
      "hostname": "backup-host",
      "platform": "linux",
      "release": "6.8.0",
      "arch": "x64",
      "cpu_cores": 8,
      "cpu_model": "Intel(R) Xeon(R)",
      "total_memory_bytes": 33554432000,
      "system_uptime_seconds": 90211,
      "process_uptime_seconds": 1220,
      "node_version": "v22.0.0"
    },
    "current": {
      "cpu_percent": 42.3,
      "memory_usage_percent": 71.2,
      "process_cpu_percent": 8.9,
      "process_memory_rss_bytes": 201195520,
      "event_loop_lag_ms": 2.1
    },
    "history": [
      {
        "ts": "2026-02-23T00:00:00.000Z",
        "cpu_percent": 38.1,
        "memory_usage_percent": 70.8,
        "process_cpu_percent": 7.5,
        "event_loop_lag_ms": 1.9
      }
    ],
    "thread_pool": {
      "enabled": true,
      "size": 3,
      "busy": 1,
      "queued": 0,
      "processed": 152,
      "failed": 0
    }
  }
}
```

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
