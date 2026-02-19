# API REST — DataGuardian

Documentação completa de todos os endpoints da API REST do DataGuardian.

## Índice

- [Visão Geral](#visão-geral)
- [Convenções](#convenções)
- [Datasources](#datasources)
- [Storage Locations](#storage-locations)
- [Backup Jobs](#backup-jobs)
- [Backups](#backups)
- [Executions](#executions)
- [Health](#health)
- [Notifications](#notifications)
- [System Settings](#system-settings)
- [Códigos de Status](#códigos-de-status)
- [Tratamento de Erros](#tratamento-de-erros)

---

## Visão Geral

A API REST do DataGuardian expõe todos os recursos do sistema via HTTP/JSON. Ela roda na porta `3000` por padrão e está disponível em:

```
http://localhost:3000/api
```

Todas as respostas seguem o formato JSON com `Content-Type: application/json`.

---

## Convenções

### Formato de Data

Todas as datas são retornadas e aceitas no formato **ISO 8601 UTC**:

```
2025-02-13T03:00:00.000Z
```

### Paginação

Endpoints que retornam listas aceitam os parâmetros de query:

| Parâmetro | Tipo    | Padrão | Descrição                  |
|-----------|---------|--------|----------------------------|
| `page`    | integer | `1`    | Página atual               |
| `limit`   | integer | `20`   | Itens por página (max 100) |

Resposta paginada:

```json
{
  "data": [...],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

### UUIDs

Todos os IDs são **UUID v4** no formato:
```
550e8400-e29b-41d4-a716-446655440000
```

---

## Datasources

Datasources representam os bancos de dados e sistemas de arquivos que serão alvo dos backups.

### Tipos suportados

| Tipo         | Descrição               |
|--------------|-------------------------|
| `postgres`   | PostgreSQL              |
| `mysql`      | MySQL / MariaDB         |
| `mongodb`    | MongoDB                 |
| `sqlserver`  | Microsoft SQL Server    |
| `sqlite`     | SQLite                  |
| `files`      | Sistema de arquivos     |

---

### `GET /api/datasources`

Lista todos os datasources cadastrados.

**Query Parameters:**

| Parâmetro | Tipo    | Descrição                          |
|-----------|---------|------------------------------------|
| `page`    | integer | Página (padrão: 1)                 |
| `limit`   | integer | Itens por página (padrão: 20)      |
| `type`    | string  | Filtra por tipo (`postgres`, etc.) |
| `status`  | string  | Filtra por status (`healthy`, etc.)|
| `enabled` | boolean | Filtra por datasources ativos      |
| `tag`     | string  | Filtra por tag                     |

**Resposta `200 OK`:**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Banco Produção",
      "type": "postgres",
      "status": "healthy",
      "enabled": true,
      "tags": ["produção", "crítico"],
      "last_health_check_at": "2025-02-13T02:55:00.000Z",
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-02-13T02:55:00.000Z"
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

> **Nota:** O campo `connection_config` **não é retornado** em listagens por segurança. Use `GET /api/datasources/:id` para ver a configuração (com credenciais mascaradas).

---

### `POST /api/datasources`

Cria um novo datasource. A API testa a conexão antes de salvar.

**Request Body:**

```json
{
  "name": "Banco Produção",
  "type": "postgres",
  "connection_config": {
    "host": "db.empresa.local",
    "port": 5432,
    "database": "app_prod",
    "username": "backup_user",
    "password": "senhasegura",
    "ssl_enabled": false
  },
  "enabled": true,
  "tags": ["produção", "crítico"]
}
```

**Schemas de `connection_config` por tipo:**

<details>
<summary>Postgres / MySQL / SQL Server / MongoDB</summary>

```json
{
  "host": "db.empresa.local",
  "port": 5432,
  "database": "app_prod",
  "username": "backup_user",
  "password": "senhasegura",
  "ssl_enabled": false
}
```

| Campo        | Tipo    | Obrigatório | Descrição              |
|--------------|---------|-------------|------------------------|
| `host`       | string  | sim         | Hostname ou IP         |
| `port`       | integer | sim         | Porta do serviço       |
| `database`   | string  | sim         | Nome do banco          |
| `username`   | string  | sim         | Usuário de conexão     |
| `password`   | string  | sim         | Senha                  |
| `ssl_enabled`| boolean | não         | Ativar SSL (default: false) |

</details>

<details>
<summary>SQLite</summary>

```json
{
  "file_path": "/var/data/app.db"
}
```

| Campo       | Tipo   | Obrigatório | Descrição                  |
|-------------|--------|-------------|----------------------------|
| `file_path` | string | sim         | Caminho absoluto do arquivo |

</details>

<details>
<summary>Files (sistema de arquivos)</summary>

```json
{
  "source_path": "/var/www/uploads",
  "include_patterns": ["*.jpg", "*.png", "*.pdf"],
  "exclude_patterns": ["*.log", "temp/*", "cache/*"]
}
```

| Campo              | Tipo     | Obrigatório | Descrição                               |
|--------------------|----------|-------------|-----------------------------------------|
| `source_path`      | string   | sim         | Caminho do diretório raiz               |
| `include_patterns` | string[] | não         | Padrões glob de arquivos a incluir      |
| `exclude_patterns` | string[] | não         | Padrões glob de arquivos a excluir      |

</details>

**Resposta `201 Created`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Banco Produção",
  "type": "postgres",
  "status": "healthy",
  "enabled": true,
  "tags": ["produção", "crítico"],
  "last_health_check_at": null,
  "created_at": "2025-02-13T10:00:00.000Z",
  "updated_at": "2025-02-13T10:00:00.000Z"
}
```

**Erro `400 Bad Request`** (conexão falhou):

```json
{
  "error": "CONNECTION_FAILED",
  "message": "Não foi possível conectar ao datasource: ECONNREFUSED 192.168.1.10:5432",
  "details": {
    "host": "db.empresa.local",
    "port": 5432
  }
}
```

---

### `GET /api/datasources/:id`

Retorna um datasource específico com sua configuração de conexão (senhas mascaradas).

**Resposta `200 OK`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Banco Produção",
  "type": "postgres",
  "connection_config": {
    "host": "db.empresa.local",
    "port": 5432,
    "database": "app_prod",
    "username": "backup_user",
    "password": "**********",
    "ssl_enabled": false
  },
  "status": "healthy",
  "enabled": true,
  "tags": ["produção", "crítico"],
  "last_health_check_at": "2025-02-13T02:55:00.000Z",
  "created_at": "2025-01-01T00:00:00.000Z",
  "updated_at": "2025-02-13T02:55:00.000Z"
}
```

---

### `PUT /api/datasources/:id`

Atualiza um datasource existente. Apenas os campos enviados são atualizados.

**Request Body** (todos os campos são opcionais):

```json
{
  "name": "Banco Produção v2",
  "enabled": false,
  "tags": ["produção", "crítico", "legado"],
  "connection_config": {
    "password": "novasenha"
  }
}
```

**Resposta `200 OK`:** objeto datasource atualizado.

---

### `DELETE /api/datasources/:id`

Remove um datasource. **Não é possível deletar** datasources com backup jobs ativos.

**Resposta `204 No Content`:** sem corpo.

**Erro `409 Conflict`:**

```json
{
  "error": "DATASOURCE_HAS_ACTIVE_JOBS",
  "message": "Existem 2 backup job(s) associados a este datasource. Remova-os primeiro.",
  "details": {
    "job_ids": ["uuid1", "uuid2"]
  }
}
```

---

### `POST /api/datasources/:id/test`

Testa a conectividade com o datasource sem salvar nada.

**Resposta `200 OK`:**

```json
{
  "status": "ok",
  "latency_ms": 12,
  "metadata": {
    "database_version": "PostgreSQL 16.1",
    "server_uptime": "15 days",
    "active_connections": 8
  }
}
```

**Resposta `200 OK`** (falhou):

```json
{
  "status": "error",
  "latency_ms": null,
  "error": "ECONNREFUSED",
  "message": "Connection refused to 192.168.1.10:5432"
}
```

---

## Storage Locations

Storage locations são os destinos onde os backups serão armazenados.

### Tipos suportados

| Tipo         | Descrição                    |
|--------------|------------------------------|
| `local`      | Sistema de arquivos local    |
| `s3`         | AWS S3 / Wasabi              |
| `ssh`        | SSH / SFTP                   |
| `minio`      | MinIO (S3 compatível)        |
| `backblaze`  | Backblaze B2                 |

---

### `GET /api/storage-locations`

Lista todos os storage locations.

**Query Parameters:** `page`, `limit`, `type`, `status`

**Resposta `200 OK`:**

```json
{
  "data": [
    {
      "id": "abc12345-...",
      "name": "NAS Empresa",
      "type": "ssh",
      "is_default": true,
      "available_space_gb": 450.5,
      "status": "healthy",
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-02-13T00:00:00.000Z"
    }
  ],
  "pagination": { "total": 3, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### `POST /api/storage-locations`

Cria um novo storage location. Testa a conexão e verifica espaço disponível antes de salvar.

**Request Body (SSH/SFTP):**

```json
{
  "name": "NAS Empresa",
  "type": "ssh",
  "is_default": true,
  "config": {
    "host": "nas.empresa.local",
    "port": 22,
    "username": "backup",
    "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...",
    "remote_path": "/mnt/storage/backups"
  }
}
```

**Request Body (S3):**

```json
{
  "name": "AWS S3 Backups",
  "type": "s3",
  "config": {
    "endpoint": null,
    "bucket": "empresa-backups",
    "region": "us-east-1",
    "access_key_id": "AKIAIOSFODNN7EXAMPLE",
    "secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "storage_class": "STANDARD_IA"
  }
}
```

**Request Body (MinIO):**

```json
{
  "name": "MinIO Local",
  "type": "minio",
  "config": {
    "endpoint": "http://minio.local:9000",
    "bucket": "backups",
    "access_key": "minioadmin",
    "secret_key": "minioadmin",
    "use_ssl": false
  }
}
```

**Request Body (Local):**

```json
{
  "name": "Disco Local",
  "type": "local",
  "config": {
    "path": "/var/backups",
    "max_size_gb": 500
  }
}
```

**Request Body (Backblaze B2):**

```json
{
  "name": "Backblaze B2",
  "type": "backblaze",
  "config": {
    "bucket_id": "e73ede9969c64427a54e",
    "bucket_name": "empresa-backups",
    "application_key_id": "0014b4f7b5e7...",
    "application_key": "K001Abc..."
  }
}
```

**Resposta `201 Created`:**

```json
{
  "id": "abc12345-...",
  "name": "NAS Empresa",
  "type": "ssh",
  "is_default": true,
  "available_space_gb": 450.5,
  "status": "healthy",
  "created_at": "2025-02-13T10:00:00.000Z",
  "updated_at": "2025-02-13T10:00:00.000Z"
}
```

---

### `GET /api/storage-locations/:id`

Retorna um storage location com sua configuração (credenciais mascaradas).

---

### `PUT /api/storage-locations/:id`

Atualiza um storage location. Campos parciais aceitos.

---

### `DELETE /api/storage-locations/:id`

Remove um storage location. Não é permitido deletar se houver jobs associados.

---

### `POST /api/storage-locations/:id/test`

Testa conectividade e espaço disponível.

**Resposta `200 OK`:**

```json
{
  "status": "ok",
  "available_space_gb": 450.5,
  "latency_ms": 45
}
```

---

## Backup Jobs

Backup jobs definem a política de backup: o que fazer, onde salvar, quando executar e quanto tempo manter.

---

### `GET /api/backup-jobs`

Lista todos os backup jobs.

**Query Parameters:** `page`, `limit`, `enabled`, `datasource_id`, `storage_location_id`

**Resposta `200 OK`:**

```json
{
  "data": [
    {
      "id": "job-uuid-...",
      "name": "Backup Diário Produção",
      "datasource_id": "ds-uuid-...",
      "storage_location_id": "st-uuid-...",
      "schedule_cron": "0 3 * * *",
      "schedule_timezone": "America/Sao_Paulo",
      "enabled": true,
      "last_execution_at": "2025-02-13T06:00:00.000Z",
      "next_execution_at": "2025-02-14T06:00:00.000Z",
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-02-13T06:00:00.000Z",
      "datasource": {
        "id": "ds-uuid-...",
        "name": "Banco Produção",
        "type": "postgres"
      },
      "storage_location": {
        "id": "st-uuid-...",
        "name": "NAS Empresa",
        "type": "ssh"
      }
    }
  ],
  "pagination": { "total": 4, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### `POST /api/backup-jobs`

Cria um novo backup job.

**Request Body:**

```json
{
  "name": "Backup Diário Produção",
  "datasource_id": "ds-uuid-...",
  "storage_location_id": "st-uuid-...",
  "schedule_cron": "0 3 * * *",
  "schedule_timezone": "America/Sao_Paulo",
  "enabled": true,
  "retention_policy": {
    "keep_daily": 7,
    "keep_weekly": 4,
    "keep_monthly": 12,
    "auto_delete": true
  },
  "backup_options": {
    "compression": "gzip",
    "compression_level": 6,
    "parallel_jobs": 4,
    "exclude_tables": ["logs_*", "temp_*"],
    "include_tables": [],
    "max_file_size_mb": 2048
  }
}
```

**Campos de `retention_policy`:**

| Campo          | Tipo    | Obrigatório | Descrição                              |
|----------------|---------|-------------|----------------------------------------|
| `keep_daily`   | integer | sim         | Manter backups diários por X dias      |
| `keep_weekly`  | integer | sim         | Manter backups semanais por X semanas  |
| `keep_monthly` | integer | sim         | Manter backups mensais por X meses     |
| `auto_delete`  | boolean | sim         | Deletar automaticamente backups antigos|

**Campos de `backup_options`:**

| Campo               | Tipo     | Obrigatório | Descrição                                 |
|---------------------|----------|-------------|-------------------------------------------|
| `compression`       | string   | sim         | `gzip`, `zstd`, `lz4` ou `none`          |
| `compression_level` | integer  | não         | Nível 1–9 (para gzip/zstd)               |
| `parallel_jobs`     | integer  | não         | Paralelismo (ex: `pg_dump -j`)            |
| `exclude_tables`    | string[] | não         | Padrões de tabelas a excluir              |
| `include_tables`    | string[] | não         | Padrões de tabelas a incluir (`[]` = todas)|
| `max_file_size_mb`  | integer  | não         | Divide em chunks se exceder esse tamanho  |

**Expressões cron suportadas:**

```
# Diário às 3h da manhã
0 3 * * *

# A cada 6 horas
0 */6 * * *

# Toda segunda-feira à meia-noite
0 0 * * 1

# Todo dia 1 do mês às 2h
0 2 1 * *
```

**Resposta `201 Created`:**

```json
{
  "id": "job-uuid-...",
  "name": "Backup Diário Produção",
  "datasource_id": "ds-uuid-...",
  "storage_location_id": "st-uuid-...",
  "schedule_cron": "0 3 * * *",
  "schedule_timezone": "America/Sao_Paulo",
  "enabled": true,
  "next_execution_at": "2025-02-14T06:00:00.000Z",
  "created_at": "2025-02-13T10:00:00.000Z",
  "updated_at": "2025-02-13T10:00:00.000Z"
}
```

---

### `GET /api/backup-jobs/:id`

Retorna um backup job com detalhes completos, incluindo `retention_policy` e `backup_options`.

---

### `PUT /api/backup-jobs/:id`

Atualiza um backup job. Quando o cron é alterado, `next_execution_at` é recalculado automaticamente.

---

### `DELETE /api/backup-jobs/:id`

Remove um backup job. Execuções históricas são mantidas no banco.

**Resposta `204 No Content`.**

---

### `POST /api/backup-jobs/:id/run`

Aciona uma execução manual imediata do job, independente do agendamento.

**Resposta `202 Accepted`:**

```json
{
  "execution_id": "exec-uuid-...",
  "message": "Backup enfileirado com sucesso",
  "status": "queued"
}
```

---

## Executions

Histórico de execuções de backup.

---

### `GET /api/executions`

Lista o histórico de execuções.

**Query Parameters:**

| Parâmetro              | Tipo    | Descrição                                         |
|------------------------|---------|---------------------------------------------------|
| `page`                 | integer | Página                                            |
| `limit`                | integer | Itens por página                                  |
| `job_id`               | string  | Filtra por backup job                             |
| `datasource_id`        | string  | Filtra por datasource                             |
| `storage_location_id`  | string  | Filtra por storage                                |
| `status`               | string  | `queued`, `running`, `completed`, `failed`, `cancelled` |
| `from`                 | string  | Data de início (ISO 8601)                         |
| `to`                   | string  | Data de fim (ISO 8601)                            |

**Resposta `200 OK`:**

```json
{
  "data": [
    {
      "id": "exec-uuid-...",
      "job_id": "job-uuid-...",
      "datasource_id": "ds-uuid-...",
      "storage_location_id": "st-uuid-...",
      "status": "completed",
      "backup_type": "full",
      "started_at": "2025-02-13T06:00:01.000Z",
      "finished_at": "2025-02-13T06:04:32.000Z",
      "duration_seconds": 271,
      "size_bytes": 10485760000,
      "compressed_size_bytes": 3670016000,
      "backup_path": "/mnt/storage/backups/job-uuid/2025-02-13_060001.dump.gz",
      "files_count": null,
      "error_message": null,
      "metadata": {
        "database_version": "PostgreSQL 16.1",
        "tables_backed_up": 48,
        "rows_approximate": 12500000,
        "compression_ratio": 0.35,
        "checksum": "sha256:a3f1..."
      },
      "created_at": "2025-02-13T06:00:00.000Z"
    }
  ],
  "pagination": { "total": 200, "page": 1, "limit": 20, "totalPages": 10 }
}
```

---

### `GET /api/executions/:id`

Retorna os detalhes de uma execução, incluindo os chunks (se dividido em partes).

**Resposta `200 OK`:**

```json
{
  "id": "exec-uuid-...",
  "status": "completed",
  "chunks": [
    {
      "chunk_number": 1,
      "file_path": "/mnt/storage/backups/.../part-001.gz",
      "size_bytes": 2147483648,
      "checksum": "sha256:b4c2..."
    },
    {
      "chunk_number": 2,
      "file_path": "/mnt/storage/backups/.../part-002.gz",
      "size_bytes": 1522745344,
      "checksum": "sha256:c5d3..."
    }
  ]
}
```

---

### `POST /api/executions/:id/cancel`

Cancela uma execução em andamento (status `queued` ou `running`).

**Resposta `200 OK`:**

```json
{
  "id": "exec-uuid-...",
  "status": "cancelled",
  "message": "Execução cancelada com sucesso"
}
```

---

## Backups

Endpoints para a nova aba **Backups** (explorar backups por banco e executar restore).

### `GET /api/backups/datasources`

Lista todos os bancos que possuem pelo menos um backup concluido.

**Resposta `200 OK`:**

```json
{
  "data": [
    {
      "datasource_id": "ds-uuid-...",
      "datasource_name": "Banco Producao",
      "datasource_type": "postgres",
      "datasource_status": "healthy",
      "datasource_enabled": true,
      "backups_count": 12,
      "last_backup_at": "2026-02-19T18:35:00.000Z",
      "updated_at": "2026-02-19T18:36:10.000Z"
    }
  ]
}
```

---

### `GET /api/backups/datasources/:datasourceId`

Lista os backups concluídos de um datasource, incluindo status do arquivo em cada storage.

**Resposta `200 OK`:**

```json
{
  "datasource_id": "ds-uuid-...",
  "total_backups": 2,
  "backups": [
    {
      "execution_id": "exec-uuid-...",
      "status": "completed",
      "backup_type": "full",
      "created_at": "2026-02-19T18:35:00.000Z",
      "compressed_size_bytes": 512000000,
      "job": {
        "id": "job-uuid-...",
        "name": "Backup Diario"
      },
      "storage_locations": [
        {
          "storage_location_id": "st-1",
          "storage_name": "NAS",
          "storage_type": "ssh",
          "configured_status": "healthy",
          "backup_path": "ssh://nas:22/backups/app/2026-02-19_183500/backup.dump.gz",
          "relative_path": "app/2026-02-19_183500/backup.dump.gz",
          "status": "available",
          "message": null
        }
      ]
    }
  ]
}
```

---

### `POST /api/backups/:executionId/restore`

Executa restore imediato de um backup concluido.

**Request Body:**

```json
{
  "storage_location_id": "st-uuid-opcional",
  "drop_existing": true
}
```

`storage_location_id` e opcional. Quando omitido, a API tenta automaticamente os storages conhecidos do backup.

**Resposta `202 Accepted`:**

```json
{
  "message": "Restore executado com sucesso",
  "execution_id": "exec-uuid-...",
  "datasource_id": "ds-uuid-...",
  "datasource_name": "Banco Producao",
  "datasource_type": "postgres",
  "source_storage": {
    "id": "st-uuid-...",
    "name": "NAS",
    "type": "ssh"
  },
  "restored_at": "2026-02-19T18:42:33.000Z"
}
```

**Erros comuns:**

- `409 BACKUP_NOT_RESTORABLE`: execucao nao esta em `completed`
- `422 RESTORE_NOT_SUPPORTED`: restore suportado apenas para `postgres` e `mysql`
- `503 BACKUP_DOWNLOAD_FAILED`: nenhum storage conseguiu fornecer o arquivo

---

## Health

Endpoints relacionados ao status de saúde do sistema.

---

### `GET /api/health`

Retorna o status geral do sistema (usado pelo healthcheck do Docker).

**Resposta `200 OK`:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime_seconds": 86400,
  "services": {
    "database": "ok",
    "redis": "ok",
    "workers": {
      "backup": "running",
      "scheduler": "running",
      "health": "running",
      "cleanup": "running"
    }
  },
  "stats": {
    "datasources_total": 5,
    "datasources_healthy": 4,
    "datasources_critical": 1,
    "jobs_total": 8,
    "jobs_enabled": 6,
    "executions_today": 6,
    "executions_failed_today": 0
  }
}
```

---

### `GET /api/health/datasources`

Retorna o histórico de health checks de todos os datasources.

**Query Parameters:** `datasource_id`, `page`, `limit`, `from`, `to`

**Resposta `200 OK`:**

```json
{
  "data": [
    {
      "id": "hc-uuid-...",
      "datasource_id": "ds-uuid-...",
      "checked_at": "2025-02-13T06:00:00.000Z",
      "status": "ok",
      "latency_ms": 12,
      "error_message": null,
      "metadata": {
        "database_version": "PostgreSQL 16.1",
        "server_uptime": "30 days",
        "active_connections": 8,
        "disk_usage_percent": 45.2
      }
    }
  ]
}
```

---

### `GET /api/health/storage`

Retorna o historico de health checks dos storage locations monitorados pelo HealthWorker.

**Query Parameters:** `storage_location_id`, `page`, `limit`, `from`, `to`

**Resposta `200 OK`:**

```json
{
  "data": [
    {
      "id": "shc-uuid-...",
      "storage_location_id": "st-uuid-...",
      "storage_name": "NAS Empresa",
      "storage_type": "ssh",
      "checked_at": "2026-02-19T16:10:00.000Z",
      "status": "ok",
      "latency_ms": 34,
      "available_space_gb": null,
      "error_message": null
    }
  ],
  "pagination": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}
```

---

## Notifications

Sistema de alertas e eventos do DataGuardian.

---

### `GET /api/notifications`

Lista notificações do sistema.

**Query Parameters:**

| Parâmetro   | Tipo    | Descrição                                    |
|-------------|---------|----------------------------------------------|
| `page`      | integer | Página                                       |
| `limit`     | integer | Itens por página                             |
| `read`      | boolean | `true` = lidas, `false` = não lidas          |
| `severity`  | string  | `info`, `warning`, `critical`                |
| `type`      | string  | Filtra por tipo de notificação               |

**Resposta `200 OK`:**

```json
{
  "data": [
    {
      "id": "notif-uuid-...",
      "type": "backup_failed",
      "severity": "critical",
      "entity_type": "backup_job",
      "entity_id": "job-uuid-...",
      "title": "Backup falhou: Banco Produção",
      "message": "Falha ao executar pg_dump: FATAL: role 'backup_user' does not exist",
      "metadata": {
        "execution_id": "exec-uuid-...",
        "job_name": "Backup Diário Produção",
        "datasource_name": "Banco Produção"
      },
      "read_at": null,
      "created_at": "2025-02-13T06:04:32.000Z"
    }
  ],
  "unread_count": 3,
  "pagination": { "total": 50, "page": 1, "limit": 20, "totalPages": 3 }
}
```

**Tipos de notificação:**

| Tipo                    | Severidade | Descrição                           |
|-------------------------|------------|-------------------------------------|
| `backup_success`        | `info`     | Backup concluído com sucesso        |
| `backup_failed`         | `critical` | Falha na execução do backup         |
| `connection_lost`       | `critical` | Datasource ficou inacessível        |
| `connection_restored`   | `info`     | Datasource voltou a responder       |
| `storage_full`          | `warning`  | Storage atingiu capacidade máxima   |
| `storage_unreachable`   | `critical` | Storage ficou inacessível           |
| `health_degraded`       | `warning`  | Saúde do datasource degradou        |
| `cleanup_completed`     | `info`     | Limpeza automática concluída        |

---

### `PUT /api/notifications/:id/read`

Marca uma notificação como lida.

**Resposta `200 OK`:**

```json
{
  "id": "notif-uuid-...",
  "read_at": "2025-02-13T10:30:00.000Z"
}
```

---

### `PUT /api/notifications/read-all`

Marca todas as notificações não lidas como lidas.

**Resposta `200 OK`:**

```json
{
  "updated_count": 3
}
```

---

### `DELETE /api/notifications/:id`

Remove uma notificação.

**Resposta `204 No Content`.**

---

## System Settings

Configurações globais do sistema.

---

### `GET /api/system/settings`

Retorna todas as configurações do sistema.

**Resposta `200 OK`:**

```json
{
  "notifications.email_enabled": {
    "value": false,
    "description": "Habilitar envio de alertas por e-mail"
  },
  "notifications.email_smtp_config": {
    "value": {
      "host": "smtp.empresa.local",
      "port": 587,
      "user": "alerts@empresa.local",
      "password": "**********",
      "from": "DataGuardian <alerts@empresa.local>",
      "to": ["admin@empresa.local"]
    },
    "description": "Configuração do servidor SMTP"
  },
  "notifications.webhook_url": {
    "value": "https://hooks.slack.com/services/...",
    "description": "URL de webhook para notificações (Slack, Discord, etc.)"
  },
  "system.max_concurrent_backups": {
    "value": 3,
    "description": "Número máximo de backups em paralelo"
  },
  "system.temp_directory": {
    "value": "/tmp/dataguardian",
    "description": "Diretório temporário para staging de backups"
  }
}
```

---

### `PUT /api/system/settings`

Atualiza uma ou mais configurações do sistema.

**Request Body:**

```json
{
  "notifications.email_enabled": true,
  "notifications.email_smtp_config": {
    "host": "smtp.empresa.local",
    "port": 587,
    "user": "alerts@empresa.local",
    "password": "senhasegura",
    "from": "DataGuardian <alerts@empresa.local>",
    "to": ["admin@empresa.local"]
  },
  "system.max_concurrent_backups": 5
}
```

**Resposta `200 OK`:** objeto com todas as configurações atualizadas.

---

### `POST /api/system/settings`

Cria uma nova configuração (chave única).

**Request Body:**

```json
{
  "key": "app.custom_flag",
  "value": true,
  "description": "Flag customizada para ambiente local"
}
```

**Resposta `201 Created`:**

```json
{
  "key": "app.custom_flag",
  "value": true,
  "description": "Flag customizada para ambiente local",
  "updated_at": "2026-02-19T18:20:00.000Z"
}
```

---

### `GET /api/system/settings/:key`

Retorna uma configuração específica.

---

### `PUT /api/system/settings/:key`

Atualiza uma configuração específica por chave.

**Request Body (parcial):**

```json
{
  "value": {
    "enabled": true
  },
  "description": "Nova descrição opcional"
}
```

---

### `DELETE /api/system/settings/:key`

Remove uma configuração específica.

**Resposta `204 No Content`.**

---

### `POST /api/system/settings/test-smtp`

Envia um e-mail de teste com a configuração SMTP atual.

**Resposta `200 OK`:**

```json
{
  "status": "sent",
  "message": "E-mail de teste enviado para admin@empresa.local"
}
```

---

## Códigos de Status

| Código | Significado                                                    |
|--------|----------------------------------------------------------------|
| `200`  | OK — Requisição bem-sucedida                                   |
| `201`  | Created — Recurso criado com sucesso                           |
| `202`  | Accepted — Requisição aceita (processamento assíncrono)        |
| `204`  | No Content — Sucesso sem corpo de resposta                     |
| `400`  | Bad Request — Dados inválidos ou conexão falhou                |
| `404`  | Not Found — Recurso não encontrado                             |
| `409`  | Conflict — Violação de regra de negócio                        |
| `422`  | Unprocessable Entity — Validação de schema falhou              |
| `500`  | Internal Server Error — Erro interno do servidor               |

---

## Tratamento de Erros

Todos os erros seguem o formato padrão:

```json
{
  "error": "ERROR_CODE",
  "message": "Descrição legível do erro",
  "details": {
    "field": "schedule_cron",
    "reason": "Expressão cron inválida: '99 3 * * *'"
  }
}
```

### Códigos de erro comuns

| Código                      | Status | Descrição                                  |
|-----------------------------|--------|--------------------------------------------|
| `VALIDATION_ERROR`          | 422    | Schema de validação falhou                 |
| `NOT_FOUND`                 | 404    | Recurso não encontrado                     |
| `CONNECTION_FAILED`         | 400    | Falha ao testar conexão com datasource     |
| `STORAGE_UNREACHABLE`       | 400    | Falha ao testar conexão com storage        |
| `DATASOURCE_HAS_ACTIVE_JOBS`| 409    | Datasource possui jobs ativos              |
| `INVALID_CRON`              | 422    | Expressão cron inválida                    |
| `EXECUTION_NOT_CANCELLABLE` | 409    | Execução já concluída ou cancelada         |
| `INTERNAL_ERROR`            | 500    | Erro interno inesperado                    |
