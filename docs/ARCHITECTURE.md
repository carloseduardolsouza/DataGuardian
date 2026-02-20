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
