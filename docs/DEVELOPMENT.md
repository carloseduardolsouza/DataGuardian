# Development — DataGuardian

Guia completo para configurar o ambiente de desenvolvimento local e contribuir com o projeto.

## Índice

- [Pré-requisitos](#pré-requisitos)
- [Configuração do Ambiente](#configuração-do-ambiente)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Convenções de Código](#convenções-de-código)
- [Executando em Desenvolvimento](#executando-em-desenvolvimento)
- [Testes](#testes)
- [Adicionando Novos Backup Engines](#adicionando-novos-backup-engines)
- [Adicionando Novos Storage Adapters](#adicionando-novos-storage-adapters)
- [Fluxo de Workers e Filas](#fluxo-de-workers-e-filas)
- [Scripts Úteis](#scripts-úteis)

---

## Pré-requisitos

| Ferramenta      | Versão mínima | Instalação                                    |
|-----------------|---------------|-----------------------------------------------|
| Node.js         | 20.x          | [nodejs.org](https://nodejs.org) ou `nvm`     |
| npm             | 10.x          | Incluído com Node.js                          |
| Docker          | 24.x          | [docs.docker.com](https://docs.docker.com)    |
| Docker Compose  | 2.x           | Incluído com Docker Desktop                   |
| Git             | 2.x           | [git-scm.com](https://git-scm.com)            |

### Opcional, mas recomendado

- **`nvm`** (Node Version Manager) — para gerenciar versões do Node.js
- **`jq`** — para visualizar JSONs no terminal (`brew install jq` / `apt install jq`)
- **TablePlus / DBeaver** — GUI para inspecionar o PostgreSQL de dev

---

## Configuração do Ambiente

### 1. Clone e instale as dependências

```bash
git clone https://github.com/sua-org/dataguardian.git
cd dataguardian
npm install
```

### 2. Configure o ambiente de desenvolvimento

```bash
cp .env.example .env
```

O `.env` de desenvolvimento pode usar as configurações padrão. Os serviços de infraestrutura (PostgreSQL e Redis) rodarão via Docker.

### 3. Suba apenas a infraestrutura

```bash
# Sobe apenas o PostgreSQL e o Redis (sem a aplicação)
docker compose -f docker-compose.dev.yml up -d
```

**`docker-compose.dev.yml`:**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: dg-dev-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: backup_manager_dev
      POSTGRES_USER: backup
      POSTGRES_PASSWORD: backup123
    volumes:
      - dev-postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    container_name: dg-dev-redis
    restart: unless-stopped
    ports:
      - "6379:6379"

volumes:
  dev-postgres-data:
```

### 4. Configure a URL do banco

No `.env`:

```env
DATABASE_URL=postgresql://backup:backup123@localhost:5432/backup_manager_dev
REDIS_URL=redis://localhost:6379
NODE_ENV=development
LOG_LEVEL=debug
```

### 5. Execute as migrations

```bash
npx prisma migrate dev
```

Este comando:
- Cria o banco se não existir
- Aplica todas as migrations pendentes
- Gera o Prisma Client tipado

### 6. (Opcional) Popule com dados de seed

```bash
npx prisma db seed
```

### 7. Inicie a aplicação em modo desenvolvimento

```bash
npm run dev
```

A API estará disponível em `http://localhost:3000`.

---

## Estrutura do Projeto

```
dataguardian/
│
├── prisma/
│   ├── schema.prisma          # Schema do Prisma ORM
│   ├── migrations/            # Histórico de migrations
│   └── seed.ts                # Dados de seed para desenvolvimento
│
├── src/
│   ├── index.ts               # Entry point — inicia API + Workers
│   │
│   ├── api/                   # Camada HTTP (Express)
│   │   ├── server.ts          # Configuração do Express
│   │   ├── routes/            # Rotas da API REST
│   │   │   ├── datasources.ts
│   │   │   ├── storage-locations.ts
│   │   │   ├── backup-jobs.ts
│   │   │   ├── executions.ts
│   │   │   ├── health.ts
│   │   │   ├── notifications.ts
│   │   │   └── system.ts
│   │   └── middlewares/
│   │       ├── error-handler.ts   # Tratamento global de erros
│   │       ├── validation.ts      # Middleware de validação (Zod)
│   │       └── logger.ts          # Request logging
│   │
│   ├── core/                  # Lógica de negócio
│   │   ├── backup/
│   │   │   ├── engines/       # Um engine por tipo de banco
│   │   │   │   ├── base-engine.ts
│   │   │   │   ├── postgres-engine.ts
│   │   │   │   ├── mysql-engine.ts
│   │   │   │   ├── mongodb-engine.ts
│   │   │   │   ├── sqlserver-engine.ts
│   │   │   │   ├── sqlite-engine.ts
│   │   │   │   └── files-engine.ts
│   │   │   ├── executor.ts    # Orquestrador: une engine + storage + compressão
│   │   │   └── compressor.ts  # Gzip, zstd, lz4
│   │   │
│   │   ├── storage/
│   │   │   ├── adapters/      # Um adapter por tipo de storage
│   │   │   │   ├── base-adapter.ts
│   │   │   │   ├── local-adapter.ts
│   │   │   │   ├── s3-adapter.ts
│   │   │   │   ├── ssh-adapter.ts
│   │   │   │   ├── minio-adapter.ts
│   │   │   │   └── backblaze-adapter.ts
│   │   │   └── storage-factory.ts  # Factory: retorna o adapter correto
│   │   │
│   │   ├── scheduler/
│   │   │   ├── cron-parser.ts     # Valida e interpreta cron expressions
│   │   │   └── job-scheduler.ts   # Calcula próximas execuções
│   │   │
│   │   ├── retention/
│   │   │   └── cleanup-manager.ts # Implementa a política GFS
│   │   │
│   │   └── health/
│   │       └── health-checker.ts  # Testa conectividade dos datasources
│   │
│   ├── workers/               # Background jobs (BullMQ consumers)
│   │   ├── backup-worker.ts   # Processa backups da fila
│   │   ├── health-worker.ts   # Health checks periódicos
│   │   ├── scheduler-worker.ts # Agenda backups no Redis
│   │   └── cleanup-worker.ts  # Deleta backups expirados
│   │
│   ├── queue/
│   │   ├── queues.ts          # Definição das filas BullMQ
│   │   └── redis-client.ts    # Instância do cliente Redis
│   │
│   ├── utils/
│   │   ├── logger.ts          # Pino logger configurado
│   │   ├── config.ts          # Leitura de env vars + config files
│   │   └── notifications.ts   # Envio de e-mail e webhooks
│   │
│   └── types/
│       ├── datasource.types.ts
│       ├── storage.types.ts
│       └── backup.types.ts
│
├── config/
│   ├── default.json           # Configurações padrão
│   ├── development.json       # Overrides de desenvolvimento
│   └── production.json        # Overrides de produção
│
├── tests/
│   ├── unit/
│   │   ├── engines/
│   │   ├── storage/
│   │   └── retention/
│   └── integration/
│       ├── api/
│       └── workers/
│
└── docs/
    ├── API.md
    ├── STORAGE.md
    ├── DEPLOYMENT.md
    ├── DEVELOPMENT.md
    ├── ARCHITECTURE.md
    └── DATABASE.md
```

---

## Convenções de Código

### TypeScript

- **Strict mode** habilitado (`"strict": true` no `tsconfig.json`)
- Use `interface` para tipos de objetos, `type` para unions/aliases
- Prefira `async/await` ao invés de Promises encadeadas
- Nunca use `any` — use `unknown` quando o tipo for desconhecido e faça narrowing

```typescript
// ✅ Correto
async function executeBackup(jobId: string): Promise<ExecutionResult> { ... }

// ❌ Evitar
function executeBackup(jobId: any): any { ... }
```

### Nomenclatura

| Elemento          | Convenção           | Exemplo                        |
|-------------------|---------------------|--------------------------------|
| Arquivos          | `kebab-case`        | `postgres-engine.ts`           |
| Classes           | `PascalCase`        | `PostgresEngine`               |
| Funções/métodos   | `camelCase`         | `executeBackup()`              |
| Constantes        | `SCREAMING_SNAKE`   | `MAX_RETRY_COUNT`              |
| Interfaces/Types  | `PascalCase` com prefixo | `IBackupEngine`, `StorageConfig` |
| Enums             | `PascalCase`        | `DatasourceType.Postgres`      |

### Organização de Imports

```typescript
// 1. Módulos nativos do Node.js
import { createReadStream } from 'fs';
import { spawn } from 'child_process';

// 2. Dependências externas
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

// 3. Módulos internos (paths absolutos ou aliases)
import { logger } from '@/utils/logger';
import type { BackupEngine } from '@/core/backup/engines/base-engine';
```

### Tratamento de Erros

- Erros da camada de API devem ser instâncias de `AppError` com um `errorCode` e `statusCode`
- Nunca exponha stack traces em produção (`NODE_ENV=production`)
- Use o middleware `error-handler.ts` centralizado

```typescript
// ✅ Lançar erros tipados
throw new AppError('CONNECTION_FAILED', 400, `Não foi possível conectar: ${err.message}`);

// ❌ Lançar erros genéricos direto na rota
throw new Error('deu ruim');
```

### Validação com Zod

Toda entrada de dados (request body, query params) deve ser validada com Zod:

```typescript
import { z } from 'zod';

const createDatasourceSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['postgres', 'mysql', 'mongodb', 'sqlserver', 'sqlite', 'files']),
  connection_config: z.record(z.unknown()),
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
});
```

---

## Executando em Desenvolvimento

### Scripts npm disponíveis

| Script                  | Descrição                                           |
|-------------------------|-----------------------------------------------------|
| `npm run dev`           | Inicia com hot-reload (`tsx watch`)                 |
| `npm run build`         | Compila TypeScript para `dist/`                     |
| `npm start`             | Executa o build compilado (`node dist/index.js`)    |
| `npm test`              | Executa todos os testes (Vitest)                    |
| `npm run test:unit`     | Apenas testes unitários                             |
| `npm run test:coverage` | Testes com relatório de cobertura                   |
| `npm run lint`          | ESLint em todo o projeto                            |
| `npm run format`        | Prettier em todo o projeto                          |
| `npm run typecheck`     | TypeScript sem emitir arquivos (`tsc --noEmit`)     |
| `npm run db:generate`   | Gera o Prisma Client após alterar schema            |
| `npm run db:migrate`    | Cria e aplica uma nova migration (dev)              |
| `npm run db:deploy`     | Aplica migrations pendentes (produção)              |
| `npm run db:studio`     | Abre o Prisma Studio (GUI do banco)                 |
| `npm run db:seed`       | Popula o banco com dados de seed                    |

### Variáveis de ambiente para desenvolvimento

```env
NODE_ENV=development
LOG_LEVEL=debug       # Mostra todos os logs, inclusive debug
DATABASE_URL=postgresql://backup:backup123@localhost:5432/backup_manager_dev
REDIS_URL=redis://localhost:6379
```

### Inspecionando as Filas

Com o **Bull Board** (se habilitado em desenvolvimento), acesse:

```
http://localhost:3000/admin/queues
```

Permite visualizar jobs pendentes, em execução, concluídos e com falha.

---

## Testes

### Estrutura de Testes

```
tests/
├── unit/
│   ├── engines/
│   │   ├── postgres-engine.test.ts
│   │   ├── mysql-engine.test.ts
│   │   └── files-engine.test.ts
│   ├── storage/
│   │   ├── local-adapter.test.ts
│   │   └── s3-adapter.test.ts
│   └── retention/
│       └── cleanup-manager.test.ts
│
└── integration/
    ├── api/
    │   ├── datasources.test.ts
    │   ├── backup-jobs.test.ts
    │   └── executions.test.ts
    └── workers/
        ├── backup-worker.test.ts
        └── scheduler-worker.test.ts
```

### Framework de Testes

O projeto usa **Vitest** (rápido, compatível com a API do Jest):

```bash
# Roda todos os testes
npm test

# Watch mode
npm run test:watch

# Com coverage
npm run test:coverage
```

### Testes Unitários — Padrão

```typescript
// tests/unit/retention/cleanup-manager.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CleanupManager } from '@/core/retention/cleanup-manager';

describe('CleanupManager', () => {
  describe('applyGFSPolicy', () => {
    it('deve manter os últimos 7 backups diários', () => {
      const executions = generateMockExecutions(30);
      const policy = { keep_daily: 7, keep_weekly: 4, keep_monthly: 12 };

      const toDelete = CleanupManager.applyGFSPolicy(executions, policy);

      expect(toDelete.length).toBe(30 - (7 + 4 + 12));
    });
  });
});
```

### Testes de Integração — Configuração

Os testes de integração sobem um banco PostgreSQL e Redis via Docker automaticamente usando **`testcontainers`**:

```typescript
// tests/integration/api/datasources.test.ts
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let dbContainer: PostgreSqlContainer;

beforeAll(async () => {
  dbContainer = await new PostgreSqlContainer().start();
  process.env.DATABASE_URL = dbContainer.getConnectionUri();
  // ... inicializa a app
});

afterAll(async () => {
  await dbContainer.stop();
});
```

---

## Adicionando Novos Backup Engines

Para suportar um novo tipo de banco de dados, crie um novo engine em `src/core/backup/engines/`.

### 1. Implemente a interface base

```typescript
// src/core/backup/engines/base-engine.ts
export interface IBackupEngine {
  /**
   * Executa o backup e retorna um ReadableStream com os dados.
   * O stream é passado para o compressor e depois para o storage adapter.
   */
  backup(config: BackupEngineConfig): Promise<NodeJS.ReadableStream>;

  /**
   * Restaura um backup a partir de um ReadableStream.
   */
  restore(stream: NodeJS.ReadableStream, config: BackupEngineConfig): Promise<void>;

  /**
   * Testa a conectividade com o datasource.
   */
  testConnection(connectionConfig: ConnectionConfig): Promise<HealthCheckResult>;

  /**
   * Retorna os metadados do banco (versão, tabelas, etc.).
   */
  getMetadata(connectionConfig: ConnectionConfig): Promise<BackupMetadata>;
}
```

### 2. Crie o arquivo do engine

```typescript
// src/core/backup/engines/oracle-engine.ts
import { IBackupEngine } from './base-engine';

export class OracleEngine implements IBackupEngine {
  async backup(config: BackupEngineConfig): Promise<NodeJS.ReadableStream> {
    // Use expdp ou outra ferramenta de dump do Oracle
    const process = spawn('expdp', [
      `${config.username}/${config.password}@${config.host}:${config.port}/${config.database}`,
      `DIRECTORY=DATA_PUMP_DIR`,
      `DUMPFILE=backup_${Date.now()}.dmp`,
    ]);
    return process.stdout;
  }

  async testConnection(config: ConnectionConfig): Promise<HealthCheckResult> {
    // Implementar teste de conexão Oracle
  }

  async getMetadata(config: ConnectionConfig): Promise<BackupMetadata> {
    // Implementar coleta de metadados
  }
}
```

### 3. Registre o engine no Executor

```typescript
// src/core/backup/executor.ts
import { OracleEngine } from './engines/oracle-engine';

const ENGINE_MAP: Record<DatasourceType, IBackupEngine> = {
  postgres: new PostgresEngine(),
  mysql: new MySQLEngine(),
  mongodb: new MongoDBEngine(),
  sqlserver: new SQLServerEngine(),
  sqlite: new SQLiteEngine(),
  files: new FilesEngine(),
  oracle: new OracleEngine(),   // ← Adicione aqui
};
```

### 4. Atualize os tipos

```typescript
// src/types/datasource.types.ts
export type DatasourceType =
  | 'postgres'
  | 'mysql'
  | 'mongodb'
  | 'sqlserver'
  | 'sqlite'
  | 'files'
  | 'oracle';   // ← Adicione aqui
```

### 5. Atualize o schema Prisma

```prisma
// prisma/schema.prisma
enum DatasourceType {
  postgres
  mysql
  mongodb
  sqlserver
  sqlite
  files
  oracle    // ← Adicione aqui
}
```

Crie a migration:

```bash
npx prisma migrate dev --name add-oracle-datasource-type
```

---

## Adicionando Novos Storage Adapters

Para suportar um novo destino de storage, crie um novo adapter em `src/core/storage/adapters/`.

### 1. Implemente a interface base

```typescript
// src/core/storage/adapters/base-adapter.ts
export interface IStorageAdapter {
  upload(stream: NodeJS.ReadableStream, remotePath: string): Promise<void>;
  download(remotePath: string): Promise<NodeJS.ReadableStream>;
  delete(remotePath: string): Promise<void>;
  list(prefix: string): Promise<StorageFile[]>;
  exists(remotePath: string): Promise<boolean>;
  checkSpace(): Promise<StorageSpace>;
  testConnection(): Promise<void>;
}
```

### 2. Crie o arquivo do adapter

```typescript
// src/core/storage/adapters/ftp-adapter.ts
import { IStorageAdapter } from './base-adapter';
import { Client as FTPClient } from 'basic-ftp';

export class FTPAdapter implements IStorageAdapter {
  private config: FTPConfig;

  constructor(config: FTPConfig) {
    this.config = config;
  }

  async upload(stream: NodeJS.ReadableStream, remotePath: string): Promise<void> {
    const client = new FTPClient();
    await client.access({
      host: this.config.host,
      user: this.config.username,
      password: this.config.password,
    });
    await client.uploadFrom(stream, remotePath);
    client.close();
  }

  // ... implementar demais métodos
}
```

### 3. Registre no Storage Factory

```typescript
// src/core/storage/storage-factory.ts
import { FTPAdapter } from './adapters/ftp-adapter';

export function createStorageAdapter(location: StorageLocation): IStorageAdapter {
  switch (location.type) {
    case 'local':    return new LocalAdapter(location.config);
    case 's3':       return new S3Adapter(location.config);
    case 'ssh':      return new SSHAdapter(location.config);
    case 'minio':    return new MinIOAdapter(location.config);
    case 'backblaze':return new BackblazeAdapter(location.config);
    case 'ftp':      return new FTPAdapter(location.config);  // ← Adicione aqui
    default:
      throw new AppError('UNSUPPORTED_STORAGE_TYPE', 400, `Tipo '${location.type}' não suportado`);
  }
}
```

---

## Fluxo de Workers e Filas

### Filas BullMQ

| Fila              | Producer             | Consumer             | Descrição                    |
|-------------------|----------------------|----------------------|------------------------------|
| `backup-queue`    | SchedulerWorker, API | BackupWorker         | Execuções de backup          |
| `health-queue`    | HealthWorker         | HealthWorker         | Health checks periódicos     |
| `cleanup-queue`   | CleanupWorker (cron) | CleanupWorker        | Limpeza de backups expirados |
| `notification-queue` | BackupWorker, HealthWorker | NotificationWorker | Envio de alertas         |

### Adicionando um Novo Worker

```typescript
// src/workers/meu-worker.ts
import { Worker, Job } from 'bullmq';
import { redisClient } from '@/queue/redis-client';
import { logger } from '@/utils/logger';

export function startMeuWorker() {
  const worker = new Worker(
    'minha-fila',
    async (job: Job) => {
      logger.info({ jobId: job.id }, 'Processando job');
      // ... lógica do worker
    },
    {
      connection: redisClient,
      concurrency: 2,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job falhou');
  });

  return worker;
}
```

Registre o worker no `src/index.ts`:

```typescript
import { startMeuWorker } from './workers/meu-worker';

// Na função de inicialização:
startMeuWorker();
```

---

## Scripts Úteis

```bash
# ── Banco de Dados ──────────────────────────────────────────
# Instalar dependências
npm install

# Gerar o Prisma Client após alterar schema.prisma
npm run db:generate

# Criar e aplicar uma migration (dev)
npm run db:migrate

# Resetar o banco de desenvolvimento (APAGA TUDO)
npx prisma migrate reset --force

# Abrir o Prisma Studio (GUI para o banco)
npm run db:studio

# Verificar status das migrations
npx prisma migrate status

# Formatar o schema.prisma
npx prisma format

# ── Desenvolvimento ──────────────────────────────────────────
# Iniciar em modo desenvolvimento (hot-reload)
npm run dev

# Build de produção
npm run build

# Verificar tipos sem compilar
npm run typecheck

# ── Redis (quando workers estiverem ativos) ──────────────────
# Ver todos os jobs na fila Redis
redis-cli -u "$REDIS_URL" lrange backup-queue 0 -1

# Limpar todas as filas Redis (dev apenas)
redis-cli -u "$REDIS_URL" FLUSHDB

# ── Testar a API após iniciar ────────────────────────────────
# Status do sistema
curl http://localhost:3000/api/health | jq

# Criar um datasource PostgreSQL
curl -X POST http://localhost:3000/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Banco Dev",
    "type": "postgres",
    "connection_config": {
      "host": "localhost",
      "port": 5432,
      "database": "myapp",
      "username": "postgres",
      "password": "senha"
    },
    "tags": ["dev"]
  }' | jq

# Listar datasources
curl http://localhost:3000/api/datasources | jq
```
