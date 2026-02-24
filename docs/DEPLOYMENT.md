# Deployment - DataGuardian

Guia alinhado ao compose em `docker/docker-compose.yml`.

## Servicos

- `postgres` (metadados)
- `redis` (fila BullMQ)
- `app` (API + workers)
- `evolution-postgres`
- `evolution-redis`
- `evolution-api`

## Subir stack

```bash
docker compose -f docker/docker-compose.yml up -d
```

## Variaveis importantes (`.env`)

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
- `LOCAL_STORAGE_HOST_PATH` (pasta do host montada em `/var/backups` no container app)
- `EVOLUTION_API_GLOBAL_KEY`

## Health e metricas

- `GET /health` (liveness simples)
- `GET /api/health` (detalhado, protegido)
- `GET /metrics` (Prometheus)

## Redis indisponivel em producao

Com Redis offline:

- `scheduler`, `backup` e `restore` ficam desativados
- `health` e `cleanup` continuam
- endpoints dependentes de fila podem retornar `503`

Quando Redis volta, os workers de fila sao religados automaticamente.

## Upgrade

```bash
git pull
docker compose -f docker/docker-compose.yml build app
docker compose -f docker/docker-compose.yml up -d app
```

## Releases no GitHub

Fluxo recomendado de versao e tags:

- versionamento e changelog automaticos via GitHub Actions (`Release Please`)
- tags semanticas no formato `vX.Y.Z`
- publicacao automatica de imagem Docker via workflow em `.github/workflows/docker-publish.yml`

Detalhes operacionais em `docs/RELEASES.md`.

## Migrations

Em deploy, garantir migrations aplicadas:

```bash
npm run db:deploy
npm run db:generate
```

## Logs

```bash
docker compose -f docker/docker-compose.yml logs -f app
```

## Persistencia

Volumes principais:

- `postgres-data`
- `redis-data`
- `backup-storage`
- `evolution-*`

## Recomendacoes

- nao expor `5432` e `6379` publicamente
- usar reverse proxy HTTPS para o `app`
- proteger `.env` e credenciais de storage
- coletar `/metrics` em Prometheus/Grafana
