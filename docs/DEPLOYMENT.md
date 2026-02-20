# Deployment - DataGuardian

Guia alinhado ao compose atual em `docker/docker-compose.yml`.

## Servicos do compose

- `postgres` (metadados)
- `redis` (fila)
- `app` (API + workers)
- `evolution-postgres` (integracao WhatsApp)
- `evolution-redis` (integracao WhatsApp)
- `evolution-api` (integracao WhatsApp)

## Subir stack

```bash
docker compose -f docker/docker-compose.yml up -d
```

## Variaveis importantes (`.env`)

- `DB_PASSWORD`
- `DATABASE_URL`
- `REDIS_URL`
- `REDIS_PASSWORD`
- `PORT`
- `LOG_LEVEL`
- `ALLOWED_ORIGINS`
- `MAX_CONCURRENT_BACKUPS`
- `SCHEDULER_INTERVAL_MS`
- `HEALTH_CHECK_INTERVAL_MS`
- `CLEANUP_CRON`
- `TEMP_DIRECTORY`
- `EVOLUTION_API_GLOBAL_KEY`
- `EVOLUTION_DB_PASSWORD`

## Healthchecks

- simples: `GET /health`
- detalhado: `GET /api/health`

## Redis indisponivel em producao

Com Redis fora:

- scheduler/backup param automaticamente
- health/cleanup continuam
- endpoints dependentes de fila podem retornar `503`

## Upgrade

```bash
git pull
docker compose -f docker/docker-compose.yml build app
docker compose -f docker/docker-compose.yml up -d app
```

## Logs

```bash
docker compose -f docker/docker-compose.yml logs -f app
```

## Persistencia

Volumes importantes:

- `postgres-data`
- `redis-data`
- `backup-storage`
- `evolution-*` (quando integracao WhatsApp estiver habilitada)

## Recomendacoes

- nao expor `5432` e `6379` publicamente
- colocar `app` atras de reverse proxy HTTPS
- proteger `.env` e credenciais de storage
