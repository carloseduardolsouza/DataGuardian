# Arquitetura — DataGuardian

Visão técnica completa da arquitetura do sistema DataGuardian.

## Índice

- [Visão Geral](#visão-geral)
- [Decisões de Design](#decisões-de-design)
- [Diagrama de Componentes](#diagrama-de-componentes)
- [Camadas da Aplicação](#camadas-da-aplicação)
- [Fluxos de Execução Detalhados](#fluxos-de-execução-detalhados)
- [Padrões de Projeto Utilizados](#padrões-de-projeto-utilizados)
- [Sistema de Filas](#sistema-de-filas)
- [Stack Tecnológica](#stack-tecnológica)
- [Diagrama de Relacionamentos do Banco](#diagrama-de-relacionamentos-do-banco)

---

## Visão Geral

O DataGuardian é um sistema **monolítico** auto-hospedado de gerenciamento de backups. O monolito executa em um único processo Node.js que combina:

- **API REST** — interface para configurar e operar o sistema
- **Workers** — processos background que executam os backups, health checks e limpezas
- **Scheduler** — motor de agendamento que coloca jobs nas filas no momento certo

```
┌──────────────────────────────────────────────────────────────┐
│                   Processo Node.js (src/index.ts)            │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐  │
│  │   API Express   │    │          Workers (BullMQ)        │  │
│  │                 │    │                                  │  │
│  │  /api/...       │    │  SchedulerWorker  BackupWorker   │  │
│  │                 │    │  HealthWorker     CleanupWorker  │  │
│  └────────┬────────┘    └──────────────┬──────────────────┘  │
│           │                           │                      │
└───────────┼───────────────────────────┼──────────────────────┘
            │                           │
     ┌──────▼──────┐             ┌──────▼──────┐
     │  PostgreSQL  │             │    Redis    │
     │ (metadados) │             │   (filas)   │
     └─────────────┘             └─────────────┘
```

---

## Decisões de Design

### Monolito ao invés de Microserviços

**Decisão:** Manter API e Workers no mesmo processo.

**Justificativa:**
- Simplicidade de deploy (um único container `app`)
- Sem overhead de comunicação entre serviços
- Escopo do projeto (self-hosted, single-user) não requer escala horizontal dos workers
- Facilita o onboarding e contribuições

**Quando reconsiderar:** Se o sistema evoluir para multi-tenant ou exigir escala massiva de workers paralelos.

---

### BullMQ + Redis para Filas

**Decisão:** Usar BullMQ (Redis) para gerenciar a fila de backups ao invés de um sistema de cron direto.

**Justificativa:**
- Persistência: jobs não são perdidos se o processo reiniciar
- Retry automático com backoff exponencial em caso de falha
- Visibilidade: dashboard de filas para monitorar jobs
- Concorrência controlada: limitar backups simultâneos via `concurrency`
- Deduplicação: evitar que o mesmo job seja enfileirado duas vezes

---

### Prisma ORM

**Decisão:** Usar Prisma ao invés de queries SQL brutas ou outro ORM.

**Justificativa:**
- Tipo-safety completo: queries retornam tipos TypeScript inferidos automaticamente
- Migrations declarativas com rollback
- Prisma Studio para inspeção visual do banco em desenvolvimento
- Suporte nativo a PostgreSQL com operadores JSONB

---

### Streaming de Dados

**Decisão:** O pipeline de backup usa Node.js Streams ao invés de bufferizar tudo em memória.

**Justificativa:**
- Backups podem ter dezenas de GB — bufferizar causaria OOM
- `pg_dump | gzip | upload` é um pipeline de streams end-to-end
- Permite calcular checksum enquanto os dados são transferidos

```
Datasource → Backup Engine → Compressor → Chunker → Storage Adapter
              (ReadStream)   (Transform)  (Transform) (WritableStream)
```

---

## Diagrama de Componentes

```
┌──────────────────────────────────────────────────────────────────────┐
│                          src/api/                                    │
│                                                                      │
│  server.ts                                                           │
│  ├── middlewares/                                                    │
│  │   ├── logger.ts          (request logging com Pino)               │
│  │   ├── validation.ts      (Zod schema validation)                  │
│  │   └── error-handler.ts   (tratamento centralizado de erros)       │
│  └── routes/                                                         │
│      ├── datasources.ts     GET/POST/PUT/DELETE /api/datasources     │
│      ├── storage-locations.ts                                        │
│      ├── backup-jobs.ts                                              │
│      ├── executions.ts                                               │
│      ├── health.ts                                                   │
│      ├── notifications.ts                                            │
│      └── system.ts                                                   │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ chama
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          src/core/                                   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ backup/                                                      │    │
│  │  executor.ts          (orquestra engine + compressor + storage)│   │
│  │  compressor.ts        (gzip / zstd / lz4)                    │    │
│  │  engines/                                                    │    │
│  │   ├── base-engine.ts  (interface IBackupEngine)              │    │
│  │   ├── postgres-engine.ts   → pg_dump                         │    │
│  │   ├── mysql-engine.ts      → mysqldump                       │    │
│  │   ├── mongodb-engine.ts    → mongodump                       │    │
│  │   ├── sqlserver-engine.ts  → sqlpackage / bcp                │    │
│  │   ├── sqlite-engine.ts     → cópia do arquivo .db            │    │
│  │   └── files-engine.ts      → tar + padrões glob              │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ storage/                                                     │    │
│  │  storage-factory.ts   (Factory: cria o adapter correto)      │    │
│  │  adapters/                                                   │    │
│  │   ├── base-adapter.ts      (interface IStorageAdapter)       │    │
│  │   ├── local-adapter.ts     → fs.createWriteStream            │    │
│  │   ├── s3-adapter.ts        → @aws-sdk/client-s3              │    │
│  │   ├── ssh-adapter.ts       → ssh2 (SFTP)                     │    │
│  │   ├── minio-adapter.ts     → minio (S3-compatible)           │    │
│  │   └── backblaze-adapter.ts → backblaze-b2                    │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ scheduler/                                                   │    │
│  │  cron-parser.ts       (valida e interpreta cron expressions) │    │
│  │  job-scheduler.ts     (calcula next_execution_at)            │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ retention/                                                   │    │
│  │  cleanup-manager.ts   (política GFS de retenção)             │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ health/                                                      │    │
│  │  health-checker.ts    (testa conectividade + coleta metadados)│   │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ usa
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         src/workers/                                 │
│                                                                      │
│  backup-worker.ts     Consumer da backup-queue                       │
│  health-worker.ts     Producer/Consumer da health-queue (a cada 5min)│
│  scheduler-worker.ts  Polling a cada 1min → enfileira backups devidos│
│  cleanup-worker.ts    Cron diário às 4h → aplica GFS e deleta        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Camadas da Aplicação

O DataGuardian segue uma arquitetura em camadas clara:

```
┌─────────────────────────────────────────────────────┐
│                  HTTP Layer (API)                   │  ← Roteamento, validação, serialização
├─────────────────────────────────────────────────────┤
│               Business Logic (Core)                 │  ← Regras de negócio, orquestração
├─────────────────────────────────────────────────────┤
│          Infrastructure (Engines + Adapters)        │  ← I/O com sistemas externos
├─────────────────────────────────────────────────────┤
│               Database (Prisma ORM)                 │  ← Persistência de metadados
└─────────────────────────────────────────────────────┘
```

### Responsabilidades por Camada

**HTTP Layer (`src/api/`)**
- Receber e validar requests HTTP
- Chamar a camada de Core com dados limpos
- Serializar e retornar responses HTTP
- Sem lógica de negócio

**Business Logic (`src/core/`)**
- Orquestrar o pipeline de backup (Engine → Compressor → Storage)
- Implementar políticas de retenção GFS
- Calcular agendamentos cron
- Disparar notificações
- Sem conhecimento de HTTP

**Infrastructure Layer (Engines e Adapters)**
- `Engines`: comunicar com bancos de dados e sistemas de arquivos para extrair dados
- `Adapters`: fazer upload/download nos storages de destino
- Sem lógica de negócio — apenas I/O

**Database Layer (`Prisma`)**
- Persistir todos os metadados: jobs, execuções, datasources, etc.
- Não persiste os arquivos de backup (isso é papel dos storage adapters)

---

## Fluxos de Execução Detalhados

### Fluxo Completo de um Backup

```
1. SchedulerWorker (a cada 1 minuto)
   │
   ├── SELECT backup_jobs WHERE enabled = true AND next_execution_at <= NOW()
   │
   └── Para cada job due:
       ├── INSERT backup_executions (status: queued)
       ├── backup-queue.add({ execution_id, job_id })
       └── UPDATE backup_jobs SET next_execution_at = calcularProxima(cron, timezone)

2. BackupWorker (consumer da backup-queue)
   │
   ├── Recebe { execution_id, job_id }
   ├── UPDATE backup_executions SET status = running, started_at = NOW()
   │
   ├── Busca:
   │   ├── BackupJob → retention_policy, backup_options
   │   ├── Datasource → type, connection_config
   │   └── StorageLocation → type, config
   │
   ├── engine = BackupEngineFactory.create(datasource.type)
   │   Exemplos: PostgresEngine, MySQLEngine, FilesEngine
   │
   ├── adapter = StorageAdapterFactory.create(storage.type)
   │   Exemplos: LocalAdapter, S3Adapter, SSHAdapter
   │
   ├── Pipeline de streams:
   │   engine.backup(config)           → ReadableStream (dados brutos)
   │       │
   │       └── Compressor.compress()   → TransformStream (dados comprimidos)
   │               │
   │               └── Chunker.chunk() → [TransformStream] (divide em partes)
   │                       │
   │                       └── adapter.upload() → storage de destino
   │
   ├── Calcula checksum SHA256 do arquivo final
   │
   ├── INSERT backup_chunks (se dividido)
   │
   └── UPDATE backup_executions SET
           status = completed,
           finished_at = NOW(),
           size_bytes, compressed_size_bytes,
           backup_path, metadata (compression_ratio, etc.)

3. Em caso de erro:
   ├── UPDATE backup_executions SET status = failed, error_message, error_stack
   └── INSERT notifications (type: backup_failed, severity: critical)
```

### Fluxo do Health Check

```
HealthWorker (a cada 5 minutos)
│
├── SELECT datasources WHERE enabled = true
│
└── Para cada datasource (em paralelo, até 10 simultâneos):
    │
    ├── inicio = Date.now()
    ├── healthChecker.check(datasource)
    │   ├── Postgres: SELECT 1 + pg_stat_activity
    │   ├── MySQL: SELECT 1 + SHOW STATUS
    │   ├── MongoDB: db.adminCommand({ ping: 1 })
    │   └── Files: fs.access(source_path)
    │
    ├── latency_ms = Date.now() - inicio
    │
    ├── INSERT health_checks (status, latency_ms, metadata)
    │
    ├── UPDATE datasources SET status, last_health_check_at
    │
    ├── Se falhou 3x consecutivas:
    │   └── INSERT notifications (connection_lost, critical)
    │
    └── Se voltou após falha:
        └── INSERT notifications (connection_restored, info)
```

### Fluxo do Cleanup (GFS)

```
CleanupWorker (cron: 0 4 * * * — todo dia às 4h)
│
├── SELECT backup_jobs WHERE retention_policy->>'auto_delete' = 'true'
│
└── Para cada job:
    │
    ├── SELECT backup_executions WHERE job_id = ? AND status = completed
    │   ORDER BY created_at DESC
    │
    ├── Aplica política GFS:
    │   │
    │   ├── KEEP: Últimos 7 dias → todos os backups (keep_daily)
    │   ├── KEEP: Dias 8–28 → apenas o de domingo de cada semana (keep_weekly)
    │   ├── KEEP: Meses 2–12 → apenas o dia 1 de cada mês (keep_monthly)
    │   └── DELETE: tudo além disso
    │
    ├── Para cada execution a deletar:
    │   ├── adapter.delete(backup_path)
    │   ├── adapter.delete(chunks[])
    │   ├── DELETE FROM backup_chunks WHERE execution_id = ?
    │   └── DELETE FROM backup_executions WHERE id = ?
    │
    └── INSERT notifications (cleanup_completed, info)
        com estatísticas: X backups deletados, Y GB liberados
```

---

## Padrões de Projeto Utilizados

### Factory Pattern — Storage e Engines

O `StorageFactory` e o `BackupEngineFactory` criam a instância correta baseada no tipo, sem que o chamador precise conhecer as implementações concretas.

```typescript
// O executor não sabe qual adapter está usando
const adapter = StorageFactory.create(storageLocation);
await adapter.upload(stream, path);
```

### Strategy Pattern — Engines e Adapters

Cada engine e adapter é uma estratégia intercambiável que implementa a mesma interface (`IBackupEngine` / `IStorageAdapter`).

### Pipeline Pattern — Backup Streaming

O backup é um pipeline de transformações encadeadas usando Node.js Streams:

```
Source → Engine → Compressor → Chunker → Adapter (Sink)
```

### Repository Pattern (implícito via Prisma)

O Prisma Client age como um repositório, abstraindo as queries SQL. Os serviços da camada de Core nunca escrevem SQL diretamente.

### Observer Pattern — Notificações

Eventos críticos (backup falhou, datasource caiu) disparam notificações via um sistema de eventos interno. A camada de Core emite eventos; o serviço de notificações os consome e decide como alertar (banco de dados, e-mail, webhook).

---

## Sistema de Filas

### Visão Geral das Filas

```
┌──────────────────────────────────────────────────────┐
│                      Redis                           │
│                                                      │
│  ┌────────────────┐    ┌──────────────────────────┐  │
│  │  backup-queue  │    │     health-queue          │  │
│  │                │    │                          │  │
│  │  [queued] ──── │──► │  BackupWorker            │  │
│  │  [active]      │    │  (concurrency: 3)         │  │
│  │  [completed]   │    └──────────────────────────┘  │
│  │  [failed]      │                                  │
│  └────────────────┘    ┌──────────────────────────┐  │
│                        │    cleanup-queue          │  │
│  ┌────────────────┐    │                          │  │
│  │notification-q  │    │  CleanupWorker           │  │
│  │                │    │  (cron: 0 4 * * *)       │  │
│  │  [queued] ──── │──► └──────────────────────────┘  │
│  └────────────────┘                                  │
└──────────────────────────────────────────────────────┘
```

### Configuração das Filas

| Fila                 | Concorrência | Retry | Backoff         | Remoção automática |
|----------------------|-------------|-------|-----------------|--------------------|
| `backup-queue`       | 3           | 3x    | Exponencial 30s | Completed: 100 jobs |
| `health-queue`       | 10          | 2x    | Fixo 10s        | Completed: 50 jobs  |
| `cleanup-queue`      | 1           | 1x    | —               | Completed: 30 jobs  |
| `notification-queue` | 5           | 3x    | Exponencial 60s | Completed: 200 jobs |

### Prioridades na Fila de Backup

Jobs manuais (via `POST /api/backup-jobs/:id/run`) têm prioridade maior que jobs agendados:

```typescript
// Backup manual — prioridade alta
backupQueue.add('backup', data, { priority: 1 });

// Backup agendado — prioridade normal
backupQueue.add('backup', data, { priority: 10 });
```

---

## Stack Tecnológica

### Runtime e Linguagem

| Tecnologia      | Versão | Papel                                    |
|-----------------|--------|------------------------------------------|
| Node.js         | 20+    | Runtime JavaScript server-side           |
| TypeScript      | 5.x    | Type-safety, melhor DX                   |

### Framework e Infraestrutura

| Tecnologia      | Versão | Papel                                    |
|-----------------|--------|------------------------------------------|
| Express         | 4.x    | Framework HTTP da API REST               |
| Prisma ORM      | 5.x    | ORM, migrations, Prisma Client tipado    |
| BullMQ          | 5.x    | Sistema de filas com Redis               |
| PostgreSQL      | 16     | Banco de metadados do sistema            |
| Redis           | 7      | Backend das filas BullMQ                 |

### Backup Engines

| Biblioteca          | Papel                               |
|---------------------|-------------------------------------|
| `pg`                | Driver PostgreSQL para testes de conexão e metadata |
| `mysql2`            | Driver MySQL/MariaDB                |
| `mongodb`           | Driver oficial MongoDB              |
| `mssql`             | Driver SQL Server                   |
| `better-sqlite3`    | Driver SQLite (síncrono)            |

> Os dumps são gerados pelos binários nativos (`pg_dump`, `mysqldump`, `mongodump`) via `child_process.spawn()`, não pelas bibliotecas acima. As libs são usadas apenas para conectar e testar.

### Storage Adapters

| Biblioteca          | Papel                               |
|---------------------|-------------------------------------|
| `@aws-sdk/client-s3`| AWS S3 e provedores S3-compatíveis  |
| `ssh2`              | SSH/SFTP para NAS e servidores       |
| `fs-extra`          | Operações de filesystem local       |
| `minio`             | MinIO SDK                           |

### Utilitários

| Biblioteca          | Papel                               |
|---------------------|-------------------------------------|
| `pino`              | Logger estruturado (JSON) de alta performance |
| `zod`               | Validação de schemas runtime        |
| `cron-parser`       | Parse e validação de cron expressions |
| `date-fns-tz`       | Manipulação de datas com suporte a timezones |
| `zlib`              | Compressão gzip (nativo Node.js)    |
| `@mongodb-js/zstd`  | Compressão Zstandard                |

---

## Diagrama de Relacionamentos do Banco

```
┌─────────────────────┐
│      datasources    │
│─────────────────────│
│ id (PK)             │◄──────────────────────────────────────┐
│ name                │                                       │
│ type                │                                       │
│ connection_config   │                                       │
│ status              │                                       │
│ enabled             │                                       │
│ tags                │                                       │
│ last_health_check_at│                                       │
└─────────┬───────────┘                                       │
          │ 1                                                 │
          │◄────────────────────────────────────┐            │
          │                                     │            │
          ▼ N                                   │            │
┌─────────────────────┐         ┌───────────────┴──┐        │
│    health_checks    │         │   backup_jobs    │        │
│─────────────────────│         │──────────────────│        │
│ id (PK)             │         │ id (PK)          │        │
│ datasource_id (FK)──┼─────────│ datasource_id(FK)│        │
│ checked_at          │         │ storage_loc_id(FK)│       │
│ status              │         │ name             │        │
│ latency_ms          │         │ schedule_cron    │        │
│ error_message       │         │ enabled          │        │
│ metadata            │         │ retention_policy │        │
└─────────────────────┘         │ backup_options   │        │
                                │ next_execution_at│        │
                                └───────┬──────────┘        │
                                        │ 1                 │
                                        │                   │
                                        ▼ N                 │
                         ┌──────────────────────────┐       │
                         │    backup_executions      │       │
                         │──────────────────────────│       │
                         │ id (PK)                  │       │
                         │ job_id (FK) ─────────────┘       │
                         │ datasource_id (FK) ──────────────┘
                         │ storage_location_id (FK)
                         │ status
                         │ started_at / finished_at
                         │ duration_seconds
                         │ size_bytes
                         │ compressed_size_bytes
                         │ backup_path
                         │ backup_type
                         │ error_message / error_stack
                         │ metadata
                         └──────────────┬───────────┘
                                        │ 1
                                        │
                                        ▼ N
                         ┌──────────────────────────┐
                         │      backup_chunks        │
                         │──────────────────────────│
                         │ id (PK)                  │
                         │ execution_id (FK)        │
                         │ chunk_number             │
                         │ file_path                │
                         │ size_bytes               │
                         │ checksum                 │
                         └──────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        storage_locations                            │
│─────────────────────────────────────────────────────────────────────│
│ id (PK)  │ name  │ type  │ config  │ is_default  │ available_space_gb│
└─────────────────────────────────────────────────────────────────────┘
     │ 1            referenciado por backup_jobs.storage_location_id
     │              e backup_executions.storage_location_id

┌────────────────────────────────────────────────────────────────────┐
│                          notifications                              │
│────────────────────────────────────────────────────────────────────│
│ id  │ type  │ severity  │ entity_type  │ entity_id  │ title        │
│ message  │ metadata  │ read_at  │ created_at                       │
│                                                                    │
│ entity_id aponta para qualquer entidade (datasource, job, storage) │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                         system_settings                            │
│────────────────────────────────────────────────────────────────────│
│ key (PK)  │ value (JSONB)  │ description  │ updated_at            │
└────────────────────────────────────────────────────────────────────┘
```
