# Database Schema — DataGuardian

Referência completa do schema do banco de dados PostgreSQL utilizado pelo DataGuardian para persistência de metadados.

> **Importante:** O banco de dados **não armazena os arquivos de backup**, apenas os metadados (jobs, configurações, histórico de execuções). Os arquivos de backup são gravados nos storage locations configurados (local, S3, SSH, etc.).

## Índice

- [Visão Geral](#visão-geral)
- [Enums](#enums)
- [Tabelas](#tabelas)
  - [datasources](#datasources)
  - [storage_locations](#storage_locations)
  - [backup_jobs](#backup_jobs)
  - [backup_executions](#backup_executions)
  - [backup_chunks](#backup_chunks)
  - [health_checks](#health_checks)
  - [notifications](#notifications)
  - [system_settings](#system_settings)
- [Índices](#índices)
- [Convenções](#convenções)
- [Queries Úteis](#queries-úteis)

---

## Visão Geral

```
8 tabelas principais:

datasources          → bancos e sistemas de arquivos a backupear
storage_locations    → destinos dos arquivos de backup
backup_jobs          → políticas de backup (o quê + onde + quando + retenção)
backup_executions    → histórico de cada execução de backup
backup_chunks        → partes de um backup dividido em múltiplos arquivos
health_checks        → histórico de verificações de saúde dos datasources
notifications        → alertas e eventos do sistema
system_settings      → configurações globais (chave → valor JSONB)
```

---

## Enums

### `DatasourceType`

```sql
CREATE TYPE datasource_type AS ENUM (
  'postgres',
  'mysql',
  'mongodb',
  'sqlserver',
  'sqlite',
  'files'
);
```

| Valor        | Ferramenta de dump utilizada |
|--------------|------------------------------|
| `postgres`   | `pg_dump`                    |
| `mysql`      | `mysqldump`                  |
| `mongodb`    | `mongodump`                  |
| `sqlserver`  | `sqlpackage` / `bcp`         |
| `sqlite`     | Cópia direta do arquivo      |
| `files`      | `tar` com padrões glob       |

---

### `DatasourceStatus`

```sql
CREATE TYPE datasource_status AS ENUM (
  'healthy',    -- Última verificação bem-sucedida
  'warning',    -- Latência elevada ou métrica degradada
  'critical',   -- Falhou na última verificação
  'unknown'     -- Nunca foi verificado ainda
);
```

---

### `StorageLocationType`

```sql
CREATE TYPE storage_location_type AS ENUM (
  'local',
  's3',
  'ssh',
  'minio',
  'backblaze'
);
```

---

### `StorageLocationStatus`

```sql
CREATE TYPE storage_location_status AS ENUM (
  'healthy',      -- Acessível e com espaço disponível
  'full',         -- Sem espaço disponível
  'unreachable'   -- Inacessível
);
```

---

### `ExecutionStatus`

```sql
CREATE TYPE execution_status AS ENUM (
  'queued',     -- Na fila aguardando um worker
  'running',    -- Em execução ativa
  'completed',  -- Concluído com sucesso
  'failed',     -- Falhou com erro
  'cancelled'   -- Cancelado manualmente
);
```

---

### `BackupType`

```sql
CREATE TYPE backup_type AS ENUM (
  'full',          -- Backup completo de todos os dados
  'incremental',   -- Apenas alterações desde o último backup (futuro)
  'differential'   -- Alterações desde o último full (futuro)
);
```

> Na versão atual apenas `full` é suportado. Os demais valores são reservados para futuras implementações.

---

### `HealthCheckStatus`

```sql
CREATE TYPE health_check_status AS ENUM (
  'ok',           -- Conexão bem-sucedida
  'timeout',      -- Conexão expirou
  'auth_failed',  -- Falha de autenticação
  'unreachable',  -- Host inacessível
  'error'         -- Outro tipo de erro
);
```

---

### `NotificationType`

```sql
CREATE TYPE notification_type AS ENUM (
  'backup_success',
  'backup_failed',
  'connection_lost',
  'connection_restored',
  'storage_full',
  'storage_unreachable',
  'health_degraded',
  'cleanup_completed'
);
```

---

### `NotificationSeverity`

```sql
CREATE TYPE notification_severity AS ENUM (
  'info',      -- Informação geral
  'warning',   -- Atenção recomendada
  'critical'   -- Ação imediata necessária
);
```

---

### `NotificationEntityType`

```sql
CREATE TYPE notification_entity_type AS ENUM (
  'datasource',
  'backup_job',
  'storage_location',
  'system'
);
```

---

## Tabelas

### `datasources`

Registra os bancos de dados e sistemas de arquivos que serão alvo dos backups.

```sql
CREATE TABLE datasources (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(255)  NOT NULL,
  type                  datasource_type NOT NULL,
  connection_config     JSONB         NOT NULL,
  status                datasource_status NOT NULL DEFAULT 'unknown',
  last_health_check_at  TIMESTAMPTZ   NULL,
  enabled               BOOLEAN       NOT NULL DEFAULT true,
  tags                  TEXT[]        NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

#### Campos

| Campo                  | Tipo            | Nulável | Padrão    | Descrição                              |
|------------------------|-----------------|---------|-----------|----------------------------------------|
| `id`                   | UUID            | não     | auto      | Identificador único                    |
| `name`                 | VARCHAR(255)    | não     | —         | Nome amigável (ex: "Banco Produção")   |
| `type`                 | DatasourceType  | não     | —         | Tipo do sistema de origem              |
| `connection_config`    | JSONB           | não     | —         | Configuração de conexão (ver abaixo)   |
| `status`               | DatasourceStatus| não     | `unknown` | Status atual de saúde                  |
| `last_health_check_at` | TIMESTAMPTZ     | sim     | `NULL`    | Timestamp do último health check       |
| `enabled`              | BOOLEAN         | não     | `true`    | Se está ativo para backups             |
| `tags`                 | TEXT[]          | não     | `{}`      | Array de tags para categorização       |
| `created_at`           | TIMESTAMPTZ     | não     | `NOW()`   | Data de criação                        |
| `updated_at`           | TIMESTAMPTZ     | não     | `NOW()`   | Última atualização                     |

#### Estrutura de `connection_config`

**Para `postgres`, `mysql`, `sqlserver`, `mongodb`:**

```json
{
  "host": "db.empresa.local",
  "port": 5432,
  "database": "app_prod",
  "username": "backup_user",
  "password": "senha_criptografada",
  "ssl_enabled": false
}
```

**Para `sqlite`:**

```json
{
  "file_path": "/var/data/app.db"
}
```

**Para `files`:**

```json
{
  "source_path": "/var/www/uploads",
  "include_patterns": ["*.jpg", "*.png", "*.pdf"],
  "exclude_patterns": ["*.log", "temp/*"]
}
```

> **Segurança:** Senhas são criptografadas antes de serem armazenadas no campo `connection_config`. A chave de criptografia é derivada da variável de ambiente `SECRET_KEY`.

---

### `storage_locations`

Registra os destinos onde os arquivos de backup serão armazenados.

```sql
CREATE TABLE storage_locations (
  id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(255)            NOT NULL,
  type                storage_location_type   NOT NULL,
  config              JSONB                   NOT NULL,
  is_default          BOOLEAN                 NOT NULL DEFAULT false,
  available_space_gb  DECIMAL(10, 2)          NULL,
  status              storage_location_status NOT NULL DEFAULT 'healthy',
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);
```

#### Campos

| Campo               | Tipo                  | Nulável | Padrão    | Descrição                              |
|---------------------|-----------------------|---------|-----------|----------------------------------------|
| `id`                | UUID                  | não     | auto      | Identificador único                    |
| `name`              | VARCHAR(255)          | não     | —         | Nome amigável                          |
| `type`              | StorageLocationType   | não     | —         | Tipo do storage                        |
| `config`            | JSONB                 | não     | —         | Configuração específica do storage     |
| `is_default`        | BOOLEAN               | não     | `false`   | Se é o storage padrão do sistema       |
| `available_space_gb`| DECIMAL(10,2)         | sim     | `NULL`    | Espaço disponível (atualizado periodicamente)|
| `status`            | StorageLocationStatus | não     | `healthy` | Status atual                           |
| `created_at`        | TIMESTAMPTZ           | não     | `NOW()`   | Data de criação                        |
| `updated_at`        | TIMESTAMPTZ           | não     | `NOW()`   | Última atualização                     |

> Somente um storage pode ter `is_default = true`. Ao definir um como padrão, os demais são atualizados para `false` automaticamente via trigger ou lógica de aplicação.

---

### `backup_jobs`

Define as políticas de backup: qual datasource, qual storage, quando executar e como reter.

```sql
CREATE TABLE backup_jobs (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(255) NOT NULL,
  datasource_id        UUID         NOT NULL REFERENCES datasources(id),
  storage_location_id  UUID         NOT NULL REFERENCES storage_locations(id),
  schedule_cron        VARCHAR(100) NOT NULL,
  schedule_timezone    VARCHAR(50)  NOT NULL DEFAULT 'UTC',
  enabled              BOOLEAN      NOT NULL DEFAULT true,
  retention_policy     JSONB        NOT NULL,
  backup_options       JSONB        NOT NULL,
  last_execution_at    TIMESTAMPTZ  NULL,
  next_execution_at    TIMESTAMPTZ  NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

#### Campos

| Campo                | Tipo        | Nulável | Padrão  | Descrição                              |
|----------------------|-------------|---------|---------|----------------------------------------|
| `id`                 | UUID        | não     | auto    | Identificador único                    |
| `name`               | VARCHAR(255)| não     | —       | Nome do job                            |
| `datasource_id`      | UUID (FK)   | não     | —       | Datasource de origem                   |
| `storage_location_id`| UUID (FK)   | não     | —       | Storage de destino                     |
| `schedule_cron`      | VARCHAR(100)| não     | —       | Expressão cron (5 campos)              |
| `schedule_timezone`  | VARCHAR(50) | não     | `UTC`   | Timezone para interpretar o cron       |
| `enabled`            | BOOLEAN     | não     | `true`  | Se o job está ativo                    |
| `retention_policy`   | JSONB       | não     | —       | Regras de retenção GFS                 |
| `backup_options`     | JSONB       | não     | —       | Opções de compressão, paralelismo, etc.|
| `last_execution_at`  | TIMESTAMPTZ | sim     | `NULL`  | Timestamp da última execução           |
| `next_execution_at`  | TIMESTAMPTZ | sim     | `NULL`  | Próxima execução calculada             |
| `created_at`         | TIMESTAMPTZ | não     | `NOW()` | Data de criação                        |
| `updated_at`         | TIMESTAMPTZ | não     | `NOW()` | Última atualização                     |

#### Estrutura de `retention_policy`

```json
{
  "keep_daily": 7,
  "keep_weekly": 4,
  "keep_monthly": 12,
  "auto_delete": true
}
```

| Campo          | Tipo    | Descrição                                              |
|----------------|---------|--------------------------------------------------------|
| `keep_daily`   | integer | Manter todos os backups dos últimos X dias             |
| `keep_weekly`  | integer | Manter o backup de domingo das últimas X semanas       |
| `keep_monthly` | integer | Manter o backup do dia 1 dos últimos X meses           |
| `auto_delete`  | boolean | Se `true`, o CleanupWorker deleta os backups expirados |

#### Estrutura de `backup_options`

```json
{
  "compression": "gzip",
  "compression_level": 6,
  "parallel_jobs": 4,
  "exclude_tables": ["logs_*", "temp_*"],
  "include_tables": [],
  "max_file_size_mb": 2048
}
```

| Campo               | Tipo     | Obrigatório | Descrição                                      |
|---------------------|----------|-------------|------------------------------------------------|
| `compression`       | string   | sim         | `gzip`, `zstd`, `lz4` ou `none`               |
| `compression_level` | integer  | não         | Nível 1–9 (para gzip/zstd). Padrão: 6         |
| `parallel_jobs`     | integer  | não         | Threads paralelas (ex: `pg_dump -j N`)         |
| `exclude_tables`    | string[] | não         | Tabelas/padrões a excluir do backup            |
| `include_tables`    | string[] | não         | Tabelas/padrões a incluir (`[]` = todas)       |
| `max_file_size_mb`  | integer  | não         | Divide em chunks se exceder este limite        |

---

### `backup_executions`

Histórico completo de cada execução de backup, bem-sucedida ou não.

```sql
CREATE TABLE backup_executions (
  id                      UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                  UUID             NOT NULL REFERENCES backup_jobs(id),
  datasource_id           UUID             NOT NULL REFERENCES datasources(id),
  storage_location_id     UUID             NOT NULL REFERENCES storage_locations(id),
  status                  execution_status NOT NULL DEFAULT 'queued',
  started_at              TIMESTAMPTZ      NULL,
  finished_at             TIMESTAMPTZ      NULL,
  duration_seconds        INTEGER          NULL,
  size_bytes              BIGINT           NULL,
  compressed_size_bytes   BIGINT           NULL,
  backup_path             TEXT             NULL,
  backup_type             backup_type      NOT NULL DEFAULT 'full',
  files_count             INTEGER          NULL,
  error_message           TEXT             NULL,
  error_stack             TEXT             NULL,
  metadata                JSONB            NULL,
  created_at              TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
```

#### Campos

| Campo                   | Tipo            | Nulável | Padrão    | Descrição                                |
|-------------------------|-----------------|---------|-----------|------------------------------------------|
| `id`                    | UUID            | não     | auto      | Identificador único                      |
| `job_id`                | UUID (FK)       | não     | —         | Job que gerou esta execução              |
| `datasource_id`         | UUID (FK)       | não     | —         | Snapshot do datasource no momento        |
| `storage_location_id`   | UUID (FK)       | não     | —         | Snapshot do storage no momento           |
| `status`                | ExecutionStatus | não     | `queued`  | Status atual da execução                 |
| `started_at`            | TIMESTAMPTZ     | sim     | `NULL`    | Quando o worker começou a processar      |
| `finished_at`           | TIMESTAMPTZ     | sim     | `NULL`    | Quando terminou (sucesso ou falha)       |
| `duration_seconds`      | INTEGER         | sim     | `NULL`    | Duração total em segundos                |
| `size_bytes`            | BIGINT          | sim     | `NULL`    | Tamanho original dos dados               |
| `compressed_size_bytes` | BIGINT          | sim     | `NULL`    | Tamanho após compressão                  |
| `backup_path`           | TEXT            | sim     | `NULL`    | Caminho no storage (pode ser prefixo se chunked) |
| `backup_type`           | BackupType      | não     | `full`    | Tipo do backup                           |
| `files_count`           | INTEGER         | sim     | `NULL`    | Qtd. de arquivos (apenas para tipo `files`) |
| `error_message`         | TEXT            | sim     | `NULL`    | Mensagem de erro em caso de falha        |
| `error_stack`           | TEXT            | sim     | `NULL`    | Stack trace completo                     |
| `metadata`              | JSONB           | sim     | `NULL`    | Metadados adicionais                     |
| `created_at`            | TIMESTAMPTZ     | não     | `NOW()`   | Quando foi enfileirado                   |

#### Estrutura de `metadata`

```json
{
  "database_version": "PostgreSQL 16.1",
  "tables_backed_up": 48,
  "rows_approximate": 12500000,
  "compression_ratio": 0.35,
  "checksum": "sha256:a3f1b2c4d5e6...",
  "engine_output": "pg_dump: warning: there are circular..."
}
```

| Campo               | Tipo    | Descrição                                         |
|---------------------|---------|---------------------------------------------------|
| `database_version`  | string  | Versão do banco de dados no momento do backup     |
| `tables_backed_up`  | integer | Quantidade de tabelas incluídas no backup         |
| `rows_approximate`  | integer | Estimativa de linhas (via pg_stat_user_tables)    |
| `compression_ratio` | number  | Taxa de compressão (0.35 = arquivo com 35% do original) |
| `checksum`          | string  | SHA-256 do arquivo de backup final                |
| `engine_output`     | string  | Saída do stderr do processo de dump               |

---

### `backup_chunks`

Quando um backup excede o tamanho máximo configurado (`max_file_size_mb`), ele é dividido em múltiplos chunks. Esta tabela registra cada parte.

```sql
CREATE TABLE backup_chunks (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id  UUID    NOT NULL REFERENCES backup_executions(id) ON DELETE CASCADE,
  chunk_number  INTEGER NOT NULL,
  file_path     TEXT    NOT NULL,
  size_bytes    BIGINT  NOT NULL,
  checksum      VARCHAR(64) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (execution_id, chunk_number)
);
```

#### Campos

| Campo          | Tipo        | Nulável | Padrão  | Descrição                              |
|----------------|-------------|---------|---------|----------------------------------------|
| `id`           | UUID        | não     | auto    | Identificador único                    |
| `execution_id` | UUID (FK)   | não     | —       | Execução à qual este chunk pertence    |
| `chunk_number` | INTEGER     | não     | —       | Número sequencial (1, 2, 3...)         |
| `file_path`    | TEXT        | não     | —       | Caminho do chunk no storage            |
| `size_bytes`   | BIGINT      | não     | —       | Tamanho deste chunk                    |
| `checksum`     | VARCHAR(64) | não     | —       | SHA-256 deste chunk                    |
| `created_at`   | TIMESTAMPTZ | não     | `NOW()` | Data de criação                        |

> A constraint `UNIQUE (execution_id, chunk_number)` garante que não existam dois chunks com o mesmo número para a mesma execução.

> `ON DELETE CASCADE` garante que ao deletar uma execução, seus chunks são removidos automaticamente do banco (o arquivo físico deve ser removido pelo CleanupWorker antes).

---

### `health_checks`

Histórico de verificações de saúde dos datasources.

```sql
CREATE TABLE health_checks (
  id             UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  datasource_id  UUID                NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  checked_at     TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  status         health_check_status NOT NULL,
  latency_ms     INTEGER             NULL,
  error_message  TEXT                NULL,
  metadata       JSONB               NULL
);

CREATE INDEX idx_health_checks_datasource_date
  ON health_checks (datasource_id, checked_at DESC);
```

#### Campos

| Campo          | Tipo               | Nulável | Padrão  | Descrição                              |
|----------------|--------------------|---------|---------|----------------------------------------|
| `id`           | UUID               | não     | auto    | Identificador único                    |
| `datasource_id`| UUID (FK)          | não     | —       | Datasource verificado                  |
| `checked_at`   | TIMESTAMPTZ        | não     | `NOW()` | Momento da verificação                 |
| `status`       | HealthCheckStatus  | não     | —       | Resultado da verificação               |
| `latency_ms`   | INTEGER            | sim     | `NULL`  | Tempo de resposta em milissegundos     |
| `error_message`| TEXT               | sim     | `NULL`  | Mensagem de erro (se falhou)           |
| `metadata`     | JSONB              | sim     | `NULL`  | Metadados do servidor                  |

#### Estrutura de `metadata`

```json
{
  "database_version": "PostgreSQL 16.1",
  "server_uptime": "15 days 4:23:10",
  "active_connections": 8,
  "disk_usage_percent": 45.2
}
```

> O índice `(datasource_id, checked_at DESC)` é essencial para a query do HealthWorker que busca o histórico recente por datasource.

---

### `notifications`

Alertas e eventos gerados pelo sistema. Funcionam como uma caixa de entrada interna.

```sql
CREATE TABLE notifications (
  id           UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  type         notification_type         NOT NULL,
  severity     notification_severity     NOT NULL,
  entity_type  notification_entity_type  NOT NULL,
  entity_id    UUID                      NOT NULL,
  title        VARCHAR(255)              NOT NULL,
  message      TEXT                      NOT NULL,
  metadata     JSONB                     NULL,
  read_at      TIMESTAMPTZ               NULL,
  created_at   TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_created_read
  ON notifications (created_at DESC, read_at);
```

#### Campos

| Campo        | Tipo                    | Nulável | Padrão  | Descrição                              |
|--------------|-------------------------|---------|---------|----------------------------------------|
| `id`         | UUID                    | não     | auto    | Identificador único                    |
| `type`       | NotificationType        | não     | —       | Tipo do evento                         |
| `severity`   | NotificationSeverity    | não     | —       | Severidade: `info`, `warning`, `critical` |
| `entity_type`| NotificationEntityType  | não     | —       | Tipo da entidade relacionada           |
| `entity_id`  | UUID                    | não     | —       | ID da entidade relacionada             |
| `title`      | VARCHAR(255)            | não     | —       | Título curto do alerta                 |
| `message`    | TEXT                    | não     | —       | Descrição detalhada                    |
| `metadata`   | JSONB                   | sim     | `NULL`  | Dados contextuais adicionais           |
| `read_at`    | TIMESTAMPTZ             | sim     | `NULL`  | Quando foi marcado como lido (NULL = não lido) |
| `created_at` | TIMESTAMPTZ             | não     | `NOW()` | Data de criação                        |

> `entity_id` é uma foreign key "polimórfica" — aponta para `datasources.id`, `backup_jobs.id` ou `storage_locations.id` dependendo do `entity_type`. Não há constraint de FK explícita por ser polimórfica.

---

### `system_settings`

Configurações globais do sistema armazenadas como pares chave-valor JSONB.

```sql
CREATE TABLE system_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB        NOT NULL,
  description TEXT         NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

#### Campos

| Campo         | Tipo        | Nulável | Padrão  | Descrição                              |
|---------------|-------------|---------|---------|----------------------------------------|
| `key`         | VARCHAR(100)| não     | —       | Nome da configuração (PK)              |
| `value`       | JSONB       | não     | —       | Valor (qualquer tipo JSON)             |
| `description` | TEXT        | sim     | `NULL`  | Descrição da configuração              |
| `updated_at`  | TIMESTAMPTZ | não     | `NOW()` | Última atualização                     |

#### Configurações Padrão

| Chave                            | Tipo    | Padrão  | Descrição                            |
|----------------------------------|---------|---------|--------------------------------------|
| `notifications.email_enabled`    | boolean | `false` | Habilitar alertas por e-mail         |
| `notifications.email_smtp_config`| object  | `{}`    | Configuração do servidor SMTP        |
| `notifications.webhook_url`      | string  | `null`  | URL do webhook (Slack, Discord, etc.)|
| `system.max_concurrent_backups`  | integer | `3`     | Máximo de backups simultâneos        |
| `system.temp_directory`          | string  | `/tmp/dataguardian` | Diretório temporário   |
| `system.health_check_interval_ms`| integer | `300000`| Intervalo dos health checks (ms)     |
| `system.scheduler_interval_ms`   | integer | `60000` | Intervalo do scheduler (ms)          |

---

## Índices

```sql
-- Health Checks: busca por datasource ordenado por data
CREATE INDEX idx_health_checks_datasource_date
  ON health_checks (datasource_id, checked_at DESC);

-- Notifications: listagem padrão (mais recentes, não lidas primeiro)
CREATE INDEX idx_notifications_created_read
  ON notifications (created_at DESC, read_at);

-- Backup Executions: busca por job
CREATE INDEX idx_backup_executions_job_id
  ON backup_executions (job_id, created_at DESC);

-- Backup Executions: busca por status (fila de jobs pendentes)
CREATE INDEX idx_backup_executions_status
  ON backup_executions (status)
  WHERE status IN ('queued', 'running');

-- Backup Jobs: scheduler precisa buscar jobs habilitados por data
CREATE INDEX idx_backup_jobs_next_execution
  ON backup_jobs (next_execution_at)
  WHERE enabled = true;

-- Datasources: busca por tags
CREATE INDEX idx_datasources_tags
  ON datasources USING GIN (tags);
```

---

## Convenções

### UUIDs como Primary Key

Todos os registros usam UUID v4 gerado pela extensão `pgcrypto` (`gen_random_uuid()`). Isso permite:
- Geração de IDs no lado da aplicação antes de inserir no banco
- IDs únicos sem coordenação entre instâncias (útil em futuras migrações para multi-instance)
- IDs opacos que não expõem a ordem de inserção

### Timestamps com Timezone

Todos os campos de data usam `TIMESTAMPTZ` (timestamp with time zone). Os valores são armazenados em UTC e convertidos pelo PostgreSQL conforme o timezone da sessão.

### JSONB para Configurações

Campos de configuração variável (como `connection_config`, `retention_policy`) usam `JSONB` ao invés de colunas separadas por:
- Flexibilidade para diferentes tipos de datasource/storage
- Suporte a índices GIN no PostgreSQL
- Facilidade para adicionar campos sem migrations

### Soft vs Hard Delete

O DataGuardian usa **hard delete** (remoção física) para backups expirados e **sem delete** para registros históricos de execuções (exceto quando o job pai é deletado).

---

## Queries Úteis

### Resumo do status de todos os datasources

```sql
SELECT
  name,
  type,
  status,
  last_health_check_at,
  enabled
FROM datasources
ORDER BY status = 'critical' DESC, name;
```

### Últimas 10 execuções com falha

```sql
SELECT
  be.id,
  bj.name AS job_name,
  d.name AS datasource_name,
  be.started_at,
  be.error_message
FROM backup_executions be
JOIN backup_jobs bj ON bj.id = be.job_id
JOIN datasources d ON d.id = be.datasource_id
WHERE be.status = 'failed'
ORDER BY be.started_at DESC
LIMIT 10;
```

### Tamanho total de todos os backups por job

```sql
SELECT
  bj.name AS job_name,
  COUNT(*) AS total_executions,
  SUM(be.compressed_size_bytes) / 1024.0 / 1024.0 / 1024.0 AS total_size_gb,
  AVG(be.duration_seconds) AS avg_duration_seconds,
  AVG(1 - be.compressed_size_bytes::float / NULLIF(be.size_bytes, 0)) AS avg_compression_ratio
FROM backup_executions be
JOIN backup_jobs bj ON bj.id = be.job_id
WHERE be.status = 'completed'
GROUP BY bj.id, bj.name
ORDER BY total_size_gb DESC;
```

### Jobs que precisam ser executados agora (SchedulerWorker)

```sql
SELECT
  id,
  name,
  datasource_id,
  storage_location_id,
  schedule_cron,
  schedule_timezone,
  retention_policy,
  backup_options
FROM backup_jobs
WHERE
  enabled = true
  AND next_execution_at <= NOW()
ORDER BY next_execution_at ASC;
```

### Histórico de latência de um datasource (últimas 24h)

```sql
SELECT
  checked_at,
  status,
  latency_ms
FROM health_checks
WHERE
  datasource_id = 'seu-uuid-aqui'
  AND checked_at >= NOW() - INTERVAL '24 hours'
ORDER BY checked_at DESC;
```

### Notificações não lidas por severidade

```sql
SELECT
  severity,
  COUNT(*) AS total
FROM notifications
WHERE read_at IS NULL
GROUP BY severity
ORDER BY
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'warning' THEN 2
    WHEN 'info' THEN 3
  END;
```

### Espaço total consumido por storage

```sql
SELECT
  sl.name AS storage_name,
  sl.type,
  COUNT(be.id) AS backup_count,
  SUM(be.compressed_size_bytes) / 1024.0 / 1024.0 / 1024.0 AS total_gb
FROM storage_locations sl
LEFT JOIN backup_executions be ON be.storage_location_id = sl.id
  AND be.status = 'completed'
GROUP BY sl.id, sl.name, sl.type
ORDER BY total_gb DESC NULLS LAST;
```

### Identificar backups candidatos à limpeza (exemplo para 1 job)

```sql
-- Backups com mais de 30 dias que não são o primeiro do mês
SELECT
  be.id,
  be.backup_path,
  be.created_at,
  be.compressed_size_bytes
FROM backup_executions be
WHERE
  be.job_id = 'seu-job-uuid'
  AND be.status = 'completed'
  AND be.created_at < NOW() - INTERVAL '30 days'
  AND EXTRACT(DAY FROM be.created_at) != 1  -- Não é backup mensal
ORDER BY be.created_at;
```
