# :bookmark: Monitoring and Backup Ops - DataGuardian

> Operação diária, fluxos de execução e troubleshooting.

## :bookmark: Endpoints de monitoramento

- `GET /health` (público)
- `GET /metrics` (público, Prometheus)
- `GET /api/health` (protegido)
- `GET /api/health/datasources` (protegido)
- `GET /api/health/storage` (protegido)
- `GET /api/dashboard/overview` (protegido)

## :bookmark: Workers

- `scheduler-worker`: agenda backups vencidos (depende de Redis)
- `backup-worker`: processa `backup-queue`
- `restore-worker`: processa `restore-queue`
- `db-sync-worker`: processa `db-sync-queue` e agenda jobs de sync (`database_sync_jobs`)
- `health-worker`: checa datasources/storages periodicamente
- `cleanup-worker`: aplica retenção

## :bookmark: Observabilidade de execução

- Logs por execução em `backup_executions.metadata.execution_logs`
- Endpoint de logs: `GET /api/executions/:id/logs`

No terminal, os prefixos relevantes são:

- `[BACKUP] ...`
- `[RESTORE] ...`

## :bookmark: Fluxo de backup manual

1. `POST /api/backup-jobs/:id/run`
2. Cria execução `queued`
3. `backup-worker` muda para `running`
4. Dump -> compressão -> upload
5. Status final `completed` ou `failed`
6. Cleanup de retenção após sucesso

## :bookmark: Sincronização automática entre bancos

Tabelas dedicadas:

- `database_sync_jobs`
- `database_sync_executions`

Fluxo:

1. `db-sync-worker` identifica sync jobs vencidos (`next_execution_at <= now`)
2. Cria `database_sync_executions` com status `queued`
3. Executa backup da origem e restore no destino
4. Finaliza como `completed` ou `failed`

## :bookmark: Fluxo de restore

1. `POST /api/backups/:executionId/restore`
2. Exige `confirmation_phrase`
3. Cria nova execução `queued` (`operation=restore`)
4. `restore-worker` executa restore e grava logs
5. Status final `completed` ou `failed`

### Frases de confirmação

- Restore normal: `RESTAURAR`
- Verification mode: `VERIFICAR RESTORE`

## :bookmark: Verification mode

Quando `verification_mode=true`:

- Requer permissão `backups.restore_verify`
- Restore ocorre em banco temporário
- Opcionalmente mantém banco de verificação (`keep_verification_database=true`)

## :bookmark: Retenção operacional

Padrão recomendado:

```json
{ "max_backups": 3, "auto_delete": true }
```

Regra prática: ao concluir o 4º backup do mesmo job, remove o mais antigo.

## :bookmark: Recuperação de falha de upload

- Endpoint: `POST /api/executions/:id/retry-upload`
- Uso: quando dump existe, mas upload falhou

## :bookmark: Notificações

- `GET /api/notifications`
- `PUT /api/notifications/:id/read`
- `PUT /api/notifications/read-all`
- `DELETE /api/notifications/:id`

Notificações externas configuráveis em `system_settings`:

- SMTP
- Webhook
- WhatsApp (Evolution)

Templates/versionamento:

- `GET /api/system/notification-templates`
- `POST /api/system/notification-templates`
- `PUT /api/system/notification-templates/:id`
- `POST /api/system/notification-templates/:id/new-version`

## :bookmark: Troubleshooting rápido

- Backup/restore não inicia: verificar Redis em `/api/health` (`services.redis`)
- Restore não roda: validar execução origem `completed` e storage com arquivo disponível
- Query/schema falhando: revisar credenciais da datasource
- Falta de logs: consultar `GET /api/executions/:id/logs` e logs do worker no terminal

