# Arquitetura â€” DataGuardian

VisÃ£o tÃ©cnica completa da arquitetura do sistema DataGuardian.

## Ãndice

- [VisÃ£o Geral](#visÃ£o-geral)
- [DecisÃµes de Design](#decisÃµes-de-design)
- [Diagrama de Componentes](#diagrama-de-componentes)
- [Camadas da AplicaÃ§Ã£o](#camadas-da-aplicaÃ§Ã£o)
- [Fluxos de ExecuÃ§Ã£o Detalhados](#fluxos-de-execuÃ§Ã£o-detalhados)
- [PadrÃµes de Projeto Utilizados](#padrÃµes-de-projeto-utilizados)
- [Sistema de Filas](#sistema-de-filas)
- [Stack TecnolÃ³gica](#stack-tecnolÃ³gica)
- [Diagrama de Relacionamentos do Banco](#diagrama-de-relacionamentos-do-banco)

---

## VisÃ£o Geral

O DataGuardian Ã© um sistema **monolÃ­tico** auto-hospedado de gerenciamento de backups. O monolito executa em um Ãºnico processo Node.js que combina:

- **API REST** â€” interface para configurar e operar o sistema
- **Workers** â€” processos background que executam os backups, health checks e limpezas
- **Scheduler** â€” motor de agendamento que coloca jobs nas filas no momento certo

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                   Processo Node.js (src/index.ts)            â”‚
â”‚                                                              â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚   API Express   â”‚    â”‚          Workers (BullMQ)        â”‚  â”‚
â”‚  â”‚                 â”‚    â”‚                                  â”‚  â”‚
â”‚  â”‚  /api/...       â”‚    â”‚  SchedulerWorker  BackupWorker   â”‚  â”‚
â”‚  â”‚                 â”‚    â”‚  HealthWorker     CleanupWorker  â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚           â”‚                           â”‚                      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
            â”‚                           â”‚
     â”Œâ”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”             â”Œâ”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”
     â”‚  PostgreSQL  â”‚             â”‚    Redis    â”‚
     â”‚ (metadados) â”‚             â”‚   (filas)   â”‚
     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜             â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## DecisÃµes de Design

### Monolito ao invÃ©s de MicroserviÃ§os

**DecisÃ£o:** Manter API e Workers no mesmo processo.

**Justificativa:**
- Simplicidade de deploy (um Ãºnico container `app`)
- Sem overhead de comunicaÃ§Ã£o entre serviÃ§os
- Escopo do projeto (self-hosted, single-user) nÃ£o requer escala horizontal dos workers
- Facilita o onboarding e contribuiÃ§Ãµes

**Quando reconsiderar:** Se o sistema evoluir para multi-tenant ou exigir escala massiva de workers paralelos.

---

### BullMQ + Redis para Filas

**DecisÃ£o:** Usar BullMQ (Redis) para gerenciar a fila de backups ao invÃ©s de um sistema de cron direto.

**Justificativa:**
- PersistÃªncia: jobs nÃ£o sÃ£o perdidos se o processo reiniciar
- Retry automÃ¡tico com backoff exponencial em caso de falha
- Visibilidade: dashboard de filas para monitorar jobs
- ConcorrÃªncia controlada: limitar backups simultÃ¢neos via `concurrency`
- DeduplicaÃ§Ã£o: evitar que o mesmo job seja enfileirado duas vezes

---

### Prisma ORM

**DecisÃ£o:** Usar Prisma ao invÃ©s de queries SQL brutas ou outro ORM.

**Justificativa:**
- Tipo-safety completo: queries retornam tipos TypeScript inferidos automaticamente
- Migrations declarativas com rollback
- Prisma Studio para inspeÃ§Ã£o visual do banco em desenvolvimento
- Suporte nativo a PostgreSQL com operadores JSONB

---

### Streaming de Dados

**DecisÃ£o:** O pipeline de backup usa Node.js Streams ao invÃ©s de bufferizar tudo em memÃ³ria.

**Justificativa:**
- Backups podem ter dezenas de GB â€” bufferizar causaria OOM
- `pg_dump | gzip | upload` Ã© um pipeline de streams end-to-end
- Permite calcular checksum enquanto os dados sÃ£o transferidos

```
Datasource â†’ Backup Engine â†’ Compressor â†’ Chunker â†’ Storage Adapter
              (ReadStream)   (Transform)  (Transform) (WritableStream)
```

---

## Diagrama de Componentes

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                          src/api/                                    â”‚
â”‚                                                                      â”‚
â”‚  server.ts                                                           â”‚
â”‚  â”œâ”€â”€ middlewares/                                                    â”‚
â”‚  â”‚   â”œâ”€â”€ logger.ts          (request logging com Pino)               â”‚
â”‚  â”‚   â”œâ”€â”€ validation.ts      (Zod schema validation)                  â”‚
â”‚  â”‚   â””â”€â”€ error-handler.ts   (tratamento centralizado de erros)       â”‚
â”‚  â””â”€â”€ routes/                                                         â”‚
â”‚      â”œâ”€â”€ datasources.ts     GET/POST/PUT/DELETE /api/datasources     â”‚
â”‚      â”œâ”€â”€ storage-locations.ts                                        â”‚
â”‚      â”œâ”€â”€ backup-jobs.ts                                              â”‚
â”‚      â”œâ”€â”€ executions.ts                                               â”‚
â”‚      â”œâ”€â”€ health.ts                                                   â”‚
â”‚      â”œâ”€â”€ notifications.ts                                            â”‚
â”‚      â””â”€â”€ system.ts                                                   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                              â”‚
                              â”‚ chama
                              â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                          src/core/                                   â”‚
â”‚                                                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚ backup/                                                      â”‚    â”‚
â”‚  â”‚  executor.ts          (orquestra engine + compressor + storage)â”‚   â”‚
â”‚  â”‚  compressor.ts        (gzip / zstd / lz4)                    â”‚    â”‚
â”‚  â”‚  engines/                                                    â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ base-engine.ts  (interface IBackupEngine)              â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ postgres-engine.ts   â†’ pg_dump                         â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ mysql-engine.ts      â†’ mysqldump                       â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ mongodb-engine.ts    â†’ mongodump                       â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ sqlserver-engine.ts  â†’ sqlpackage / bcp                â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ sqlite-engine.ts     â†’ cÃ³pia do arquivo .db            â”‚    â”‚
â”‚  â”‚   â””â”€â”€ files-engine.ts      â†’ tar + padrÃµes glob              â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚ storage/                                                     â”‚    â”‚
â”‚  â”‚  storage-factory.ts   (Factory: cria o adapter correto)      â”‚    â”‚
â”‚  â”‚  adapters/                                                   â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ base-adapter.ts      (interface IStorageAdapter)       â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ local-adapter.ts     â†’ fs.createWriteStream            â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ s3-adapter.ts        â†’ @aws-sdk/client-s3              â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ ssh-adapter.ts       â†’ ssh2 (SFTP)                     â”‚    â”‚
â”‚  â”‚   â”œâ”€â”€ minio-adapter.ts     â†’ minio (S3-compatible)           â”‚    â”‚
â”‚  â”‚   â””â”€â”€ backblaze-adapter.ts â†’ backblaze-b2                    â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚ scheduler/                                                   â”‚    â”‚
â”‚  â”‚  cron-parser.ts       (valida e interpreta cron expressions) â”‚    â”‚
â”‚  â”‚  job-scheduler.ts     (calcula next_execution_at)            â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚ retention/                                                   â”‚    â”‚
â”‚  â”‚  cleanup-manager.ts   (polÃ­tica GFS de retenÃ§Ã£o)             â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚ health/                                                      â”‚    â”‚
â”‚  â”‚  health-checker.ts    (testa conectividade + coleta metadados)â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                              â”‚
                              â”‚ usa
                              â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                         src/workers/                                 â”‚
â”‚                                                                      â”‚
â”‚  backup-worker.ts     Consumer da backup-queue                       â”‚
â”‚  health-worker.ts     Producer/Consumer da health-queue (a cada 5min)â”‚
â”‚  scheduler-worker.ts  Polling a cada 1min â†’ enfileira backups devidosâ”‚
â”‚  cleanup-worker.ts    Cron diÃ¡rio Ã s 4h â†’ aplica GFS e deleta        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Camadas da AplicaÃ§Ã£o

O DataGuardian segue uma arquitetura em camadas clara:

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                  HTTP Layer (API)                   â”‚  â† Roteamento, validaÃ§Ã£o, serializaÃ§Ã£o
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚               Business Logic (Core)                 â”‚  â† Regras de negÃ³cio, orquestraÃ§Ã£o
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚          Infrastructure (Engines + Adapters)        â”‚  â† I/O com sistemas externos
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚               Database (Prisma ORM)                 â”‚  â† PersistÃªncia de metadados
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Responsabilidades por Camada

**HTTP Layer (`src/api/`)**
- Receber e validar requests HTTP
- Chamar a camada de Core com dados limpos
- Serializar e retornar responses HTTP
- Sem lÃ³gica de negÃ³cio

**Business Logic (`src/core/`)**
- Orquestrar o pipeline de backup (Engine â†’ Compressor â†’ Storage)
- Implementar polÃ­ticas de retenÃ§Ã£o GFS
- Calcular agendamentos cron
- Disparar notificaÃ§Ãµes
- Sem conhecimento de HTTP

**Infrastructure Layer (Engines e Adapters)**
- `Engines`: comunicar com bancos de dados e sistemas de arquivos para extrair dados
- `Adapters`: fazer upload/download nos storages de destino
- Sem lÃ³gica de negÃ³cio â€” apenas I/O

**Database Layer (`Prisma`)**
- Persistir todos os metadados: jobs, execuÃ§Ãµes, datasources, etc.
- NÃ£o persiste os arquivos de backup (isso Ã© papel dos storage adapters)

---

## Fluxos de ExecuÃ§Ã£o Detalhados

### Fluxo Completo de um Backup

```
1. SchedulerWorker (a cada 1 minuto)
   â”‚
   â”œâ”€â”€ SELECT backup_jobs WHERE enabled = true AND next_execution_at <= NOW()
   â”‚
   â””â”€â”€ Para cada job due:
       â”œâ”€â”€ INSERT backup_executions (status: queued)
       â”œâ”€â”€ backup-queue.add({ execution_id, job_id })
       â””â”€â”€ UPDATE backup_jobs SET next_execution_at = calcularProxima(cron, timezone)

2. BackupWorker (consumer da backup-queue)
   â”‚
   â”œâ”€â”€ Recebe { execution_id, job_id }
   â”œâ”€â”€ UPDATE backup_executions SET status = running, started_at = NOW()
   â”‚
   â”œâ”€â”€ Busca:
   â”‚   â”œâ”€â”€ BackupJob â†’ retention_policy, backup_options
   â”‚   â”œâ”€â”€ Datasource â†’ type, connection_config
   â”‚   â””â”€â”€ StorageLocation â†’ type, config
   â”‚
   â”œâ”€â”€ engine = BackupEngineFactory.create(datasource.type)
   â”‚   Exemplos: PostgresEngine, MySQLEngine, FilesEngine
   â”‚
   â”œâ”€â”€ adapter = StorageAdapterFactory.create(storage.type)
   â”‚   Exemplos: LocalAdapter, S3Adapter, SSHAdapter
   â”‚
   â”œâ”€â”€ Pipeline de streams:
   â”‚   engine.backup(config)           â†’ ReadableStream (dados brutos)
   â”‚       â”‚
   â”‚       â””â”€â”€ Compressor.compress()   â†’ TransformStream (dados comprimidos)
   â”‚               â”‚
   â”‚               â””â”€â”€ Chunker.chunk() â†’ [TransformStream] (divide em partes)
   â”‚                       â”‚
   â”‚                       â””â”€â”€ adapter.upload() â†’ storage de destino
   â”‚
   â”œâ”€â”€ Calcula checksum SHA256 do arquivo final
   â”‚
   â”œâ”€â”€ INSERT backup_chunks (se dividido)
   â”‚
   â””â”€â”€ UPDATE backup_executions SET
           status = completed,
           finished_at = NOW(),
           size_bytes, compressed_size_bytes,
           backup_path, metadata (compression_ratio, etc.)

3. Em caso de erro:
   â”œâ”€â”€ UPDATE backup_executions SET status = failed, error_message, error_stack
   â””â”€â”€ INSERT notifications (type: backup_failed, severity: critical)
```

### Fluxo do Health Check

```
HealthWorker (a cada 5 minutos)
|
|-- SELECT datasources WHERE enabled = true
|-- SELECT storage_locations
|
|-- Para cada datasource:
|   |-- testa conectividade
|   |-- INSERT health_checks (status, latency_ms, metadata)
|   |-- UPDATE datasources SET status, last_health_check_at
|   |-- em falha: INSERT notifications (connection_lost)
|   `-- em recuperação: INSERT notifications (connection_restored)
|
`-- Para cada storage location:
    |-- testa conectividade (path local / tcp / endpoint)
    |-- UPDATE storage_locations SET status, available_space_gb
    |-- registra histórico para GET /api/health/storage
    |-- em falha: INSERT notifications (storage_unreachable)
    `-- em recuperação: INSERT notifications (connection_restored)
```
### Fluxo do Cleanup (GFS)

```
CleanupWorker (cron: 0 4 * * * â€” todo dia Ã s 4h)
â”‚
â”œâ”€â”€ SELECT backup_jobs WHERE retention_policy->>'auto_delete' = 'true'
â”‚
â””â”€â”€ Para cada job:
    â”‚
    â”œâ”€â”€ SELECT backup_executions WHERE job_id = ? AND status = completed
    â”‚   ORDER BY created_at DESC
    â”‚
    â”œâ”€â”€ Aplica polÃ­tica GFS:
    â”‚   â”‚
    â”‚   â”œâ”€â”€ KEEP: Ãšltimos 7 dias â†’ todos os backups (keep_daily)
    â”‚   â”œâ”€â”€ KEEP: Dias 8â€“28 â†’ apenas o de domingo de cada semana (keep_weekly)
    â”‚   â”œâ”€â”€ KEEP: Meses 2â€“12 â†’ apenas o dia 1 de cada mÃªs (keep_monthly)
    â”‚   â””â”€â”€ DELETE: tudo alÃ©m disso
    â”‚
    â”œâ”€â”€ Para cada execution a deletar:
    â”‚   â”œâ”€â”€ adapter.delete(backup_path)
    â”‚   â”œâ”€â”€ adapter.delete(chunks[])
    â”‚   â”œâ”€â”€ DELETE FROM backup_chunks WHERE execution_id = ?
    â”‚   â””â”€â”€ DELETE FROM backup_executions WHERE id = ?
    â”‚
    â””â”€â”€ INSERT notifications (cleanup_completed, info)
        com estatÃ­sticas: X backups deletados, Y GB liberados
```

---

## PadrÃµes de Projeto Utilizados

### Factory Pattern â€” Storage e Engines

O `StorageFactory` e o `BackupEngineFactory` criam a instÃ¢ncia correta baseada no tipo, sem que o chamador precise conhecer as implementaÃ§Ãµes concretas.

```typescript
// O executor nÃ£o sabe qual adapter estÃ¡ usando
const adapter = StorageFactory.create(storageLocation);
await adapter.upload(stream, path);
```

### Strategy Pattern â€” Engines e Adapters

Cada engine e adapter Ã© uma estratÃ©gia intercambiÃ¡vel que implementa a mesma interface (`IBackupEngine` / `IStorageAdapter`).

### Pipeline Pattern â€” Backup Streaming

O backup Ã© um pipeline de transformaÃ§Ãµes encadeadas usando Node.js Streams:

```
Source â†’ Engine â†’ Compressor â†’ Chunker â†’ Adapter (Sink)
```

### Repository Pattern (implÃ­cito via Prisma)

O Prisma Client age como um repositÃ³rio, abstraindo as queries SQL. Os serviÃ§os da camada de Core nunca escrevem SQL diretamente.

### Observer Pattern â€” NotificaÃ§Ãµes

Eventos crÃ­ticos (backup falhou, datasource caiu) disparam notificaÃ§Ãµes via um sistema de eventos interno. A camada de Core emite eventos; o serviÃ§o de notificaÃ§Ãµes os consome e decide como alertar (banco de dados, e-mail, webhook).

---

## Sistema de Filas

### VisÃ£o Geral das Filas

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                      Redis                           â”‚
â”‚                                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚  backup-queue  â”‚    â”‚     health-queue          â”‚  â”‚
â”‚  â”‚                â”‚    â”‚                          â”‚  â”‚
â”‚  â”‚  [queued] â”€â”€â”€â”€ â”‚â”€â”€â–º â”‚  BackupWorker            â”‚  â”‚
â”‚  â”‚  [active]      â”‚    â”‚  (concurrency: 3)         â”‚  â”‚
â”‚  â”‚  [completed]   â”‚    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚  â”‚  [failed]      â”‚                                  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚                        â”‚    cleanup-queue          â”‚  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚                          â”‚  â”‚
â”‚  â”‚notification-q  â”‚    â”‚  CleanupWorker           â”‚  â”‚
â”‚  â”‚                â”‚    â”‚  (cron: 0 4 * * *)       â”‚  â”‚
â”‚  â”‚  [queued] â”€â”€â”€â”€ â”‚â”€â”€â–º â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### ConfiguraÃ§Ã£o das Filas

| Fila                 | ConcorrÃªncia | Retry | Backoff         | RemoÃ§Ã£o automÃ¡tica |
|----------------------|-------------|-------|-----------------|--------------------|
| `backup-queue`       | 3           | 3x    | Exponencial 30s | Completed: 100 jobs |
| `health-queue`       | 10          | 2x    | Fixo 10s        | Completed: 50 jobs  |
| `cleanup-queue`      | 1           | 1x    | â€”               | Completed: 30 jobs  |
| `notification-queue` | 5           | 3x    | Exponencial 60s | Completed: 200 jobs |

### Prioridades na Fila de Backup

Jobs manuais (via `POST /api/backup-jobs/:id/run`) tÃªm prioridade maior que jobs agendados:

```typescript
// Backup manual â€” prioridade alta
backupQueue.add('backup', data, { priority: 1 });

// Backup agendado â€” prioridade normal
backupQueue.add('backup', data, { priority: 10 });
```

---

## Stack TecnolÃ³gica

### Runtime e Linguagem

| Tecnologia      | VersÃ£o | Papel                                    |
|-----------------|--------|------------------------------------------|
| Node.js         | 20+    | Runtime JavaScript server-side           |
| TypeScript      | 5.x    | Type-safety, melhor DX                   |

### Framework e Infraestrutura

| Tecnologia      | VersÃ£o | Papel                                    |
|-----------------|--------|------------------------------------------|
| Express         | 4.x    | Framework HTTP da API REST               |
| Prisma ORM      | 5.x    | ORM, migrations, Prisma Client tipado    |
| BullMQ          | 5.x    | Sistema de filas com Redis               |
| PostgreSQL      | 16     | Banco de metadados do sistema            |
| Redis           | 7      | Backend das filas BullMQ                 |

### Backup Engines

| Biblioteca          | Papel                               |
|---------------------|-------------------------------------|
| `pg`                | Driver PostgreSQL para testes de conexÃ£o e metadata |
| `mysql2`            | Driver MySQL/MariaDB                |
| `mongodb`           | Driver oficial MongoDB              |
| `mssql`             | Driver SQL Server                   |
| `better-sqlite3`    | Driver SQLite (sÃ­ncrono)            |

> Os dumps sÃ£o gerados pelos binÃ¡rios nativos (`pg_dump`, `mysqldump`, `mongodump`) via `child_process.spawn()`, nÃ£o pelas bibliotecas acima. As libs sÃ£o usadas apenas para conectar e testar.

### Storage Adapters

| Biblioteca          | Papel                               |
|---------------------|-------------------------------------|
| `@aws-sdk/client-s3`| AWS S3 e provedores S3-compatÃ­veis  |
| `ssh2`              | SSH/SFTP para NAS e servidores       |
| `fs-extra`          | OperaÃ§Ãµes de filesystem local       |
| `minio`             | MinIO SDK                           |

### UtilitÃ¡rios

| Biblioteca          | Papel                               |
|---------------------|-------------------------------------|
| `pino`              | Logger estruturado (JSON) de alta performance |
| `zod`               | ValidaÃ§Ã£o de schemas runtime        |
| `cron-parser`       | Parse e validaÃ§Ã£o de cron expressions |
| `date-fns-tz`       | ManipulaÃ§Ã£o de datas com suporte a timezones |
| `zlib`              | CompressÃ£o gzip (nativo Node.js)    |
| `@mongodb-js/zstd`  | CompressÃ£o Zstandard                |

---

## Diagrama de Relacionamentos do Banco

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚      datasources    â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚ id (PK)             â”‚â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ name                â”‚                                       â”‚
â”‚ type                â”‚                                       â”‚
â”‚ connection_config   â”‚                                       â”‚
â”‚ status              â”‚                                       â”‚
â”‚ enabled             â”‚                                       â”‚
â”‚ tags                â”‚                                       â”‚
â”‚ last_health_check_atâ”‚                                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                       â”‚
          â”‚ 1                                                 â”‚
          â”‚â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”            â”‚
          â”‚                                     â”‚            â”‚
          â–¼ N                                   â”‚            â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”        â”‚
â”‚    health_checks    â”‚         â”‚   backup_jobs    â”‚        â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚         â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚        â”‚
â”‚ id (PK)             â”‚         â”‚ id (PK)          â”‚        â”‚
â”‚ datasource_id (FK)â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚ datasource_id(FK)â”‚        â”‚
â”‚ checked_at          â”‚         â”‚ storage_loc_id(FK)â”‚       â”‚
â”‚ status              â”‚         â”‚ name             â”‚        â”‚
â”‚ latency_ms          â”‚         â”‚ schedule_cron    â”‚        â”‚
â”‚ error_message       â”‚         â”‚ enabled          â”‚        â”‚
â”‚ metadata            â”‚         â”‚ retention_policy â”‚        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜         â”‚ backup_options   â”‚        â”‚
                                â”‚ next_execution_atâ”‚        â”‚
                                â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜        â”‚
                                        â”‚ 1                 â”‚
                                        â”‚                   â”‚
                                        â–¼ N                 â”‚
                         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”       â”‚
                         â”‚    backup_executions      â”‚       â”‚
                         â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚       â”‚
                         â”‚ id (PK)                  â”‚       â”‚
                         â”‚ job_id (FK) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜       â”‚
                         â”‚ datasource_id (FK) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                         â”‚ storage_location_id (FK)
                         â”‚ status
                         â”‚ started_at / finished_at
                         â”‚ duration_seconds
                         â”‚ size_bytes
                         â”‚ compressed_size_bytes
                         â”‚ backup_path
                         â”‚ backup_type
                         â”‚ error_message / error_stack
                         â”‚ metadata
                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                        â”‚ 1
                                        â”‚
                                        â–¼ N
                         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                         â”‚      backup_chunks        â”‚
                         â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
                         â”‚ id (PK)                  â”‚
                         â”‚ execution_id (FK)        â”‚
                         â”‚ chunk_number             â”‚
                         â”‚ file_path                â”‚
                         â”‚ size_bytes               â”‚
                         â”‚ checksum                 â”‚
                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        storage_locations                            â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚ id (PK)  â”‚ name  â”‚ type  â”‚ config  â”‚ is_default  â”‚ available_space_gbâ”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
     â”‚ 1            referenciado por backup_jobs.storage_location_id
     â”‚              e backup_executions.storage_location_id

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                          notifications                              â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚ id  â”‚ type  â”‚ severity  â”‚ entity_type  â”‚ entity_id  â”‚ title        â”‚
â”‚ message  â”‚ metadata  â”‚ read_at  â”‚ created_at                       â”‚
â”‚                                                                    â”‚
â”‚ entity_id aponta para qualquer entidade (datasource, job, storage) â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                         system_settings                            â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚ key (PK)  â”‚ value (JSONB)  â”‚ description  â”‚ updated_at            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

