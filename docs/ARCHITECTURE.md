# Architecture - DataGuardian

## Resumo

DataGuardian e um monolito Node.js com:

- API Express
- Workers em background
- PostgreSQL para metadados
- Redis/BullMQ para filas de backup e restore

## Componentes

- `src/api/*`: rotas, controllers, middlewares
- `src/core/*`: logica de backup, restore, storage, health, retention, auth
- `src/workers/*`: scheduler, backup, restore, health, cleanup
- `src/queue/*`: configuracao BullMQ/Redis
- `src/lib/prisma.ts`: acesso ao banco
- `src/core/performance/*`: monitor da maquina/processo e thread pool CPU-bound

## Inicializacao

`src/index.ts`:

1. conecta no PostgreSQL
2. tenta conectar no Redis
3. inicia API
4. inicia `health` e `cleanup`
5. ativa `scheduler`, `backup` e `restore` somente se Redis estiver disponivel
6. monitora Redis periodicamente para ligar/desligar servicos de fila

## Degradacao sem Redis

Com Redis offline:

- `scheduler`, `backup` e `restore` param
- `health` e `cleanup` continuam
- endpoints dependentes de fila retornam erro de indisponibilidade

Ao reconectar Redis, servicos de fila voltam automatico.

## Pipeline de backup

`backup-worker` executa:

1. claim da execucao `queued -> running`
2. teste de conexao da datasource
3. dump (engine)
4. compressao
5. calculo de checksum
6. upload para um ou mais storages
7. persistencia de chunks/metadados
8. finaliza `completed` ou `failed`

### Estrategia de storage

- `fallback`: salva no primeiro storage disponivel
- `replicate`: tenta salvar em todos os storages configurados

## Retencao

Implementacao em `src/core/retention/cleanup-manager.ts`.

Regra atual:

- se existir `retention_policy.max_backups`, usa esse valor
- senao, usa compatibilidade legada (`keep_daily + keep_weekly + keep_monthly`)
- remove execucoes `completed` antigas alem do limite

A retencao roda:

- em ciclo do cleanup worker
- imediatamente apos backup concluido com sucesso (pos execucao)

## Restore

Implementado em `src/api/models/backups.model.ts`.
Processado pelo `restore-worker` em `src/workers/restore-worker.ts`.

Fluxo:

1. API cria execucao `queued` com metadata `operation=restore`
2. execucao e enfileirada na `restore-queue`
3. worker faz lock `queued -> running`
4. materializa backup dos storages
5. restaura no banco alvo (ou banco temporario no verification mode)
6. grava logs da execucao em metadata
7. finaliza `completed` ou `failed`

Tipos suportados hoje:

- `postgres`
- `mysql`
- `mariadb`

## Workers

- `scheduler-worker`: identifica jobs vencidos e enfileira execucoes
- `backup-worker`: processa `backup-queue`
- `restore-worker`: processa `restore-queue`
- `health-worker`: verifica datasources e storages
- `cleanup-worker`: aplica retencao

## Seguranca de acesso

- sessao em cookie HTTP-only (`dg_session`)
- middleware `requireAuth` protege `/api/*` (exceto `/api/auth/*`)
- RBAC dinamico: usuarios, roles e permissoes no banco
- auditoria de operacoes sensiveis em `audit_logs`

## Observabilidade

- health endpoint simples: `GET /health`
- health detalhado: `GET /api/health`
- metricas Prometheus: `GET /metrics`
- logs por execucao em `backup_executions.metadata.execution_logs`
- dashboard inclui `performance.machine`, `performance.current`, `performance.history`

## Thread Pool de Performance

- implementado com `worker_threads` em `src/core/performance/thread-pool.ts`
- objetivo: tirar tarefas CPU-bound do event-loop principal
- uso atual: checksum SHA-256 de artefatos no `backup-worker`
- fallback: se worker thread falhar, tarefa roda em thread principal para nao interromper backup

Metricas expostas no dashboard:

- `thread_pool.size`
- `thread_pool.busy`
- `thread_pool.queued`
- `thread_pool.processed`
- `thread_pool.failed`

## Monitor da Maquina

- implementado em `src/core/performance/system-monitor.ts`
- coleta periodica de:
- CPU da maquina (`cpu_percent`)
- memoria da maquina (`memory_usage_percent`)
- CPU e memoria do processo Node
- event loop lag medio (`event_loop_lag_ms`)
- load average (1m, 5m, 15m)

Configuracao:

- `SYSTEM_MONITOR_INTERVAL_MS`
- `SYSTEM_MONITOR_HISTORY_SIZE`
