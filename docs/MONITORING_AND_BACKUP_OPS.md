# Monitoring and Backup Ops - DataGuardian

## Endpoints de monitoramento

- `GET /health` (publico)
- `GET /metrics` (publico, Prometheus)
- `GET /api/health` (protegido)
- `GET /api/health/datasources` (protegido)
- `GET /api/health/storage` (protegido)
- `GET /api/dashboard/overview` (protegido)

## Workers

- `scheduler-worker`: agenda backups vencidos (depende de Redis)
- `backup-worker`: processa `backup-queue`
- `restore-worker`: processa `restore-queue`
- `db-sync-worker`: processa `db-sync-queue` e agenda jobs de sync (`database_sync_jobs`)
- `health-worker`: checa datasources/storages periodicamente
- `cleanup-worker`: aplica retencao

## Observabilidade de execucao

- logs por execucao em `backup_executions.metadata.execution_logs`
- endpoint de logs: `GET /api/executions/:id/logs`

No terminal, progresso relevante:

- `[BACKUP] ...`
- `[RESTORE] ...`

## Fluxo de backup manual

1. `POST /api/backup-jobs/:id/run`
2. cria execucao `queued`
3. `backup-worker` muda para `running`
4. dump -> compressao -> upload
5. status final `completed` ou `failed`
6. cleanup de retencao apos sucesso

## Sincronizacao automatica entre bancos (modulo dedicado)

A sincronizacao usa tabelas proprias:

- `database_sync_jobs`
- `database_sync_executions`

Fluxo:

1. `db-sync-worker` identifica sync jobs vencidos (`next_execution_at <= now`)
2. cria `database_sync_executions` com status `queued`
3. executa backup da origem e depois restore no destino
4. finaliza a execucao como `completed` ou `failed`

## Fluxo de restore

1. `POST /api/backups/:executionId/restore`
2. exige `confirmation_phrase`
3. cria nova execucao `queued` (`operation=restore`)
4. `restore-worker` executa restore e grava logs
5. status final `completed` ou `failed`

### Confirmation phrase

- restore normal: `RESTAURAR`
- verification mode: `VERIFICAR RESTORE`

## Verification mode

Quando `verification_mode=true`:

- requer permissao `backups.restore_verify`
- restore ocorre em banco temporario
- opcionalmente mantem banco de verificacao (`keep_verification_database=true`)

## Retencao operacional

Padrao recomendado:

```json
{ "max_backups": 3, "auto_delete": true }
```

Regra: ao concluir o 4o backup do mesmo job, remove o mais antigo.

## Recuperacao de falha de upload

- endpoint: `POST /api/executions/:id/retry-upload`
- uso: quando dump existe, mas upload falhou

## Notificacoes

- `GET /api/notifications`
- `PUT /api/notifications/:id/read`
- `PUT /api/notifications/read-all`
- `DELETE /api/notifications/:id`

Notificacoes externas configuraveis em `system_settings`:

- SMTP
- webhook
- WhatsApp (Evolution)

Templates/versionamento:

- `GET /api/system/notification-templates`
- `POST /api/system/notification-templates`
- `PUT /api/system/notification-templates/:id`
- `POST /api/system/notification-templates/:id/new-version`

## Troubleshooting rapido

- backup/restore nao inicia: verificar Redis em `/api/health` (`services.redis`)
- restore nao roda: validar execucao origem `completed` e storage com arquivo disponivel
- query/schema falhando: revisar credenciais da datasource
- falta de logs: consultar `GET /api/executions/:id/logs` e logs do worker no terminal
