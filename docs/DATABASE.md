# Database - DataGuardian

Referencia baseada em `prisma/schema.prisma`.

## Enums principais

- `DatasourceType`: `postgres | mysql | mariadb | mongodb | sqlserver | sqlite | files`
- `DatasourceStatus`: `healthy | warning | critical | unknown`
- `StorageLocationType`: `local | s3 | ssh | minio | backblaze`
- `StorageLocationStatus`: `healthy | full | unreachable`
- `ExecutionStatus`: `queued | running | completed | failed | cancelled`
- `BackupType`: `full | incremental | differential`
- `HealthCheckStatus`: `ok | timeout | auth_failed | unreachable | error`
- `NotificationType`: `backup_success | backup_failed | connection_lost | connection_restored | storage_full | storage_unreachable | health_degraded | cleanup_completed`
- `NotificationSeverity`: `info | warning | critical`
- `NotificationEntityType`: `datasource | backup_job | storage_location | system`
- `AlertChannel`: `smtp | webhook | whatsapp`

## Tabelas

### `datasources`

- origens de backup
- `connection_config` em JSON
- `status` e `last_health_check_at`

### `storage_locations`

- destinos de backup
- `config` em JSON
- `available_space_gb` e `status`

### `backup_jobs`

- agendamento e politicas
- JSON relevantes:
  - `retention_policy`
  - `backup_options`

`retention_policy` recomendado:

```json
{ "max_backups": 3, "auto_delete": true }
```

### `backup_executions`

- historico de backup e restore
- `metadata` guarda logs e dados operacionais

### `database_sync_jobs`

- configuracao de sincronizacao dedicada (origem, destino, storage, cron e politicas)

### `database_sync_executions`

- historico das execucoes de sincronizacao (backup + restore)

### `backup_chunks`

- controle de chunks gerados/subidos por execucao

### `health_checks`

- historico de health das datasources

### `storage_health_checks`

- historico de health de storages (persistido)

### `notifications`

- notificacoes internas do sistema

### `notification_templates`

- templates por canal/tipo com versionamento

### `system_settings`

- chave/valor global do sistema

### `users`

- usuarios autenticados

### `roles`

- papeis RBAC

### `permissions`

- permissoes granulares

### `user_roles`

- associacao N:N entre usuarios e roles

### `role_permissions`

- associacao N:N entre roles e permissoes

### `auth_sessions`

- sessoes autenticadas por token

### `audit_logs`

- trilha de auditoria (ator, acao, recurso, ip, user-agent, mudancas)

## Relacionamentos principais

- `datasources` 1:N `backup_jobs`
- `storage_locations` 1:N `backup_jobs`
- `backup_jobs` 1:N `backup_executions`
- `backup_executions` 1:N `backup_chunks`
- `datasources` 1:N `health_checks`
- `storage_locations` 1:N `storage_health_checks`
- `users` N:N `roles` (via `user_roles`)
- `roles` N:N `permissions` (via `role_permissions`)
- `users` 1:N `auth_sessions`
- `users` 1:N `audit_logs` (ator opcional)

## Observacoes importantes

- arquivos de backup nao ficam no PostgreSQL, apenas metadados
- logs de execucao ficam em `backup_executions.metadata.execution_logs`
- restore e backup reutilizam a mesma tabela `backup_executions` com metadados de operacao
