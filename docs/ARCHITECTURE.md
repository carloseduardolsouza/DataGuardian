# :sparkles: Architecture - DataGuardian

> Visão de alto nível da arquitetura e dos fluxos principais.

## :bookmark: Resumo

DataGuardian é um monólito Node.js com:

- API Express
- Workers em background
- PostgreSQL para metadados
- Redis/BullMQ para filas de backup e restore

## :bookmark: Componentes

- `src/api/*`: rotas, controllers e middlewares
- `src/core/*`: lógica de backup, restore, storage, health, retention e auth
- `src/workers/*`: scheduler, backup, restore, health e cleanup
- `src/queue/*`: configuração BullMQ/Redis
- `src/lib/prisma.ts`: acesso ao banco
- `src/core/performance/*`: monitor de máquina/processo e thread pool CPU-bound

## :bookmark: Inicialização

Fluxo em `src/index.ts`:

1. Conecta no PostgreSQL
2. Tenta conectar no Redis
3. Inicia API
4. Inicia `health` e `cleanup`
5. Ativa `scheduler`, `backup` e `restore` somente se Redis estiver disponível
6. Monitora Redis periodicamente para ligar/desligar serviços de fila

## :bookmark: Degradação sem Redis

Com Redis offline:

- `scheduler`, `backup` e `restore` param
- `health` e `cleanup` continuam
- Endpoints dependentes de fila retornam erro de indisponibilidade

Quando o Redis reconecta, os serviços de fila voltam automaticamente.

## :bookmark: Pipeline de Backup

O `backup-worker` executa:

1. Claim da execução `queued -> running`
2. Teste de conexão da datasource
3. Dump (engine)
4. Compressão
5. Cálculo de checksum
6. Upload para um ou mais storages
7. Persistência de chunks/metadados
8. Finaliza em `completed` ou `failed`

### :bookmark: Estratégia de storage

- `fallback`: salva no primeiro storage disponível
- `replicate`: tenta salvar em todos os storages configurados

## :bookmark: Retenção

Implementação em `src/core/retention/cleanup-manager.ts`.

Regra atual:

- Se existir `retention_policy.max_backups`, usa esse valor
- Senão, usa compatibilidade legada (`keep_daily + keep_weekly + keep_monthly`)
- Remove execuções `completed` antigas além do limite

A retenção roda:

- No ciclo do cleanup worker
- Imediatamente após backup concluído com sucesso

## :bookmark: Restore

Implementado em `src/api/models/backups.model.ts`.
Processado pelo `restore-worker` em `src/workers/restore-worker.ts`.

Fluxo:

1. API cria execução `queued` com metadata `operation=restore`
2. Execução é enfileirada na `restore-queue`
3. Worker faz lock `queued -> running`
4. Materializa backup dos storages
5. Restaura no banco alvo (ou banco temporário no verification mode)
6. Grava logs da execução em metadata
7. Finaliza em `completed` ou `failed`

Tipos suportados hoje:

- `postgres`
- `mysql`
- `mariadb`

## :bookmark: Workers

- `scheduler-worker`: identifica jobs vencidos e enfileira execuções
- `backup-worker`: processa `backup-queue`
- `restore-worker`: processa `restore-queue`
- `health-worker`: verifica datasources e storages
- `cleanup-worker`: aplica retenção

## :bookmark: Segurança de Acesso

- Sessão em cookie HTTP-only (`dg_session`)
- Middleware `requireAuth` protege `/api/*` (exceto `/api/auth/*`)
- RBAC dinâmico: usuários, roles e permissões no banco
- Auditoria de operações sensíveis em `audit_logs`

## :bookmark: Observabilidade

- Health endpoint simples: `GET /health`
- Health detalhado: `GET /api/health`
- Métricas Prometheus: `GET /metrics`
- Logs por execução: `backup_executions.metadata.execution_logs`
- Dashboard inclui `performance.machine`, `performance.current`, `performance.history`

## :bookmark: Thread Pool de Performance

- Implementado com `worker_threads` em `src/core/performance/thread-pool.ts`
- Objetivo: tirar tarefas CPU-bound do event-loop principal
- Uso atual: checksum SHA-256 de artefatos no `backup-worker`
- Fallback: se worker thread falhar, tarefa roda na thread principal para não interromper backup

Métricas expostas no dashboard:

- `thread_pool.size`
- `thread_pool.busy`
- `thread_pool.queued`
- `thread_pool.processed`
- `thread_pool.failed`

## :sparkles: Monitor da Máquina

- Implementado em `src/core/performance/system-monitor.ts`
- Coleta periódica de CPU, memória, processo Node e event loop lag
- Também coleta load average (1m, 5m, 15m)

Configuração:

- `SYSTEM_MONITOR_INTERVAL_MS`
- `SYSTEM_MONITOR_HISTORY_SIZE`

