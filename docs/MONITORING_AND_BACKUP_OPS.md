# Monitoring and Backup Ops - DataGuardian

## Monitoramento

### Endpoints

- `GET /api/health`
- `GET /api/health/datasources`
- `GET /api/health/storage`
- `GET /api/dashboard/overview`

### Workers

- `health-worker`: checa datasources e storages periodicamente
- `scheduler-worker`: agenda backups vencidos (depende de Redis)
- `backup-worker`: executa backups enfileirados
- `cleanup-worker`: aplica retencao

## Observabilidade de execucao

- logs por execucao em `backup_executions.metadata.execution_logs`
- endpoint de logs:
  - `GET /api/executions/:id/logs`

No terminal, backups e restores publicam progresso com prefixos:

- `[BACKUP] ...`
- `[RESTORE] ...`

## Fluxo de backup manual

1. `POST /api/backup-jobs/:id/run`
2. cria execucao `queued`
3. worker marca `running`
4. dump -> compressao -> upload
5. status final `completed` ou `failed`
6. retencao aplicada apos conclusao

## Fluxo de restore

1. `POST /api/backups/:executionId/restore`
2. cria nova execucao (`operation=restore`)
3. baixa artefato do storage
4. restaura no banco alvo
5. logs aparecem em `GET /api/executions/:id/logs`

Suporte atual:

- `postgres`
- `mysql`
- `mariadb`

## Retencao operacional

Preferencial:

```json
{ "max_backups": 3, "auto_delete": true }
```

Regra: ao concluir o 4o backup do job, remove o mais antigo.

## Recuperacao de falha de upload

Endpoint:

- `POST /api/executions/:id/retry-upload`

Uso: quando dump foi gerado mas upload falhou.

## Notificacoes

- `GET /api/notifications`
- `PUT /api/notifications/:id/read`
- `PUT /api/notifications/read-all`

Tipos comuns:

- `backup_failed`
- `connection_lost`
- `storage_unreachable`
- `cleanup_completed`

## Troubleshooting rapido

- backup nao inicia: verificar Redis (`/api/health` -> `services.redis`)
- schema/query falhando: validar credenciais e `connection_config`
- restore nao roda: checar se execucao origem esta `completed` e storage `available`
- fila parada: Redis fora do ar desativa scheduler/backup automaticamente
