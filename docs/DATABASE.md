# :sparkles: Database - DataGuardian

> Referência do modelo de dados baseada em `prisma/schema.prisma`.

## :bookmark: Enums principais

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

## :bookmark: Tabelas

### `datasources`

- Origens de backup
- `connection_config` em JSON
- `status` e `last_health_check_at`

### `storage_locations`

- Destinos de backup
- `config` em JSON
- `available_space_gb` e `status`

### `backup_jobs`

- Agendamento e políticas
- JSON relevantes:
- `retention_policy`
- `backup_options`

`retention_policy` recomendado:

```json
{ "max_backups": 3, "auto_delete": true }
```

### `backup_executions`

- Histórico de backup e restore
- `metadata` guarda logs e dados operacionais

### `database_sync_jobs`

- Configuração de sincronização dedicada (origem, destino, storage, cron e políticas)

### `database_sync_executions`

- Histórico de execuções de sincronização (backup + restore)

### `backup_chunks`

- Controle de chunks gerados/subidos por execução

### `health_checks`

- Histórico de health das datasources

### `storage_health_checks`

- Histórico de health de storages (persistido)

### `notifications`

- Notificações internas do sistema

### `notification_templates`

- Templates por canal/tipo com versionamento

### `system_settings`

- Chave/valor global do sistema

### `users`

- Usuários autenticados

### `roles`

- Papéis RBAC

### `permissions`

- Permissões granulares

### `user_roles`

- Associação N:N entre usuários e roles

### `role_permissions`

- Associação N:N entre roles e permissões

### `auth_sessions`

- Sessões autenticadas por token

### `audit_logs`

- Trilha de auditoria (ator, ação, recurso, IP, user-agent, mudanças)

## :bookmark: Relacionamentos principais

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

## :bookmark: Observações importantes

- Arquivos de backup não ficam no PostgreSQL, apenas metadados
- Logs de execução ficam em `backup_executions.metadata.execution_logs`
- Restore e backup reutilizam a mesma tabela `backup_executions`, diferenciando por metadados de operação

