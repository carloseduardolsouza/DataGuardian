# Architecture - DataGuardian

## Resumo

DataGuardian e um monolito Node.js com:

- API Express
- Workers em background
- PostgreSQL para metadados
- Redis/BullMQ para fila de backups

## Componentes

- `src/api/*`: rotas, controllers, middlewares
- `src/core/*`: logica de backup, storage, health, retention, auth
- `src/workers/*`: scheduler, backup, health, cleanup
- `src/queue/*`: configuracao BullMQ/Redis
- `src/lib/prisma.ts`: acesso ao banco

## Inicializacao

`src/index.ts`:

1. conecta no PostgreSQL
2. tenta conectar no Redis
3. inicia API
4. inicia `health` e `cleanup`
5. ativa `scheduler` e `backup` somente se Redis estiver disponivel
6. monitora Redis periodicamente para ligar/desligar servicos de fila

## Degradacao sem Redis

Com Redis offline:

- `scheduler` e `backup` param
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

Fluxo:

1. cria nova execucao `running` com metadata `operation=restore`
2. materializa arquivo de backup a partir dos storages
3. descompacta quando necessario
4. restaura no banco alvo
5. grava logs da execucao
6. finaliza `completed` ou `failed`

Tipos suportados hoje:

- `postgres`
- `mysql`
- `mariadb`

## Workers

- `scheduler-worker`: identifica jobs vencidos e enfileira execucoes
- `backup-worker`: processa `backup-queue`
- `health-worker`: verifica datasources e storages
- `cleanup-worker`: aplica retencao

## Seguranca de acesso

- auth single-user
- sessao em cookie HTTP-only (`dg_session`)
- middleware `requireAuth` protege `/api/*` (exceto `/api/auth/*`)
