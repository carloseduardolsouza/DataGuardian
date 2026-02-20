# Development - DataGuardian

## Pre requisitos

- Node.js 20+
- npm
- Docker + Docker Compose
- PostgreSQL e Redis (via compose)

## Setup local

1. Instalar dependencias:

```bash
npm install
```

2. Copiar ambiente:

```bash
cp .env.example .env
```

3. Subir infraestrutura:

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

4. Rodar app (API + UI):

```bash
npm run dev
```

## Scripts reais (`package.json`)

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:deploy`
- `npm run db:studio`

## Pastas principais

- `src/api`: rotas/controllers
- `src/core`: regras de negocio
- `src/workers`: workers
- `src/queue`: redis e queue
- `interface/`: frontend React
- `prisma/`: schema e migrations

## Fluxo de dev recomendado

1. alterar codigo
2. `npm run typecheck`
3. `npm run build`
4. testar manualmente via UI/API

## Observacoes

- Redis e opcional para subir API, mas sem Redis os servicos de fila ficam desativados
- `/api/*` exige login; usar `/api/auth/setup` na primeira execucao
- para validar contratos de dados, use os schemas em `src/types/*.ts`
