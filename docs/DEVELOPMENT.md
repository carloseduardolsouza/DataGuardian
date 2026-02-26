# :sparkles: Development - DataGuardian

> Guia para setup local e fluxo de desenvolvimento.

## :white_check_mark: Pré-requisitos

- Node.js 20+
- npm
- Docker + Docker Compose

## :bookmark: Setup local

1. Instalar dependências

```bash
npm install
```

2. Copiar ambiente

```bash
cp .env.example .env
```

3. Subir infraestrutura mínima

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

## :bookmark: Scripts principais (`package.json`)

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:coverage`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:deploy`
- `npm run db:studio`
- `npm run db:seed`

## :bookmark: Pastas principais

- `src/api`: rotas, controllers e middlewares
- `src/core`: regras de negócio
- `src/workers`: workers de fila e ciclos
- `src/queue`: Redis e BullMQ
- `interface/`: frontend React
- `prisma/`: schema e migrations
- `docs/`: documentação do projeto

## :bookmark: Fluxo recomendado

1. Implementar alteração
2. Rodar `npm run test:unit`
3. Rodar `npm run typecheck`
4. Rodar `npm run build`
5. Testar manualmente UI/API
6. Validar logs de backup/restore quando aplicável

## :bookmark: Observações

- Sem Redis, API sobe, mas workers de fila ficam desativados
- `/api/*` exige login/sessão (exceto `/api/auth/*`)
- Frontend deve seguir `STYLE_GUIDE.md`
- Para setup inicial, usar `POST /api/auth/setup` quando `GET /api/auth/status` retornar `has_user=false`
- Em fluxos críticos da UI, ao fechar a modal de aprovação obrigatória, a modal anterior também é fechada

## :white_check_mark: Variáveis de performance

- `WORKER_THREAD_POOL_SIZE`: tamanho do pool `worker_threads` para tarefas CPU-bound
- `SYSTEM_MONITOR_INTERVAL_MS`: intervalo de coleta do monitor de máquina/processo
- `SYSTEM_MONITOR_HISTORY_SIZE`: tamanho máximo do histórico em memória para dashboard

