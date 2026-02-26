# :bookmark: Deployment - DataGuardian

> Guia de deploy com Docker Compose, incluindo versionamento de imagem.

## :bookmark: Visão geral

O serviço `app` usa imagem publicada no Docker Hub (`carlossouzadev/dataguardian`) com tag configurável por `APP_IMAGE_TAG`.

## :bookmark: Serviços

- `postgres` (metadados)
- `redis` (fila BullMQ)
- `app` (API + workers)
- `evolution-postgres`
- `evolution-redis`
- `evolution-api`

## :bookmark: Subir stack

```bash
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d
```

## :bookmark: Atualizar imagem da aplicação

Para forçar pull da imagem mais recente da aplicação:

```bash
docker compose --env-file docker/.env -f docker/docker-compose.yml pull app
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d app
```

Para fixar versão específica (recomendado em produção):

```bash
# docker/.env
DOCKER_IMAGE=carlossouzadev/dataguardian
APP_IMAGE_TAG=1.2.3

docker compose --env-file docker/.env -f docker/docker-compose.yml pull app
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d app
```

## :bookmark: Variáveis importantes (`docker/.env`)

- `DATABASE_URL`
- `REDIS_URL`
- `REDIS_PASSWORD`
- `PORT`
- `HOST` (usar `0.0.0.0` para expor no container/rede)
- `LOG_LEVEL`
- `ALLOWED_ORIGINS`
- `MAX_CONCURRENT_BACKUPS`
- `SCHEDULER_INTERVAL_MS`
- `HEALTH_CHECK_INTERVAL_MS`
- `CLEANUP_CRON`
- `TEMP_DIRECTORY`
- `LOCAL_STORAGE_HOST_PATH` (pasta do host montada em `/var/backups`)
- `LOCAL_STORAGE_ROOT_PATH` (path interno no container; padrão `/var/backups`)
- `EVOLUTION_API_GLOBAL_KEY`
- `DOCKER_IMAGE` (repositório da imagem Docker da app)
- `APP_IMAGE_TAG` (ex.: `1.2.3`, `1.2`, `latest`)

## :bookmark: Health e métricas

- `GET /health` (liveness simples)
- `GET /api/health` (detalhado, protegido)
- `GET /metrics` (Prometheus)

## :bookmark: Acesso via IP da máquina

Exemplo: `http://192.168.0.10:3000`

- Mantenha `HOST=0.0.0.0`
- Inclua origin correto em `ALLOWED_ORIGINS` quando não usar `*`
- Exemplo: `ALLOWED_ORIGINS=http://192.168.0.10:3000,http://localhost:3000`

## :bookmark: Redis indisponível em produção

Com Redis offline:

- `scheduler`, `backup` e `restore` ficam desativados
- `health` e `cleanup` continuam
- Endpoints dependentes de fila podem retornar `503`

Quando Redis volta, os workers de fila são religados automaticamente.

## :bookmark: Upgrade

```bash
git pull
docker compose --env-file docker/.env -f docker/docker-compose.yml pull app
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d app
```

## :sparkles: Releases no GitHub

Fluxo recomendado:

- Versionamento e changelog automáticos via GitHub Actions (`Release Please`)
- Tags semânticas no formato `vX.Y.Z`
- Publicação automática de imagem Docker via workflow em `.github/workflows/docker-publish.yml`

Detalhes em `docs/RELEASES.md`.

## :sparkles: Migrations

Em deploy, garantir migrations aplicadas:

```bash
npm run db:deploy
npm run db:generate
```

## :bookmark: Logs

```bash
docker compose --env-file docker/.env -f docker/docker-compose.yml logs -f app
```

## :bookmark: Persistência

Volumes principais:

- `postgres-data`
- `redis-data`
- `backup-storage`
- `evolution-*`

## :bookmark: Recomendações

- Não expor `5432` e `6379` publicamente
- Usar reverse proxy HTTPS para o `app`
- Proteger `.env` e credenciais de storage
- Coletar `/metrics` em Prometheus/Grafana

