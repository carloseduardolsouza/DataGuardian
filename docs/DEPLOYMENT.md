# Deployment — DataGuardian

Guia completo para fazer o deploy do DataGuardian em produção utilizando Docker.

## Índice

- [Pré-requisitos](#pré-requisitos)
- [Início Rápido](#início-rápido)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Configuração de Produção](#configuração-de-produção)
- [Volumes e Persistência](#volumes-e-persistência)
- [Configuração de Rede](#configuração-de-rede)
- [Healthchecks](#healthchecks)
- [Atualizações](#atualizações)
- [Backup do Próprio DataGuardian](#backup-do-próprio-dataguardian)
- [Monitoramento e Logs](#monitoramento-e-logs)
- [Solução de Problemas](#solução-de-problemas)

---

## Pré-requisitos

| Requisito       | Versão mínima | Instalação                                  |
|-----------------|---------------|---------------------------------------------|
| Docker          | 24.x          | [docs.docker.com](https://docs.docker.com/engine/install/) |
| Docker Compose  | 2.x           | Incluído no Docker Desktop ou plugin do Docker |
| Memória RAM     | 512 MB        | Recomendado: 1 GB+                          |
| Disco           | 1 GB          | Para a aplicação (excluindo os backups)     |

---

## Início Rápido

### 1. Clone o repositório

```bash
git clone https://github.com/sua-org/dataguardian.git
cd dataguardian
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```bash
nano .env
```

Configurações mínimas obrigatórias:

```env
DB_PASSWORD=troque-por-senha-segura
```

### 3. Suba os containers

```bash
docker compose up -d
```

### 4. Verifique se está tudo rodando

```bash
docker compose ps
```

```
NAME                     IMAGE                  STATUS              PORTS
backup-manager-app       backup-manager-app     Up (healthy)        0.0.0.0:3000->3000/tcp
backup-manager-db        postgres:16-alpine     Up (healthy)        0.0.0.0:5432->5432/tcp
backup-manager-redis     redis:7-alpine         Up (healthy)        0.0.0.0:6379->6379/tcp
```

### 5. Acesse a API

```bash
curl http://localhost:3000/api/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

---

## Variáveis de Ambiente

O arquivo `.env` controla todas as configurações do sistema.

### Banco de Dados

| Variável        | Padrão                                                                    | Descrição                      |
|-----------------|---------------------------------------------------------------------------|--------------------------------|
| `DB_PASSWORD`   | `backup123`                                                               | Senha do PostgreSQL (**troque!**) |
| `DATABASE_URL`  | `postgresql://backup:${DB_PASSWORD}@postgres:5432/backup_manager`        | URL de conexão completa        |

### Redis

| Variável    | Padrão                 | Descrição              |
|-------------|------------------------|------------------------|
| `REDIS_URL` | `redis://redis:6379`   | URL de conexão do Redis|

### Aplicação

| Variável           | Padrão       | Descrição                                        |
|--------------------|--------------|--------------------------------------------------|
| `NODE_ENV`         | `production` | Ambiente (`production` ou `development`)         |
| `PORT`             | `3000`        | Porta em que a API escuta                        |
| `LOG_LEVEL`        | `info`        | Nível de log: `trace`, `debug`, `info`, `warn`, `error` |
| `TZ`               | `UTC`         | Timezone do container                            |

### Segurança

| Variável           | Padrão     | Descrição                                      |
|--------------------|------------|------------------------------------------------|
| `SECRET_KEY`       | —          | Chave secreta para assinatura interna (opcional)|
| `ALLOWED_ORIGINS`  | `*`        | CORS origins permitidos (ex: `http://meusite.com`) |

### Workers

| Variável                      | Padrão | Descrição                                    |
|-------------------------------|--------|----------------------------------------------|
| `MAX_CONCURRENT_BACKUPS`      | `3`    | Máximo de backups simultâneos                |
| `SCHEDULER_INTERVAL_MS`       | `60000`| Intervalo do SchedulerWorker (1 minuto)      |
| `HEALTH_CHECK_INTERVAL_MS`    | `300000`| Intervalo do HealthWorker (5 minutos)       |
| `CLEANUP_CRON`                | `0 4 * * *` | Horário do CleanupWorker (4h da manhã) |
| `TEMP_DIRECTORY`              | `/tmp/dataguardian` | Diretório temporário de staging  |

### Exemplo de `.env.example`

```env
# === BANCO DE DADOS ===
DB_PASSWORD=troque-por-senha-segura
DATABASE_URL=postgresql://backup:${DB_PASSWORD}@postgres:5432/backup_manager

# === REDIS ===
REDIS_URL=redis://redis:6379

# === APLICAÇÃO ===
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
TZ=America/Sao_Paulo

# === SEGURANÇA ===
ALLOWED_ORIGINS=http://meupainel.empresa.local

# === WORKERS ===
MAX_CONCURRENT_BACKUPS=3
TEMP_DIRECTORY=/tmp/dataguardian
```

---

## Configuração de Produção

### `docker-compose.yml` Completo

```yaml
version: '3.8'

services:
  # ──────────────────────────────────────────
  # Banco de metadados (PostgreSQL)
  # ──────────────────────────────────────────
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
      - "127.0.0.1:5432:5432"   # Expõe apenas para localhost
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U backup"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - dataguardian-net

  # ──────────────────────────────────────────
  # Fila de jobs (Redis)
  # ──────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: backup-manager-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD:-redis123} --save 60 1
    volumes:
      - redis-data:/data
    ports:
      - "127.0.0.1:6379:6379"   # Expõe apenas para localhost
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-redis123}", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - dataguardian-net

  # ──────────────────────────────────────────
  # Aplicação (API + Workers)
  # ──────────────────────────────────────────
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
    container_name: backup-manager-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - backup-storage:/var/backups
      - ./config:/app/config:ro
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://backup:${DB_PASSWORD:-backup123}@postgres:5432/backup_manager
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis123}@redis:6379
      PORT: 3000
      LOG_LEVEL: info
      TZ: ${TZ:-UTC}
      MAX_CONCURRENT_BACKUPS: ${MAX_CONCURRENT_BACKUPS:-3}
      TEMP_DIRECTORY: /tmp/dataguardian
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
    networks:
      - dataguardian-net

networks:
  dataguardian-net:
    driver: bridge

volumes:
  postgres-data:
    driver: local
  redis-data:
    driver: local
  backup-storage:
    driver: local
```

---

## Volumes e Persistência

O DataGuardian utiliza 3 volumes críticos que **devem ser preservados**:

| Volume           | Conteúdo                              | Perda implica em                     |
|------------------|---------------------------------------|--------------------------------------|
| `postgres-data`  | Banco de metadados (jobs, execuções)  | Perda de toda configuração           |
| `redis-data`     | Fila de jobs pendentes                | Jobs em fila serão perdidos          |
| `backup-storage` | Backups locais                        | Perda dos arquivos de backup locais  |

### Mapeando Volumes para Diretórios do Host

Para maior controle, mapeie os volumes para diretórios específicos do host:

```yaml
volumes:
  postgres-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/dados/dataguardian/postgres

  redis-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/dados/dataguardian/redis

  backup-storage:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/storage/backups
```

Crie os diretórios antes de subir:

```bash
mkdir -p /mnt/dados/dataguardian/{postgres,redis}
mkdir -p /mnt/storage/backups
```

---

## Configuração de Rede

### Expor atrás de um Reverse Proxy (Nginx)

Em produção, use um reverse proxy com HTTPS:

**`/etc/nginx/sites-available/dataguardian`:**

```nginx
server {
    listen 80;
    server_name dataguardian.empresa.local;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dataguardian.empresa.local;

    ssl_certificate     /etc/ssl/certs/empresa.crt;
    ssl_certificate_key /etc/ssl/private/empresa.key;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;   # Necessário para uploads grandes
    }
}
```

### Configurar Firewall

```bash
# Permitir apenas portas necessárias
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable

# NÃO expor as portas internas (5432, 6379, 3000) diretamente
```

---

## Healthchecks

Todos os containers possuem healthchecks configurados. O Docker Compose garante que os serviços dependentes só sobem após os healthchecks passarem.

### Verificando o status

```bash
docker inspect --format='{{json .State.Health}}' backup-manager-app | jq
```

### Endpoints de health da API

```bash
# Status geral do sistema
GET /api/health

# Versão simplificada (para load balancers)
GET /health
```

---

## Atualizações

### Processo de Atualização

```bash
# 1. Baixe a nova versão
git pull origin main

# 2. Rebuild da imagem
docker compose build app

# 3. Aplique as migrações e suba (com downtime mínimo)
docker compose up -d --no-deps app

# 4. Verifique os logs
docker compose logs -f app --tail=50
```

### Rollback

Se a atualização causar problemas, faça rollback:

```bash
# Volta para a versão anterior pelo git
git checkout v1.2.3

# Rebuild e reinicia
docker compose build app
docker compose up -d --no-deps app
```

### Migrações de Banco

As migrações Prisma são executadas **automaticamente** na inicialização da aplicação. Não é necessário executar manualmente.

Para verificar o status das migrações:

```bash
docker compose exec app npx prisma migrate status
```

---

## Backup do Próprio DataGuardian

O banco de metadados do DataGuardian (PostgreSQL) também deve ser backupeado! Configure um backup externo do próprio banco de controle:

### Backup manual do banco de metadados

```bash
# Cria um dump do banco de metadados
docker compose exec postgres pg_dump \
  -U backup \
  -d backup_manager \
  --format=custom \
  --compress=9 \
  > dataguardian_meta_$(date +%Y%m%d_%H%M%S).dump
```

### Restore do banco de metadados

```bash
# Para o container da aplicação
docker compose stop app

# Restaura o dump
docker compose exec -T postgres pg_restore \
  -U backup \
  -d backup_manager \
  --clean \
  --if-exists \
  < dataguardian_meta_20250213_060000.dump

# Sobe a aplicação novamente
docker compose start app
```

### Automatizando o backup dos metadados

Crie um cron job no host:

```bash
# /etc/cron.d/dataguardian-meta-backup
0 5 * * * root /opt/dataguardian/scripts/backup-meta.sh

# /opt/dataguardian/scripts/backup-meta.sh
#!/bin/bash
BACKUP_DIR="/mnt/meta-backups"
DATE=$(date +%Y%m%d_%H%M%S)

docker compose -f /opt/dataguardian/docker-compose.yml exec -T postgres pg_dump \
  -U backup \
  -d backup_manager \
  --format=custom \
  --compress=9 \
  > "${BACKUP_DIR}/dataguardian_meta_${DATE}.dump"

# Remove dumps com mais de 30 dias
find "${BACKUP_DIR}" -name "dataguardian_meta_*.dump" -mtime +30 -delete
```

---

## Monitoramento e Logs

### Visualizando logs

```bash
# Todos os serviços
docker compose logs -f

# Apenas a aplicação
docker compose logs -f app --tail=100

# Com timestamps
docker compose logs -f app -t
```

### Formato dos Logs

Os logs seguem o formato **JSON estruturado** (Pino):

```json
{
  "level": 30,
  "time": 1739426400000,
  "pid": 1,
  "hostname": "backup-manager-app",
  "msg": "Backup concluído",
  "execution_id": "exec-uuid-...",
  "job_name": "Backup Diário Produção",
  "duration_seconds": 271,
  "size_bytes": 10485760000,
  "compressed_size_bytes": 3670016000
}
```

### Enviando Logs para Serviços Externos

**Grafana Loki via Docker:**

```yaml
services:
  app:
    logging:
      driver: loki
      options:
        loki-url: "http://loki:3100/loki/api/v1/push"
        loki-labels: "service=dataguardian,env=production"
```

**Fluentd / Logstash:** configure o driver de logging no `docker-compose.yml`.

### Métricas (Prometheus)

O endpoint `/api/metrics` (se habilitado) expõe métricas no formato Prometheus:

```
dataguardian_backups_total{status="completed"} 542
dataguardian_backups_total{status="failed"} 3
dataguardian_backup_duration_seconds{job="backup-diario"} 271
dataguardian_datasources_healthy 4
dataguardian_datasources_critical 1
dataguardian_storage_available_gb{storage="nas-empresa"} 450.5
```

---

## Solução de Problemas

### Container da aplicação não sobe

```bash
# Verifique os logs de startup
docker compose logs app

# Verifique se os healthchecks do postgres e redis passaram
docker compose ps
```

**Causas comuns:**
- `DATABASE_URL` incorreta
- PostgreSQL ainda não está pronto (aguarde o healthcheck)
- Migration falhou (verifique os logs)

### Backup falha com "Permission denied"

```bash
# Verifique as permissões do volume de backups
docker compose exec app ls -la /var/backups

# Ajuste as permissões no host
chmod -R 777 /caminho/do/volume/backup-storage
```

### Redis não conecta

```bash
# Teste a conexão ao Redis de dentro do container da app
docker compose exec app redis-cli -u "$REDIS_URL" ping
```

### Migrations falham ao iniciar

```bash
# Force a execução das migrations manualmente
docker compose exec app npx prisma migrate deploy

# Se necessário, reset completo (CUIDADO: apaga todos os dados)
docker compose exec app npx prisma migrate reset --force
```

### Backup fica travado em "running"

Isso pode ocorrer se o container foi reiniciado durante um backup. O status fica inconsistente no banco:

```bash
# Via API, cancele a execução presa
curl -X POST http://localhost:3000/api/executions/{execution_id}/cancel
```

### Verificar uso de recursos

```bash
# CPU e memória dos containers
docker stats

# Espaço em disco dos volumes
docker system df -v
```
