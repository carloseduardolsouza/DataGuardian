# 🛡️ DataGuardian

> Plataforma self-hosted para **backup** e **restore** de bancos de dados, com API Node.js, workers em background e frontend React.

## ✨ Visao Geral

- 🔌 API REST em `src/api`
- 🖥️ Frontend React em `interface/`
- 🗄️ Persistencia de metadados em PostgreSQL (Prisma)
- 📦 Filas BullMQ + Redis para rotinas assincronas
- 🔐 Autenticacao por sessao + RBAC (usuarios, roles e permissoes)
- 🧾 Auditoria de acoes sensiveis em `audit_logs`
- 📈 Endpoint Prometheus nativo em `GET /metrics`

## ⚙️ Workers Ativos

- 🗓️ `scheduler` (agenda execucoes)
- 💾 `backup` (dump, compressao, upload)
- ♻️ `restore` (restaura via fila, com retry)
- ❤️ `health` (saude de datasources/storages)
- 🧹 `cleanup` (retencao)

## 🚀 Funcionalidades Principais

- CRUD de datasources, storages e backup jobs
- Execucao manual imediata de backup (`POST /api/backup-jobs/:id/run`)
- Restore de backup via fila (`POST /api/backups/:executionId/restore`)
- Modo de verificacao de restore (banco temporario + confirmacao explicita)
- Logs de execucao (`GET /api/executions/:id/logs`)
- Retry de upload (`POST /api/executions/:id/retry-upload`)
- Explorer de storage (listar, copiar, excluir e baixar)
- Dashboard com dados reais (`GET /api/dashboard/overview`)
- Health detalhado (`GET /api/health`, `/api/health/datasources`, `/api/health/storage`)
- Notificacoes internas e externas via **WhatsApp**
- Templates e versionamento de notificacoes (`/api/system/notification-templates`)

## 🧠 Retencao

Politica recomendada:

```json
{
  "max_backups": 3,
  "auto_delete": true
}
```

Ao concluir o 4o backup do mesmo job, o backup mais antigo e removido.  
Campos legados (`keep_daily`, `keep_weekly`, `keep_monthly`) continuam aceitos por compatibilidade.

## 🟡 Degradacao Sem Redis

Se o Redis ficar indisponivel:

- workers de fila (`scheduler`, `backup`, `restore`) sao desativados
- workers `health` e `cleanup` continuam ativos
- endpoints dependentes de fila retornam `503`

Quando o Redis volta, os workers de fila sao reativados automaticamente.

## 🧪 Setup Rapido (Dev)

1. Instalar dependencias

```bash
npm install
```

2. Configurar ambiente

```bash
cp .env.example .env
```

3. Subir infraestrutura

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

4. Aplicar migrations e gerar Prisma Client

```bash
npm run db:deploy
npm run db:generate
```

5. Rodar API + UI

```bash
npm run dev
```

## 📜 Scripts Principais

| Script | Descricao |
|---|---|
| `npm run dev` | Sobe API + Interface em desenvolvimento |
| `npm run build` | Build completo (API + Interface) |
| `npm run typecheck` | Validacao TypeScript |
| `npm run test` | Executa todos os testes (Jest) |
| `npm run test:unit` | Executa testes unitarios (Jest) |
| `npm run test:e2e` | Executa testes e2e (Jest) |
| `npm run test:coverage` | Gera cobertura de testes |
| `npm run db:migrate` | Cria/aplica migration em dev |
| `npm run db:deploy` | Aplica migrations de deploy |
| `npm run db:generate` | Gera Prisma Client |
| `npm run db:studio` | Abre Prisma Studio |

## 📚 Documentacao

- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/DEVELOPMENT.md`
- `docs/DEPLOYMENT.md`
- `docs/STORAGE.md`
- `docs/MONITORING_AND_BACKUP_OPS.md`
- `docs/IMPROVEMENTS.md`
- `docs/RELEASES.md`
