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

## Tabelas

### `datasources`

- origem dos backups
- `connection_config` em JSON
- `status` e `last_health_check_at`

### `storage_locations`

- destinos dos backups
- `config` em JSON
- `available_space_gb` e `status`

### `backup_jobs`

- agendamento e politicas
- campos JSON:
  - `retention_policy`
  - `backup_options`

`retention_policy` recomendado atual:

```json
{ "max_backups": 3, "auto_delete": true }
```

Campos legados ainda aceitos:

```json
{ "keep_daily": 7, "keep_weekly": 4, "keep_monthly": 12, "auto_delete": true }
```

### `backup_executions`

- historico de backup e restore
- `metadata` guarda logs e dados operacionais
- `backup_type` usa enum `BackupType`

### `backup_chunks`

- partes de arquivo de backup
- `UNIQUE (execution_id, chunk_number)`

### `health_checks`

- historico de verificacoes das datasources

### `notifications`

- eventos e alertas

### `system_settings`

- chave/valor global do sistema
- auth single-user e sessao tambem sao persistidos aqui (`auth.user`, `auth.session`)

## Relacionamentos

- `datasources` 1:N `backup_jobs`
- `storage_locations` 1:N `backup_jobs`
- `backup_jobs` 1:N `backup_executions`
- `backup_executions` 1:N `backup_chunks`
- `datasources` 1:N `health_checks`

## Observacoes importantes

- arquivos de backup NAO ficam no PostgreSQL, apenas metadados
- logs de execucao ficam no campo `backup_executions.metadata.execution_logs`
- historico de health de storage e mantido em memoria (store local do processo), nao em tabela dedicada
