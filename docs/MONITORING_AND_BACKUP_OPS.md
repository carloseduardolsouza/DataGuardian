# Monitoramento, Organização de Backups e Rollback — DataGuardian

Guia operacional completo sobre monitoramento em tempo real do status de conexão com bancos de dados, estrutura de organização de arquivos de backup em disco e procedimento de rollback para backups anteriores.

---

## Índice

- [1. Monitoramento em Tempo Real da Conexão com o Banco de Dados](#1-monitoramento-em-tempo-real-da-conexão-com-o-banco-de-dados)
- [2. Estrutura de Pastas para Backups em Disco](#2-estrutura-de-pastas-para-backups-em-disco)
- [3. Padrão de Nomenclatura dos Arquivos de Backup](#3-padrão-de-nomenclatura-dos-arquivos-de-backup)
- [4. Rollback para um Backup Anterior](#4-rollback-para-um-backup-anterior)

---

## 1. Monitoramento em Tempo Real da Conexão com o Banco de Dados

### Como funciona o HealthWorker

O DataGuardian possui um worker dedicado chamado `HealthWorker` que roda em background como parte do processo Node.js monolítico. Ele é responsável por verificar periodicamente a conectividade com cada datasource cadastrado e atualizar o status no banco de dados interno do sistema.

**Ciclo de execução padrão:** a cada **5 minutos**.

```
HealthWorker (intervalo: 5 min)
    ↓
Busca todos os datasources com enabled = true
    ↓
Para cada datasource:
    1. Abre conexão com o banco de dados alvo
    2. Executa: SELECT 1  (query mínima de verificação)
    3. Mede o tempo de resposta (latency_ms)
    4. Coleta metadados: versão do DB, uptime, conexões ativas
    5. Grava o resultado em health_checks
    6. Atualiza datasources.status e last_health_check_at
    ↓
Se falhou 3 vezes consecutivas:
    → Cria notificação tipo connection_lost (severity: critical)
    → Dispara alerta por e-mail/webhook (se configurado)
    ↓
Se voltou após uma falha:
    → Cria notificação tipo connection_restored (severity: info)
```

### Status possíveis de uma datasource

| Status | Significado |
|--------|-------------|
| `healthy` | Conexão bem-sucedida, latência dentro do esperado |
| `warning` | Conexão lenta ou instabilidade detectada |
| `critical` | Falha confirmada após 3 verificações consecutivas |
| `unknown` | Nenhuma verificação realizada ainda |

### Endpoints da API para monitoramento

Você pode consultar o status de conexão em tempo real através dos seguintes endpoints da API REST:

**Listar todas as datasources com status atual:**
```
GET /api/datasources
```

Resposta:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Banco Produção",
    "type": "postgres",
    "status": "healthy",
    "last_health_check_at": "2025-02-13T06:05:00Z"
  }
]
```

**Consultar o histórico de health checks de uma datasource específica:**
```
GET /api/datasources/:id/health-checks
```

Resposta:
```json
[
  {
    "checked_at": "2025-02-13T06:05:00Z",
    "status": "ok",
    "latency_ms": 12,
    "metadata": {
      "database_version": "PostgreSQL 16.1",
      "active_connections": 8,
      "disk_usage_percent": 42
    }
  },
  {
    "checked_at": "2025-02-13T06:00:00Z",
    "status": "timeout",
    "latency_ms": null,
    "error_message": "Connection timed out after 5000ms"
  }
]
```

**Consultar notificações de falha de conexão:**
```
GET /api/notifications?type=connection_lost
```

**Forçar um health check imediato (verificação manual):**
```
POST /api/datasources/:id/health-check
```

### Implementação do monitoramento em tempo real no frontend

Para exibir o status de conexão em tempo real na interface web, utilize **polling** no frontend com intervalo alinhado ao ciclo do HealthWorker:

```typescript
// Exemplo: polling a cada 30 segundos
const checkHealth = async () => {
  const response = await fetch('/api/datasources');
  const datasources = await response.json();
  
  datasources.forEach(ds => {
    updateStatusBadge(ds.id, ds.status, ds.last_health_check_at);
  });
};

// Inicia o polling
const pollingInterval = setInterval(checkHealth, 30_000);

// Ao desmontar o componente
clearInterval(pollingInterval);
```

Alternativamente, implemente **Server-Sent Events (SSE)** ou **WebSocket** para notificações push quando o status de uma datasource mudar. O worker pode emitir um evento interno ao atualizar o status, que o servidor Express então retransmite para os clientes conectados:

```typescript
// No HealthWorker, após atualizar o status:
eventEmitter.emit('datasource:status-changed', {
  datasourceId: ds.id,
  status: newStatus,
  checkedAt: new Date().toISOString()
});

// No servidor Express (rota SSE):
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  
  const listener = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  eventEmitter.on('datasource:status-changed', listener);
  req.on('close', () => {
    eventEmitter.off('datasource:status-changed', listener);
  });
});
```

### Status dos health checks armazenados

Cada verificação gera um registro na tabela `health_checks` com os seguintes status possíveis:

| Status | Causa |
|--------|-------|
| `ok` | Conexão e query executadas com sucesso |
| `timeout` | O banco não respondeu dentro do tempo limite |
| `auth_failed` | Credenciais inválidas ou usuário sem permissão |
| `unreachable` | Host não encontrado ou porta fechada |
| `error` | Outro erro inesperado (ver `error_message`) |

---

## 2. Estrutura de Pastas para Backups em Disco

A estrutura de diretórios abaixo é o padrão recomendado para organizar os backups nos discos locais do usuário. Ela garante rastreabilidade, facilita o rollback e suporta múltiplos jobs e datasources.

### Estrutura raiz

```
/var/backups/                          ← raiz configurada no storage_location
│
├── {job_id}/                          ← uma pasta por backup job
│   │
│   ├── {YYYY-MM-DD_HHmmss}/          ← uma pasta por execução
│   │   ├── backup.dump.gz             ← arquivo de backup (arquivo único)
│   │   └── manifest.json             ← metadados da execução
│   │
│   ├── {YYYY-MM-DD_HHmmss}/          ← execução com chunks (arquivo grande)
│   │   ├── backup.dump.gz.part-001
│   │   ├── backup.dump.gz.part-002
│   │   ├── backup.dump.gz.part-003
│   │   └── manifest.json
│   │
│   └── {YYYY-MM-DD_HHmmss}/
│       └── ...
│
├── {job_id}/                          ← outro job (ex: backup de staging)
│   └── ...
│
└── _system/                           ← pasta reservada para uso interno
    └── cleanup.log                    ← log de limpezas automáticas
```

### Exemplo concreto com múltiplos jobs

```
/var/backups/
│
├── 550e8400-e29b-41d4-a716-446655440000/     ← job "Backup Diário Produção"
│   ├── 2025-02-13_060001/
│   │   ├── backup.dump.gz
│   │   └── manifest.json
│   ├── 2025-02-12_060001/
│   │   ├── backup.dump.gz
│   │   └── manifest.json
│   └── 2025-02-01_060001/                   ← backup mensal retido
│       ├── backup.dump.gz
│       └── manifest.json
│
├── 7f3a1c00-d41e-4b29-b853-993344220000/     ← job "Backup Semanal MySQL"
│   ├── 2025-02-09_020001/
│   │   ├── backup.sql.zst.part-001
│   │   ├── backup.sql.zst.part-002
│   │   └── manifest.json
│   └── 2025-02-02_020001/
│       └── ...
│
└── a1b2c3d4-e5f6-7890-abcd-ef1234567890/     ← job "Backup Arquivos /home"
    ├── 2025-02-13_040001/
    │   ├── backup.tar.lz4
    │   └── manifest.json
    └── ...
```

### Configuração no docker-compose.yml

Monte o disco externo do usuário no caminho configurado no storage_location:

```yaml
services:
  app:
    volumes:
      # Disco externo do usuário montado no container
      - /mnt/hd-externo/dataguardian:/var/backups

      # Ou com volume Docker gerenciado
      - backup-storage:/var/backups

volumes:
  backup-storage:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/hd-externo/dataguardian   # caminho real no host
```

### Permissões recomendadas

```bash
# Garante que o processo (UID 1000) pode ler e escrever
sudo chown -R 1000:1000 /mnt/hd-externo/dataguardian
sudo chmod -R 755 /mnt/hd-externo/dataguardian
```

---

## 3. Padrão de Nomenclatura dos Arquivos de Backup

### Padrão geral

```
backup.{formato}.{compressão}[.part-{NNN}]
```

O `manifest.json` sempre acompanha cada execução na mesma pasta.

### Tabela de extensões por combinação

| Tipo de Datasource | Formato base | + gzip | + zstd | + lz4 | Sem compressão |
|---|---|---|---|---|---|
| PostgreSQL | `.dump` | `backup.dump.gz` | `backup.dump.zst` | `backup.dump.lz4` | `backup.dump` |
| MySQL / MariaDB | `.sql` | `backup.sql.gz` | `backup.sql.zst` | `backup.sql.lz4` | `backup.sql` |
| MongoDB | `.archive` | `backup.archive.gz` | `backup.archive.zst` | `backup.archive.lz4` | `backup.archive` |
| SQL Server | `.bacpac` | `backup.bacpac.gz` | — | — | `backup.bacpac` |
| SQLite | `.db` | `backup.db.gz` | `backup.db.zst` | `backup.db.lz4` | `backup.db` |
| Files (tar) | `.tar` | `backup.tar.gz` | `backup.tar.zst` | `backup.tar.lz4` | `backup.tar` |

### Padrão para backups divididos em chunks (arquivos grandes)

Quando o backup ultrapassa o `max_file_size_mb` configurado no job, o arquivo é dividido com sufixo sequencial:

```
backup.dump.gz.part-001
backup.dump.gz.part-002
backup.dump.gz.part-003
```

O número é sempre formatado com 3 dígitos e começa em `001`.

### Padrão da pasta de execução

O nome da pasta de cada execução segue o formato ISO 8601 sem separadores:

```
{YYYY-MM-DD_HHmmss}
```

Exemplos:
```
2025-02-13_060001   ← 13 de fevereiro de 2025 às 06:00:01
2025-02-13_143022   ← 13 de fevereiro de 2025 às 14:30:22
```

### Manifesto (`manifest.json`)

Cada execução gera obrigatoriamente um `manifest.json` que contém todas as informações necessárias para um restore ou rollback:

```json
{
  "version": "1.0",
  "created_at": "2025-02-13T06:00:01.000Z",
  "execution_id": "exec-uuid-...",
  "job_id": "job-uuid-...",
  "datasource_type": "postgres",
  "backup_type": "full",
  "compression": "gzip",
  "total_size_bytes": 10485760000,
  "compressed_size_bytes": 3670016000,
  "compression_ratio": 0.35,
  "checksum": "sha256:a3f1b2c4d5e6f7...",
  "chunks": [
    { "number": 1, "file": "backup.dump.gz.part-001", "checksum": "sha256:..." },
    { "number": 2, "file": "backup.dump.gz.part-002", "checksum": "sha256:..." }
  ],
  "metadata": {
    "database_version": "PostgreSQL 16.1",
    "tables_backed_up": 48,
    "rows_approximate": 4200000
  }
}
```

---

## 4. Rollback para um Backup Anterior

Rollback é o processo de restaurar um banco de dados ao estado de um backup anterior, descartando todas as alterações feitas depois daquele ponto no tempo.

> ⚠️ **Atenção:** Rollback é uma operação destrutiva. Todos os dados gravados no banco após a data do backup selecionado serão perdidos permanentemente. Certifique-se de fazer um backup do estado atual antes de iniciar.

### Passo 1 — Identificar o backup de destino

**Via API:** Liste as execuções concluídas do job desejado:

```http
GET /api/backup-jobs/{job_id}/executions?status=completed&limit=50
```

A resposta trará cada execução com `id`, `started_at`, `backup_path`, `size_bytes` e `metadata`. Identifique o `execution_id` do backup para o qual deseja fazer rollback.

**Via disco:** Navegue pelo diretório do job e leia o `manifest.json` de cada pasta para identificar a data e o conteúdo do backup:

```bash
# Listar execuções disponíveis ordenadas por data (mais recentes primeiro)
ls -lt /var/backups/{job_id}/

# Verificar o manifesto de uma execução específica
cat /var/backups/{job_id}/2025-02-12_060001/manifest.json
```

### Passo 2 — Fazer backup do estado atual (segurança)

Antes de qualquer restore, execute um backup manual do banco atual via API:

```http
POST /api/backup-jobs/{job_id}/run
```

Isso garante que você pode reverter o rollback, se necessário.

### Passo 3 — Baixar o arquivo de backup

**Via API (download do arquivo):**

```http
GET /api/executions/{execution_id}/download
```

O sistema retornará o arquivo de backup (ou os chunks em um `.zip`) para download.

**Diretamente do disco:**

```bash
# Para arquivo único
cp /var/backups/{job_id}/2025-02-12_060001/backup.dump.gz /tmp/restore/

# Para múltiplos chunks
cp /var/backups/{job_id}/2025-02-12_060001/backup.dump.gz.part-* /tmp/restore/
```

Se o backup estiver em chunks, remonte-os antes de restaurar:

```bash
# Concatenar chunks em arquivo único
cat backup.dump.gz.part-001 backup.dump.gz.part-002 backup.dump.gz.part-003 > backup.dump.gz
```

### Passo 4 — Verificar a integridade do arquivo

Antes de restaurar, valide o checksum para garantir que o arquivo não foi corrompido. O valor esperado está no `manifest.json`:

```bash
# Verificar SHA256 do arquivo
sha256sum backup.dump.gz

# Comparar com o checksum do manifest.json
cat manifest.json | grep checksum
```

Se os valores não coincidirem, o arquivo está corrompido e não deve ser usado.

### Passo 5 — Restaurar o banco de dados

Os comandos variam de acordo com o tipo de banco de dados:

#### PostgreSQL

```bash
# 1. Descomprimir (se necessário)
gunzip backup.dump.gz
# resultado: backup.dump

# 2. Dropar e recriar o banco de destino
psql -h HOST -U USUARIO -c "DROP DATABASE IF EXISTS nome_banco;"
psql -h HOST -U USUARIO -c "CREATE DATABASE nome_banco;"

# 3. Restaurar com pg_restore
pg_restore \
  --host=HOST \
  --port=5432 \
  --username=USUARIO \
  --dbname=nome_banco \
  --format=custom \
  --no-acl \
  --no-owner \
  --verbose \
  backup.dump
```

#### MySQL / MariaDB

```bash
# 1. Descomprimir
gunzip backup.sql.gz
# resultado: backup.sql

# 2. Restaurar
mysql -h HOST -u USUARIO -p nome_banco < backup.sql

# Ou com zstd
zstd -d backup.sql.zst -o backup.sql
mysql -h HOST -u USUARIO -p nome_banco < backup.sql
```

#### MongoDB

```bash
# 1. Descomprimir
gunzip backup.archive.gz
# resultado: backup.archive

# 2. Restaurar com mongorestore
mongorestore \
  --host=HOST:27017 \
  --username=USUARIO \
  --password=SENHA \
  --authenticationDatabase=admin \
  --archive=backup.archive \
  --drop   # descarta coleções existentes antes de restaurar
```

#### SQLite

```bash
# 1. Descomprimir
gunzip backup.db.gz
# resultado: backup.db

# 2. Substituir o arquivo de banco atual
cp backup.db /caminho/para/seu/banco.db
```

### Passo 6 — Validar o restore

Após a restauração, execute verificações para confirmar que os dados estão consistentes:

```bash
# PostgreSQL — verificar número de tabelas e contagem de linhas
psql -h HOST -U USUARIO -d nome_banco -c "\dt"
psql -h HOST -U USUARIO -d nome_banco -c "SELECT COUNT(*) FROM sua_tabela_principal;"

# MySQL — verificar tabelas
mysql -h HOST -u USUARIO -p nome_banco -e "SHOW TABLES;"

# MongoDB — verificar coleções
mongosh --host HOST nome_banco --eval "db.getCollectionNames()"
```

### Passo 7 — Registrar o rollback no DataGuardian

Após um rollback bem-sucedido, registre a operação manualmente via API para manter o histórico:

```http
POST /api/executions/{execution_id}/mark-restored
Content-Type: application/json

{
  "restored_at": "2025-02-13T10:30:00Z",
  "restored_by": "operador",
  "reason": "Rollback após deploy com bug na migração de dados"
}
```

Isso cria uma notificação do tipo `restore_completed` com severidade `info`, visível no painel de notificações.

### Resumo do fluxo de rollback

```
1. Identificar o backup alvo (API ou disco)
         ↓
2. Fazer backup de segurança do estado atual
         ↓
3. Baixar o arquivo de backup
         ↓
4. Verificar checksum (SHA256)
         ↓
5. Restaurar o banco (pg_restore / mysql / mongorestore)
         ↓
6. Validar dados restaurados
         ↓
7. Registrar o rollback via API
         ↓
✅ Rollback concluído
```

---

## Referência Rápida de Comandos

| Ação | Comando / Endpoint |
|------|-------------------|
| Ver status de conexão de todas as datasources | `GET /api/datasources` |
| Ver histórico de health checks | `GET /api/datasources/:id/health-checks` |
| Forçar verificação imediata | `POST /api/datasources/:id/health-check` |
| Listar backups disponíveis de um job | `GET /api/backup-jobs/:id/executions?status=completed` |
| Executar backup manual | `POST /api/backup-jobs/:id/run` |
| Baixar arquivo de backup | `GET /api/executions/:id/download` |
| Registrar restore realizado | `POST /api/executions/:id/mark-restored` |
| Ver notificações de falha de conexão | `GET /api/notifications?type=connection_lost` |
---

## 5. Nova Aba Backups (UI + API)

Foi adicionada no menu lateral a aba **Backups**, com foco operacional em restore:

- lista todos os bancos com backups conclu�dos
- mostra os backups por banco com status por storage (`available`, `missing`, `unreachable`, `unknown`)
- permite restore imediato pelo frontend (bot�o `Restore`)
- permite selecionar storage espec�fico para restore quando houver m�ltiplos destinos

### Endpoints usados pela aba

- `GET /api/backups/datasources`
- `GET /api/backups/datasources/:datasourceId`
- `POST /api/backups/:executionId/restore`

### Comportamento do restore implementado

- baixa o arquivo do storage selecionado (ou tenta automaticamente os storages do backup)
- descompacta `.gz` automaticamente
- executa restore real:
  - `postgres`: `pg_restore`
  - `mysql`: `mysql` (importando o dump)
- remove artefatos tempor�rios locais ao final
