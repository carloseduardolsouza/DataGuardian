# Development - DataGuardian

## Pre requisitos

- Node.js 20+
- npm
- Docker + Docker Compose

## Setup local

1. Instalar dependencias

```bash
npm install
```

2. Copiar ambiente

```bash
cp .env.example .env
```

3. Subir infraestrutura minima

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

4. Aplicar schema/migrations

```bash
npm run db:deploy
npm run db:generate
```

5. Rodar API + UI

```bash
npm run dev
```

## Scripts (`package.json`)

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:deploy`
- `npm run db:studio`
- `npm run db:seed`

## Pastas principais

- `src/api`: rotas/controllers/middlewares
- `src/core`: regras de negocio
- `src/workers`: workers de fila e ciclos
- `src/queue`: Redis e BullMQ
- `interface/`: frontend React
- `prisma/`: schema e migrations
- `docs/`: documentacao do projeto

## Fluxo recomendado

1. implementar alteracao
2. `npm run typecheck`
3. `npm run build`
4. testar manualmente UI/API
5. validar logs de backup/restore quando aplicavel

## Observacoes

- sem Redis, API sobe, mas workers de fila ficam desativados
- `/api/*` exige login/sessao (exceto `/api/auth/*`)
- frontend deve seguir `STYLE_GUIDE.md`
- para setup inicial, usar `POST /api/auth/setup` quando `GET /api/auth/status` retornar `has_user=false`
