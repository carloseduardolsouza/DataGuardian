# 🎯 DataGuardian - Arquitetura Definitiva

## 📋 Visão Geral

Sistema **self-hosted open-source** de gerenciamento de backups de bancos de dados e arquivos.

- **Single-user**: Sem necessidade de autenticação complexa
- **Monolito**: API + Workers em um único processo Node.js
- **TypeScript**: Type-safety e melhor DX
- **Prisma ORM**: Migrations e type-safe queries
- **Docker**: Deploy simplificado via docker-compose

---

## 🗄️ Schema do Banco de Dados (PostgreSQL)

### **datasources**
Bancos de dados e sistemas de arquivos que serão backupeados.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Nome amigável (ex: "Banco Produção") |
| `type` | ENUM | `postgres`, `mysql`, `mongodb`, `sqlserver`, `sqlite`, `files` |
| `connection_config` | JSONB | Configuração de conexão (estrutura varia por tipo) |
| `status` | ENUM | `healthy`, `warning`, `critical`, `unknown` |
| `last_health_check_at` | TIMESTAMP | Última verificação de saúde |
| `enabled` | BOOLEAN | Se está ativo para backups |
| `tags` | TEXT[] | Array de tags (ex: ["produção", "crítico"]) |
| `created_at` | TIMESTAMP | Data de criação |
| `updated_at` | TIMESTAMP | Última atualização |

**Estrutura de `connection_config` por tipo:**

```typescript
// Postgres, MySQL, SQL Server, MongoDB
{
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl_enabled?: boolean;
}

// SQLite
{
  file_path: string;
}

// Files
{
  source_path: string;
  include_patterns?: string[];  // ["*.jpg", "*.png"]
  exclude_patterns?: string[];  // ["*.log", "temp/*"]
}
```

---

### **storage_locations**
Locais onde os backups serão salvos.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Nome amigável (ex: "NAS Empresa") |
| `type` | ENUM | `local`, `s3`, `ssh`, `minio`, `backblaze` |
| `config` | JSONB | Configuração específica do storage |
| `is_default` | BOOLEAN | Se é o storage padrão |
| `available_space_gb` | DECIMAL | Espaço disponível (atualizado periodicamente) |
| `status` | ENUM | `healthy`, `full`, `unreachable` |
| `created_at` | TIMESTAMP | Data de criação |
| `updated_at` | TIMESTAMP | Última atualização |

**Estrutura de `config` por tipo:**

```typescript
// Local
{
  path: string;              // "/var/backups"
  max_size_gb?: number;      // Alerta quando atingir limite
}

// SSH/SFTP
{
  host: string;
  port: number;              // Padrão 22
  username: string;
  password?: string;
  private_key?: string;      // Conteúdo da chave SSH
  remote_path: string;       // "/mnt/storage/backups"
}

// S3 (AWS/Wasabi)
{
  endpoint?: string;         // null para AWS padrão
  bucket: string;
  region: string;
  access_key_id: string;
  secret_access_key: string;
  storage_class?: string;    // "STANDARD_IA", "GLACIER"
}

// MinIO
{
  endpoint: string;          // "http://minio.local:9000"
  bucket: string;
  access_key: string;
  secret_key: string;
  use_ssl: boolean;
}

// Backblaze B2
{
  bucket_id: string;
  bucket_name: string;
  application_key_id: string;
  application_key: string;
}
```

---

### **backup_jobs**
Políticas de backup configuradas pelo usuário.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Nome do job (ex: "Backup Diário Produção") |
| `datasource_id` | UUID | FK → datasources.id |
| `storage_location_id` | UUID | FK → storage_locations.id |
| `schedule_cron` | VARCHAR(100) | Expressão cron (ex: "0 3 * * *") |
| `schedule_timezone` | VARCHAR(50) | Timezone (ex: "America/Sao_Paulo") |
| `enabled` | BOOLEAN | Se o job está ativo |
| `retention_policy` | JSONB | Regras de retenção |
| `backup_options` | JSONB | Opções específicas do backup |
| `last_execution_at` | TIMESTAMP | Última execução |
| `next_execution_at` | TIMESTAMP | Próxima execução calculada |
| `created_at` | TIMESTAMP | Data de criação |
| `updated_at` | TIMESTAMP | Última atualização |

**Estrutura de `retention_policy`:**

```typescript
{
  keep_daily: number;        // Manter backups diários por X dias
  keep_weekly: number;       // Manter backups semanais por X semanas
  keep_monthly: number;      // Manter backups mensais por X meses
  auto_delete: boolean;      // Deletar automaticamente backups antigos
}
```

**Estrutura de `backup_options`:**

```typescript
{
  compression: "gzip" | "zstd" | "lz4" | "none";
  compression_level?: number;       // 1-9 (gzip/zstd)
  parallel_jobs?: number;           // Para pg_dump -j
  exclude_tables?: string[];        // ["logs_*", "temp_*"]
  include_tables?: string[];        // [] = todas
  max_file_size_mb?: number;        // Dividir em chunks se maior
}
```

---

### **backup_executions**
Histórico de execuções de backup.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Primary key |
| `job_id` | UUID | FK → backup_jobs.id |
| `datasource_id` | UUID | FK → datasources.id |
| `storage_location_id` | UUID | FK → storage_locations.id |
| `status` | ENUM | `queued`, `running`, `completed`, `failed`, `cancelled` |
| `started_at` | TIMESTAMP | Início da execução |
| `finished_at` | TIMESTAMP | Fim da execução |
| `duration_seconds` | INTEGER | Duração total |
| `size_bytes` | BIGINT | Tamanho original dos dados |
| `compressed_size_bytes` | BIGINT | Tamanho após compressão |
| `backup_path` | TEXT | Caminho completo no storage |
| `backup_type` | ENUM | `full`, `incremental`, `differential` |
| `files_count` | INTEGER | Quantidade de arquivos (para backup de files) |
| `error_message` | TEXT | Mensagem de erro (se falhou) |
| `error_stack` | TEXT | Stack trace completo |
| `metadata` | JSONB | Informações adicionais |
| `created_at` | TIMESTAMP | Data de criação |

**Estrutura de `metadata`:**

```typescript
{
  database_version?: string;       // "PostgreSQL 16.1"
  tables_backed_up?: number;       // Quantidade de tabelas
  rows_approximate?: number;       // Estimativa de linhas
  compression_ratio?: number;      // 0.35 = 65% de compressão
  checksum?: string;               // SHA256 do arquivo final
  engine_output?: string;          // Saída do pg_dump/mysqldump
}
```

---

### **backup_chunks**
Para backups grandes divididos em múltiplos arquivos.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Primary key |
| `execution_id` | UUID | FK → backup_executions.id |
| `chunk_number` | INTEGER | Número sequencial do chunk (1, 2, 3...) |
| `file_path` | TEXT | Caminho do chunk no storage |
| `size_bytes` | BIGINT | Tamanho do chunk |
| `checksum` | VARCHAR(64) | SHA256 do chunk |
| `created_at` | TIMESTAMP | Data de criação |

**Unique constraint**: `(execution_id, chunk_number)`

---

### **health_checks**
Histórico de verificações de saúde das datasources.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Primary key |
| `datasource_id` | UUID | FK → datasources.id |
| `checked_at` | TIMESTAMP | Momento da verificação |
| `status` | ENUM | `ok`, `timeout`, `auth_failed`, `unreachable`, `error` |
| `latency_ms` | INTEGER | Tempo de resposta em ms |
| `error_message` | TEXT | Mensagem de erro (se houver) |
| `metadata` | JSONB | Informações adicionais |

**Estrutura de `metadata`:**

```typescript
{
  database_version?: string;
  server_uptime?: string;
  active_connections?: number;
  disk_usage_percent?: number;
}
```

**Index**: `(datasource_id, checked_at DESC)`

---

### **notifications**
Sistema de alertas e eventos do sistema.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Primary key |
| `type` | ENUM | `backup_failed`, `backup_success`, `connection_lost`, `storage_full`, `storage_unreachable`, `health_degraded` |
| `severity` | ENUM | `info`, `warning`, `critical` |
| `entity_type` | ENUM | `datasource`, `backup_job`, `storage_location`, `system` |
| `entity_id` | UUID | ID da entidade relacionada |
| `title` | VARCHAR(255) | Título curto do alerta |
| `message` | TEXT | Descrição detalhada |
| `metadata` | JSONB | Dados adicionais contextuais |
| `read_at` | TIMESTAMP | Quando foi marcado como lido |
| `created_at` | TIMESTAMP | Data de criação |

**Index**: `(created_at DESC, read_at)`

---

### **system_settings**
Configurações globais do sistema.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `key` | VARCHAR(100) | Primary key - nome da configuração |
| `value` | JSONB | Valor da configuração |
| `description` | TEXT | Descrição da configuração |
| `updated_at` | TIMESTAMP | Última atualização |

**Exemplos de `key`:**
- `notifications.email_enabled`
- `notifications.email_smtp_config`
- `notifications.webhook_url`
- `system.max_concurrent_backups`
- `system.temp_directory`

---

## 📊 Relacionamentos

```
datasources (1) ──< (N) backup_jobs
datasources (1) ──< (N) health_checks
datasources (1) ──< (N) backup_executions

storage_locations (1) ──< (N) backup_jobs
storage_locations (1) ──< (N) backup_executions

backup_jobs (1) ──< (N) backup_executions

backup_executions (1) ──< (N) backup_chunks
backup_executions (1) ──< (N) notifications (via entity_id)

datasources (1) ──< (N) notifications (via entity_id)
backup_jobs (1) ──< (N) notifications (via entity_id)
storage_locations (1) ──< (N) notifications (via entity_id)
```

---

## 📁 Estrutura de Diretórios

```
backup-manager/
│
├── prisma/
│   ├── schema.prisma              # Schema do Prisma
│   ├── migrations/                # Migrations automáticas
│   └── seed.ts                    # Dados iniciais (opcional)
│
├── interface/                     # interface em react
│
├── src/
│   │
│   ├── api/                       # Express REST API
│   │   ├── routes/
│   │   │   ├── datasources.ts     # CRUD datasources
│   │   │   ├── storage-locations.ts
│   │   │   ├── backup-jobs.ts
│   │   │   ├── executions.ts
│   │   │   ├── health.ts
│   │   │   ├── notifications.ts
│   │   │   └── system.ts
│   │   │
│   │   ├── middlewares/
│   │   │   ├── error-handler.ts
│   │   │   ├── validation.ts
│   │   │   └── logger.ts
│   │   │
│   │   └── server.ts              # Express app
│   │
│   ├── core/                      # Lógica de negócio
│   │   │
│   │   ├── backup/
│   │   │   ├── engines/           # Implementações por tipo de DB
│   │   │   │   ├── base-engine.ts
│   │   │   │   ├── postgres-engine.ts
│   │   │   │   ├── mysql-engine.ts
│   │   │   │   ├── mongodb-engine.ts
│   │   │   │   ├── sqlserver-engine.ts
│   │   │   │   ├── sqlite-engine.ts
│   │   │   │   └── files-engine.ts
│   │   │   │
│   │   │   ├── executor.ts        # Orquestrador de backup
│   │   │   └── compressor.ts      # Gzip, zstd, lz4
│   │   │
│   │   ├── storage/               # Abstração de storage
│   │   │   ├── adapters/
│   │   │   │   ├── base-adapter.ts
│   │   │   │   ├── local-adapter.ts
│   │   │   │   ├── s3-adapter.ts
│   │   │   │   ├── ssh-adapter.ts
│   │   │   │   ├── minio-adapter.ts
│   │   │   │   └── backblaze-adapter.ts
│   │   │   │
│   │   │   └── storage-factory.ts # Factory pattern
│   │   │
│   │   ├── scheduler/
│   │   │   ├── cron-parser.ts     # Parse cron expressions
│   │   │   └── job-scheduler.ts   # Calcula próximas execuções
│   │   │
│   │   ├── retention/
│   │   │   └── cleanup-manager.ts # GFS retention policy
│   │   │
│   │   └── health/
│   │       └── health-checker.ts  # Testa conexões
│   │
│   ├── workers/                   # Background jobs
│   │   ├── backup-worker.ts       # Processa backups
│   │   ├── health-worker.ts       # Health checks periódicos
│   │   ├── scheduler-worker.ts    # Agenda backups
│   │   └── cleanup-worker.ts      # Deleta backups antigos
│   │
│   ├── queue/                     # BullMQ setup
│   │   ├── queues.ts              # Definição das filas
│   │   └── redis-client.ts        # Conexão Redis
│   │
│   ├── utils/
│   │   ├── logger.ts              # Pino logger
│   │   ├── config.ts              # Configurações (env vars)
│   │   └── notifications.ts       # Email/Webhook sender
│   │
│   ├── types/
│   │   ├── datasource.types.ts
│   │   ├── storage.types.ts
│   │   └── backup.types.ts
│   │
│   └── index.ts                   # Entry point (inicia API + Workers)
│
├── config/
│   ├── default.json               # Configs padrão
│   └── production.json            # Configs de produção
│   └── development.json           # Configs de desenvolvimento
│
├── docker/
│   ├── Dockerfile                 # Build da aplicação
│   └── docker-compose.yml         # Stack completa
│
├── tests/
│   ├── unit/
│   │   ├── engines/
│   │   ├── storage/
│   │   └── retention/
│   │
│   └── integration/
│       ├── api/
│       └── workers/
│
├── docs/
│   ├── API.md                     # Documentação da API REST
│   ├── STORAGE.md                 # Guia de storages suportados
│   ├── DEPLOYMENT.md              # Deploy com Docker
│   └── DEVELOPMENT.md             # Setup de dev
│
├── .env.example                   # Template de variáveis
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

---

## 🐳 Docker Compose

```yaml
version: '3.8'

services:
  # Banco de metadados
  postgres:
    image: postgres:16-alpine
    container_name: backup-manager-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: backup_manager
      POSTGRES_USER: backup
      POSTGRES_PASSWORD: ${DB_PASSWORD:-backup123}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U backup"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis para filas
  redis:
    image: redis:7-alpine
    container_name: backup-manager-redis
    restart: unless-stopped
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # Aplicação (API + Workers)
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
    container_name: backup-manager-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      # Volume para backups locais
      - backup-storage:/var/backups
      # Volume para configs persistentes
      - ./config:/app/config:ro
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://backup:${DB_PASSWORD:-backup123}@postgres:5432/backup_manager
      REDIS_URL: redis://redis:6379
      PORT: 3000
      LOG_LEVEL: info
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres-data:
    driver: local
  redis-data:
    driver: local
  backup-storage:
    driver: local
```

---

## 🔄 Fluxo de Execução

### **1. Inicialização do Sistema**

```
docker-compose up -d
    ↓
Container "app" inicia
    ↓
src/index.ts executa:
    1. Conecta no PostgreSQL (Prisma)
    2. Roda migrations pendentes
    3. Conecta no Redis (BullMQ)
    4. Inicia Express API (porta 3000)
    5. Inicia Workers em background:
       - SchedulerWorker (verifica jobs a cada 1 min)
       - HealthWorker (health checks a cada 5 min)
       - BackupWorker (processa fila de backups)
       - CleanupWorker (roda 1x por dia às 4h)
    ↓
Sistema pronto! 🚀
```

---

### **2. Usuário Configura Datasource**

```
Interface Web → POST /api/datasources
    ↓
Body: {
  name: "Banco Produção",
  type: "postgres",
  connection_config: {
    host: "db.empresa.local",
    port: 5432,
    database: "app_prod",
    username: "backup_user",
    password: "senhasegura"
  },
  tags: ["produção", "crítico"]
}
    ↓
API valida dados
    ↓
Testa conexão (SELECT 1)
    ✅ Sucesso → Salva no banco
    ❌ Falha → Retorna erro 400
    ↓
Agenda primeiro health check (em 5 min)
    ↓
Retorna: { id: "uuid", status: "healthy", ... }
```

---

### **3. Usuário Configura Storage Location**

```
Interface Web → POST /api/storage-locations
    ↓
Body: {
  name: "NAS Empresa",
  type: "ssh",
  config: {
    host: "nas.empresa.local",
    port: 22,
    username: "backup",
    private_key: "-----BEGIN RSA PRIVATE KEY-----\n...",
    remote_path: "/mnt/storage/backups"
  }
}
    ↓
API valida dados
    ↓
Testa conexão SSH
    ✅ Sucesso → Verifica espaço disponível
    ❌ Falha → Retorna erro 400
    ↓
Salva no banco
    ↓
Retorna: { id: "uuid", available_space_gb: 450, ... }
```

---

### **4. Usuário Cria Backup Job**

```
Interface Web → POST /api/backup-jobs
    ↓
Body: {
  name: "Backup Diário Produção",
  datasource_id: "uuid-datasource",
  storage_location_id: "uuid-storage",
  schedule_cron: "0 3 * * *",
  schedule_timezone: "America/Sao_Paulo",
  retention_policy: {
    keep_daily: 7,
    keep_weekly: 4,
    keep_monthly: 12,
    auto_delete: true
  },
  backup_options: {
    compression: "gzip",
    compression_level: 6,
    parallel_jobs: 4,
    exclude_tables: ["logs_*", "temp_*"]
  }
}
    ↓
API valida cron expression
    ↓
Calcula next_execution_at (próximo 3h da manhã)
    ↓
Salva no banco
    ↓
SchedulerWorker detecta na próxima verificação
    ↓
Retorna: { id: "uuid", next_execution_at: "2025-02-13T06:00:00Z", ... }
```

---

### **5. Execução do Backup (Agendado)**

```
SchedulerWorker (roda a cada 1 min)
    ↓
SELECT jobs WHERE enabled = true
    ↓
Para cada job:
    Agora >= next_execution_at?
    SIM →
        1. Cria registro em backup_executions (status: queued)
        2. Adiciona job na fila Redis (backup-queue)
        3. Atualiza next_execution_at do job
    ↓
BackupWorker (consumer da fila)
    ↓
Pega job da fila
    ↓
1. Atualiza execution (status: running, started_at)
2. Busca datasource e storage_location
3. Seleciona engine correto (PostgresEngine)
4. Cria stream de backup:
   
   PostgresEngine.backup()
       ↓
   pg_dump --host=... --format=custom | gzip
       ↓
   Stream de dados
       ↓
   Compressor (gzip level 6)
       ↓
   Chunker (se > max_file_size_mb)
       ↓
   StorageAdapter.upload()
       ↓
   SSH: rsync/sftp para NAS
   
5. Calcula checksum (SHA256)
6. Atualiza execution:
   - status: completed
   - finished_at
   - size_bytes, compressed_size_bytes
   - backup_path
   - metadata (compression_ratio, etc)
    ↓
Sucesso! ✅
```

---

### **6. Health Check Contínuo**

```
HealthWorker (a cada 5 min)
    ↓
SELECT datasources WHERE enabled = true
    ↓
Para cada datasource:
    1. Conecta no banco
    2. Executa: SELECT 1
    3. Mede latência
    4. Busca metadados (version, uptime)
    5. Salva em health_checks
    6. Atualiza datasource.status
    
    Se falhou 3x consecutivas:
        - Cria notification (type: connection_lost, severity: critical)
        - Envia alerta (email/webhook se configurado)
    
    Se voltou após falha:
        - Cria notification (type: connection_restored, severity: info)
```

---

### **7. Cleanup de Backups Antigos**

```
CleanupWorker (1x por dia às 4h)
    ↓
SELECT jobs WHERE retention_policy.auto_delete = true
    ↓
Para cada job:
    1. Lista executions desse job (ORDER BY created_at DESC)
    2. Aplica regras GFS:
       
       Últimos 7 dias → mantém todos (daily)
       Últimos 28 dias → mantém apenas domingos (weekly)
       Último ano → mantém apenas dia 1 (monthly)
       
    3. Marca executions para deletar
    4. Para cada execution:
       - StorageAdapter.delete(backup_path)
       - DELETE FROM backup_chunks
       - DELETE FROM backup_executions
    5. Loga estatísticas:
       - X backups deletados
       - Y GB liberados
    ↓
Cria notification (type: cleanup_completed, severity: info)
```

---

## 🛠️ Tecnologias e Bibliotecas

### **Core**
- **Node.js** 20+
- **TypeScript** 5.x
- **Prisma ORM** 5.x
- **Express** 4.x
- **BullMQ** 5.x (filas com Redis)
- **Redis** 7.x

### **Backup Engines**
- `pg` - PostgreSQL client
- `mysql2` - MySQL/MariaDB client
- `mongodb` - MongoDB driver
- `mssql` - SQL Server client
- `better-sqlite3` - SQLite client

### **Storage Adapters**
- `@aws-sdk/client-s3` - AWS S3
- `ssh2` - SSH/SFTP
- `fs-extra` - Local filesystem
- `tar-stream` - Criação de tarballs

### **Compressão**
- `zlib` (nativo) - Gzip
- `@mongodb-js/zstd` - Zstandard
- `lz4` - LZ4

### **Utilitários**
- `pino` - Logging estruturado
- `cron-parser` - Parse de cron expressions
- `zod` - Validação de schemas
- `date-fns-tz` - Manipulação de datas com timezone

---

## 🎯 Próximos Passos

Com essa arquitetura definida, podemos começar a implementação na seguinte ordem:

1. **Setup inicial**
   - Inicializar projeto TypeScript
   - Configurar Prisma + migrations
   - Setup Docker Compose

2. **Core básico**
   - Interface base dos Storage Adapters
   - Interface base dos Backup Engines
   - LocalStorage + PostgresEngine (MVP)

3. **API REST**
   - CRUD de datasources
   - CRUD de storage locations
   - CRUD de backup jobs

4. **Workers**
   - BackupWorker (processa backups)
   - SchedulerWorker (agenda jobs)

5. **Expansão**
   - Mais engines (MySQL, MongoDB, Files)
   - Mais storages (S3, SSH, MinIO)
   - HealthWorker + CleanupWorker

---

**Pronto para começar?** 🚀
