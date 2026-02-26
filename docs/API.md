# :bookmark: API - DataGuardian

> Referência rápida dos endpoints da plataforma.

## :bookmark: Base URL

- `http://localhost:3000/api`

## :bookmark: Endpoints Públicos

- `GET /health`
- `GET /metrics` (formato Prometheus)

> :bookmark: Quase todas as rotas em `/api/*` exigem sessão autenticada.
> Exceções: `/api/auth/*` e `/api/integrations/whatsapp/webhook`.

## :bookmark: Auth

- `GET /api/auth/status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## :bookmark: Integrations (Webhook Público)

- `POST /api/integrations/whatsapp/webhook`
- Endpoint inbound do chatbot WhatsApp
- Aceita token opcional via header `x-whatsapp-webhook-token` ou query `?token=...`

## :sparkles: Datasources

- `GET /api/datasources`
- `POST /api/datasources`
- `GET /api/datasources/:id`
- `PUT /api/datasources/:id`
- `DELETE /api/datasources/:id`
- `POST /api/datasources/:id/test`
- `GET /api/datasources/:id/schema`
- `POST /api/datasources/:id/query`
- `POST /api/datasources/:id/tables`

### Tipos suportados

- `postgres`, `mysql`, `mariadb`, `mongodb`, `sqlserver`, `sqlite`, `files`

## :bookmark: Storage Locations

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

## :bookmark: Backup Jobs

- `GET /api/backup-jobs`
- `POST /api/backup-jobs`
- `GET /api/backup-jobs/:id`
- `PUT /api/backup-jobs/:id`
- `DELETE /api/backup-jobs/:id`
- `POST /api/backup-jobs/:id/run`

### :bookmark: Retention policy atual

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

### :bookmark: Backup options

Campos usados hoje:

- `compression`: `gzip | zstd | lz4 | none`
- `storage_strategy`: `fallback | replicate`
- `storage_targets`: lista ordenada de storages
- `referenced_files` (opcional): copia arquivos referenciados por query SQL
- `enabled`: boolean
- `source_type`: `local | ssh` (default `local`)
- `source` (quando `source_type=ssh`):
- `host`, `port`, `username`
- autenticação por `password` ou `private_key`
- `discovery_query`: SQL que retorna caminhos de arquivos
- `path_column` (opcional): nome da coluna com caminho
- `base_directories`: diretórios permitidos para resolução/cópia
- `missing_file_policy`: `warn | fail`
- `max_files`: limite máximo de arquivos por execução

## :bookmark: DB Sync Jobs (Módulo separado)

- `GET /api/db-sync-jobs`
- `POST /api/db-sync-jobs`
- `GET /api/db-sync-jobs/:id`
- `PUT /api/db-sync-jobs/:id`
- `DELETE /api/db-sync-jobs/:id`
- `POST /api/db-sync-jobs/:id/run`
- `GET /api/db-sync-jobs/:id/executions`

### Campos principais do sync job

```json
{
  "name": "Sync Producao -> Teste",
  "source_datasource_id": "uuid",
  "target_datasource_id": "uuid",
  "storage_location_id": "uuid",
  "schedule_cron": "0 2 * * *",
  "schedule_timezone": "UTC",
  "overwrite_direction": "source_to_target",
  "drop_existing": true,
  "run_on_manual": true,
  "enabled": true
}
```

## :bookmark: Executions

- `GET /api/executions`
- `GET /api/executions/:id`
- `GET /api/executions/:id/logs`
- `POST /api/executions/:id/cancel`
- `POST /api/executions/:id/retry-upload`
- `DELETE /api/executions/:id`

## :bookmark: Backups (Exploração e Restore)

- `GET /api/backups/datasources`
- `GET /api/backups/datasources/:datasourceId`
- `GET /api/backups/restore-targets`
- `GET /api/backups/:executionId/download?storage_location_id=uuid-opcional`
- `POST /api/backups/:executionId/restore`

`POST /restore` retorna `202` e cria execução `queued` com `operation=restore` em metadata.
O processamento é feito pelo `restore-worker` na `restore-queue`.

### Restore suportado

- `postgres`
- `mysql`
- `mariadb`

### Body do restore

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

### Frases obrigatórias de confirmação

- Restore normal: `RESTAURAR`
- Restore verification mode: `VERIFICAR RESTORE`

## :bookmark: Health

- `GET /api/health`
- `GET /api/health/datasources`
- `GET /api/health/storage`

## :bookmark: Dashboard

- `GET /api/dashboard/overview`

### Campos relevantes de performance

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

## :bookmark: Notifications

- `GET /api/notifications`
- `PUT /api/notifications/read-all`
- `PUT /api/notifications/:id/read`
- `DELETE /api/notifications/:id`

## :bookmark: Audit Logs

- `GET /api/audit-logs`

## :sparkles: Access (RBAC)

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

## :bookmark: System

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

## :bookmark: Permissões (Resumo)

As rotas protegidas exigem permissão RBAC. Exemplos:

- `backup_jobs.run` para `POST /api/backup-jobs/:id/run`
- `backups.restore` para `POST /api/backups/:executionId/restore`
- `backups.restore_verify` para `verification_mode=true`
- `storage.download` para download no explorer
- `audit.read` para auditoria
- `access.manage` para gerenciamento de usuários/roles

### Regras de aprovação crítica (granular por ação)

- Criar solicitação em `/api/critical-approvals/requests` exige a permissão da ação solicitada
- Aprovar/reprovar em `/api/critical-approvals/requests/:id/(approve|reject)` exige:
- `access.manage`
- permissão da ação da solicitação (ex.: `backups.restore`, `executions.control`, `storage.write`)
- Executar ação crítica com `x-admin-password` ou `x-critical-approval-id` valida permissão individualmente

## :white_check_mark: Status codes usados

- `200` sucesso
- `201` criado
- `202` aceito para processamento assíncrono
- `204` sem corpo
- `400` entrada inválida / erro de operação
- `401` não autenticado
- `404` não encontrado
- `409` conflito de regra de negócio
- `422` validação
- `503` dependência indisponível (ex.: Redis/Storage)

