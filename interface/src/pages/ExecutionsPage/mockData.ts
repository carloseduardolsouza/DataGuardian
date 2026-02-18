// ── Types ─────────────────────────────────────────────────────────

export type ExecStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'queued';
export type LogLevel   = 'info' | 'warn' | 'error' | 'debug' | 'success';

export interface LogEntry {
  ts:      string;   // ISO
  level:   LogLevel;
  message: string;
}

export interface MockExecution {
  id:              string;
  jobId:           string;
  jobName:         string;
  datasourceId:    string;
  datasourceName:  string;
  datasourceType:  string;
  storageNames:    string[];
  status:          ExecStatus;
  startedAt:       string;    // ISO
  completedAt:     string | null;
  durationSeconds: number | null;
  sizeBytes:       number | null;
  progress:        number | null;  // 0–100, só quando running
  errorMessage:    string | null;
  logs:            LogEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function formatDuration(secs: number): string {
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

// ── Log factory ───────────────────────────────────────────────────

function log(ts: string, level: LogLevel, message: string): LogEntry {
  return { ts, level, message };
}

// ── Log templates ─────────────────────────────────────────────────

const PG_SUCCESS_LOGS: LogEntry[] = [
  log('2026-02-18T02:00:12Z', 'info',    'Job iniciado: Postgres — Backup Diário'),
  log('2026-02-18T02:00:13Z', 'info',    'Conectando ao datasource postgres://prod-db:5432/appdb...'),
  log('2026-02-18T02:00:14Z', 'success', 'Conexão estabelecida. Versão: PostgreSQL 16.1'),
  log('2026-02-18T02:00:14Z', 'info',    'Iniciando dump completo com pg_dump'),
  log('2026-02-18T02:00:15Z', 'debug',   'Opções: --format=custom --compress=9 --no-password'),
  log('2026-02-18T02:01:02Z', 'info',    'Dump em andamento... 256 MB copiados'),
  log('2026-02-18T02:02:10Z', 'info',    'Dump em andamento... 768 MB copiados'),
  log('2026-02-18T02:03:30Z', 'info',    'Dump concluído. Tamanho bruto: 1.48 GB'),
  log('2026-02-18T02:03:30Z', 'info',    'Comprimindo arquivo: pg_prod_daily_2026-02-18.tar.gz'),
  log('2026-02-18T02:03:45Z', 'success', 'Compressão concluída. Tamanho final: 1.20 GB'),
  log('2026-02-18T02:03:45Z', 'info',    'Enviando para Servidor Local (/backups)...'),
  log('2026-02-18T02:04:10Z', 'success', 'Upload para Servidor Local concluído'),
  log('2026-02-18T02:04:10Z', 'info',    'Replicando para NAS via SSH...'),
  log('2026-02-18T02:04:22Z', 'success', 'Replicação para NAS via SSH concluída'),
  log('2026-02-18T02:04:24Z', 'info',    'Aplicando política de retenção: 7 diários, 4 semanais, 12 mensais'),
  log('2026-02-18T02:04:24Z', 'info',    'Backups removidos pela retenção: 0'),
  log('2026-02-18T02:04:24Z', 'success', 'Job concluído com sucesso em 4m 12s. Total: 1.20 GB'),
];

const MYSQL_SUCCESS_LOGS: LogEntry[] = [
  log('2026-02-18T03:30:22Z', 'info',    'Job iniciado: MySQL — Staging Noturno'),
  log('2026-02-18T03:30:23Z', 'info',    'Conectando ao datasource mysql://staging-db:3306/staging...'),
  log('2026-02-18T03:30:24Z', 'success', 'Conexão estabelecida. Versão: MySQL 8.0.35'),
  log('2026-02-18T03:30:24Z', 'info',    'Backup incremental: verificando último checkpoint...'),
  log('2026-02-18T03:30:25Z', 'debug',   'Último backup completo: 2026-02-17T03:30:22Z'),
  log('2026-02-18T03:30:25Z', 'info',    'Iniciando dump incremental com mysqldump'),
  log('2026-02-18T03:31:00Z', 'info',    'Dump em andamento... 128 MB copiados'),
  log('2026-02-18T03:31:30Z', 'info',    'Dump concluído. Tamanho bruto: 512 MB'),
  log('2026-02-18T03:31:40Z', 'success', 'Compressão concluída. Tamanho final: 450 MB'),
  log('2026-02-18T03:31:45Z', 'info',    'Enviando para Servidor Local...'),
  log('2026-02-18T03:31:55Z', 'success', 'Upload concluído'),
  log('2026-02-18T03:32:00Z', 'success', 'Job concluído com sucesso em 1m 38s. Total: 450 MB'),
];

const SQLITE_FAILED_LOGS: LogEntry[] = [
  log('2026-01-05T04:00:05Z', 'info',    'Job iniciado: SQLite — Backup Semanal'),
  log('2026-01-05T04:00:06Z', 'info',    'Conectando ao datasource sqlite:///var/data/app.db...'),
  log('2026-01-05T04:00:06Z', 'error',   'ERRO: arquivo de banco de dados não encontrado: /var/data/app.db'),
  log('2026-01-05T04:00:07Z', 'warn',    'Verificando permissões de acesso ao diretório /var/data/...'),
  log('2026-01-05T04:00:07Z', 'error',   'ERRO: Permission denied ao acessar /var/data/'),
  log('2026-01-05T04:00:08Z', 'debug',   'UID do processo: 1001 (backup-agent)'),
  log('2026-01-05T04:00:08Z', 'debug',   'Proprietário do arquivo: 1000 (app-user)'),
  log('2026-01-05T04:00:09Z', 'error',   'Job abortado após 3 tentativas. Verifique permissões do usuário backup-agent.'),
];

const PG_MONTHLY_LOGS: LogEntry[] = [
  log('2026-02-01T01:00:00Z', 'info',    'Job iniciado: Postgres — Snapshot Mensal'),
  log('2026-02-01T01:00:01Z', 'info',    'Conectando ao datasource postgres://prod-db:5432/appdb...'),
  log('2026-02-01T01:00:02Z', 'success', 'Conexão estabelecida'),
  log('2026-02-01T01:00:02Z', 'info',    'Backup completo agendado (snapshot mensal)'),
  log('2026-02-01T01:01:10Z', 'info',    'Dump em andamento... 512 MB copiados'),
  log('2026-02-01T01:02:20Z', 'info',    'Dump em andamento... 1.0 GB copiados'),
  log('2026-02-01T01:04:00Z', 'info',    'Dump concluído. Tamanho bruto: 1.55 GB'),
  log('2026-02-01T01:04:30Z', 'success', 'Compressão concluída. Tamanho final: 1.26 GB'),
  log('2026-02-01T01:04:30Z', 'info',    'Enviando para Amazon S3 (us-east-1)...'),
  log('2026-02-01T01:05:50Z', 'success', 'Upload para Amazon S3 concluído'),
  log('2026-02-01T01:05:50Z', 'info',    'Replicando para Backblaze B2...'),
  log('2026-02-01T01:06:20Z', 'success', 'Replicação para Backblaze B2 concluída'),
  log('2026-02-01T01:06:30Z', 'success', 'Job concluído com sucesso em 6m 30s. Total: 1.26 GB'),
];

const PG_PREV_LOGS: LogEntry[] = [
  log('2026-02-17T02:00:10Z', 'info',    'Job iniciado: Postgres — Backup Diário'),
  log('2026-02-17T02:00:11Z', 'success', 'Conexão estabelecida. Versão: PostgreSQL 16.1'),
  log('2026-02-17T02:00:11Z', 'info',    'Iniciando dump completo'),
  log('2026-02-17T02:02:58Z', 'warn',    'Latência alta detectada na conexão com o storage NAS (145ms > 100ms)'),
  log('2026-02-17T02:03:50Z', 'success', 'Dump e compressão concluídos. Tamanho: 1.15 GB'),
  log('2026-02-17T02:04:05Z', 'success', 'Upload para Servidor Local concluído'),
  log('2026-02-17T02:04:08Z', 'warn',    'NAS via SSH: latência elevada, mas conexão estável'),
  log('2026-02-17T02:04:18Z', 'success', 'Upload para NAS via SSH concluído'),
  log('2026-02-17T02:04:20Z', 'success', 'Job concluído com sucesso em 4m 10s. Total: 1.15 GB'),
];

const MYSQL_CANCELLED_LOGS: LogEntry[] = [
  log('2026-02-16T03:30:10Z', 'info',    'Job iniciado: MySQL — Staging Noturno'),
  log('2026-02-16T03:30:11Z', 'success', 'Conexão estabelecida'),
  log('2026-02-16T03:30:12Z', 'info',    'Iniciando dump incremental'),
  log('2026-02-16T03:45:00Z', 'warn',    'Sinal de cancelamento recebido pelo usuário admin'),
  log('2026-02-16T03:45:01Z', 'warn',    'Interrompendo dump em andamento...'),
  log('2026-02-16T03:45:02Z', 'info',    'Limpando arquivos temporários...'),
  log('2026-02-16T03:45:03Z', 'info',    'Job cancelado pelo usuário. Nenhum arquivo foi salvo.'),
];

const RUNNING_LOGS: LogEntry[] = [
  log('2026-02-18T14:00:02Z', 'info',    'Job iniciado: MongoDB — Backup por Hora'),
  log('2026-02-18T14:00:03Z', 'info',    'Conectando ao datasource mongodb+srv://atlas.mongodb.net/appdb...'),
  log('2026-02-18T14:00:05Z', 'success', 'Conexão estabelecida. Versão: MongoDB 7.0'),
  log('2026-02-18T14:00:05Z', 'info',    'Iniciando dump com mongodump'),
  log('2026-02-18T14:00:30Z', 'debug',   'Collections encontradas: 14'),
  log('2026-02-18T14:01:00Z', 'info',    'Progresso: 3/14 collections exportadas (21%)'),
  log('2026-02-18T14:02:00Z', 'info',    'Progresso: 7/14 collections exportadas (50%)'),
  log('2026-02-18T14:03:00Z', 'info',    'Progresso: 11/14 collections exportadas (78%)'),
];

// ── Mock executions ───────────────────────────────────────────────

export const MOCK_EXECUTIONS: MockExecution[] = [
  {
    id: 'exec-001',
    jobId: 'job-003', jobName: 'MongoDB — Backup por Hora',
    datasourceId: 'ds-004', datasourceName: 'MongoDB Atlas', datasourceType: 'mongodb',
    storageNames: ['NAS via SSH'],
    status: 'running',
    startedAt: '2026-02-18T14:00:02Z', completedAt: null,
    durationSeconds: null, sizeBytes: null, progress: 78,
    errorMessage: null, logs: RUNNING_LOGS,
  },
  {
    id: 'exec-002',
    jobId: 'job-001', jobName: 'Postgres — Backup Diário',
    datasourceId: 'ds-001', datasourceName: 'Postgres Produção', datasourceType: 'postgres',
    storageNames: ['Servidor Local', 'NAS via SSH'],
    status: 'completed',
    startedAt: '2026-02-18T02:00:12Z', completedAt: '2026-02-18T02:04:24Z',
    durationSeconds: 252, sizeBytes: 1_288_490_189, progress: 100,
    errorMessage: null, logs: PG_SUCCESS_LOGS,
  },
  {
    id: 'exec-003',
    jobId: 'job-002', jobName: 'MySQL — Staging Noturno',
    datasourceId: 'ds-002', datasourceName: 'MySQL Staging', datasourceType: 'mysql',
    storageNames: ['Servidor Local', 'MinIO Interno'],
    status: 'completed',
    startedAt: '2026-02-18T03:30:22Z', completedAt: '2026-02-18T03:32:00Z',
    durationSeconds: 98, sizeBytes: 471_859_200, progress: 100,
    errorMessage: null, logs: MYSQL_SUCCESS_LOGS,
  },
  {
    id: 'exec-004',
    jobId: 'job-001', jobName: 'Postgres — Backup Diário',
    datasourceId: 'ds-001', datasourceName: 'Postgres Produção', datasourceType: 'postgres',
    storageNames: ['Servidor Local', 'NAS via SSH'],
    status: 'completed',
    startedAt: '2026-02-17T02:00:10Z', completedAt: '2026-02-17T02:04:20Z',
    durationSeconds: 250, sizeBytes: 1_235_000_000, progress: 100,
    errorMessage: null, logs: PG_PREV_LOGS,
  },
  {
    id: 'exec-005',
    jobId: 'job-002', jobName: 'MySQL — Staging Noturno',
    datasourceId: 'ds-002', datasourceName: 'MySQL Staging', datasourceType: 'mysql',
    storageNames: ['Servidor Local', 'MinIO Interno'],
    status: 'cancelled',
    startedAt: '2026-02-16T03:30:10Z', completedAt: '2026-02-16T03:45:03Z',
    durationSeconds: 893, sizeBytes: null, progress: null,
    errorMessage: null, logs: MYSQL_CANCELLED_LOGS,
  },
  {
    id: 'exec-006',
    jobId: 'job-004', jobName: 'SQLite — Backup Semanal',
    datasourceId: 'ds-003', datasourceName: 'SQLite Local', datasourceType: 'sqlite',
    storageNames: ['Servidor Local'],
    status: 'failed',
    startedAt: '2026-01-05T04:00:05Z', completedAt: '2026-01-05T04:00:09Z',
    durationSeconds: 4, sizeBytes: null, progress: null,
    errorMessage: 'Permission denied ao acessar /var/data/. Verifique as permissões do usuário backup-agent.',
    logs: SQLITE_FAILED_LOGS,
  },
  {
    id: 'exec-007',
    jobId: 'job-005', jobName: 'Postgres — Snapshot Mensal',
    datasourceId: 'ds-001', datasourceName: 'Postgres Produção', datasourceType: 'postgres',
    storageNames: ['Amazon S3', 'Backblaze B2'],
    status: 'completed',
    startedAt: '2026-02-01T01:00:00Z', completedAt: '2026-02-01T01:06:30Z',
    durationSeconds: 390, sizeBytes: 1_350_000_000, progress: 100,
    errorMessage: null, logs: PG_MONTHLY_LOGS,
  },
  {
    id: 'exec-008',
    jobId: 'job-001', jobName: 'Postgres — Backup Diário',
    datasourceId: 'ds-001', datasourceName: 'Postgres Produção', datasourceType: 'postgres',
    storageNames: ['Servidor Local', 'NAS via SSH'],
    status: 'completed',
    startedAt: '2026-02-16T02:00:08Z', completedAt: '2026-02-16T02:04:09Z',
    durationSeconds: 241, sizeBytes: 1_198_000_000, progress: 100,
    errorMessage: null,
    logs: PG_PREV_LOGS.map(l => ({ ...l, ts: l.ts.replace('02-17', '02-16') })),
  },
  {
    id: 'exec-009',
    jobId: 'job-002', jobName: 'MySQL — Staging Noturno',
    datasourceId: 'ds-002', datasourceName: 'MySQL Staging', datasourceType: 'mysql',
    storageNames: ['Servidor Local'],
    status: 'completed',
    startedAt: '2026-02-15T03:30:00Z', completedAt: '2026-02-15T03:31:45Z',
    durationSeconds: 105, sizeBytes: 462_000_000, progress: 100,
    errorMessage: null,
    logs: MYSQL_SUCCESS_LOGS.map(l => ({ ...l, ts: l.ts.replace('02-18', '02-15') })),
  },
  {
    id: 'exec-010',
    jobId: 'job-001', jobName: 'Postgres — Backup Diário',
    datasourceId: 'ds-001', datasourceName: 'Postgres Produção', datasourceType: 'postgres',
    storageNames: ['Servidor Local', 'NAS via SSH'],
    status: 'completed',
    startedAt: '2026-02-15T02:00:05Z', completedAt: '2026-02-15T02:04:09Z',
    durationSeconds: 244, sizeBytes: 1_180_000_000, progress: 100,
    errorMessage: null,
    logs: PG_PREV_LOGS.map(l => ({ ...l, ts: l.ts.replace('02-17', '02-15') })),
  },
  {
    id: 'exec-011',
    jobId: 'job-003', jobName: 'MongoDB — Backup por Hora',
    datasourceId: 'ds-004', datasourceName: 'MongoDB Atlas', datasourceType: 'mongodb',
    storageNames: ['NAS via SSH'],
    status: 'completed',
    startedAt: '2026-02-18T13:00:00Z', completedAt: '2026-02-18T13:04:10Z',
    durationSeconds: 250, sizeBytes: 318_000_000, progress: 100,
    errorMessage: null,
    logs: RUNNING_LOGS.slice(0, 6).map(l => ({ ...l, ts: l.ts.replace('14:', '13:') })),
  },
  {
    id: 'exec-012',
    jobId: 'job-001', jobName: 'Postgres — Backup Diário',
    datasourceId: 'ds-001', datasourceName: 'Postgres Produção', datasourceType: 'postgres',
    storageNames: ['Servidor Local', 'NAS via SSH'],
    status: 'failed',
    startedAt: '2026-02-14T02:00:05Z', completedAt: '2026-02-14T02:05:33Z',
    durationSeconds: 328, sizeBytes: null, progress: null,
    errorMessage: 'Timeout de conexão com NAS via SSH após 300s. Host 192.168.1.100 inacessível.',
    logs: [
      ...PG_SUCCESS_LOGS.slice(0, 9).map(l => ({ ...l, ts: l.ts.replace('02-18', '02-14') })),
      log('2026-02-14T02:04:45Z', 'warn',  'Tentando conectar ao NAS via SSH (192.168.1.100:22)...'),
      log('2026-02-14T02:05:15Z', 'warn',  'Timeout #1 — retentando em 10s...'),
      log('2026-02-14T02:05:30Z', 'error', 'ERRO: Connection timed out após 300s'),
      log('2026-02-14T02:05:33Z', 'error', 'Job abortado. Arquivo de backup local preservado, replicação falhou.'),
    ],
  },
];

// ── Opções de filtro ──────────────────────────────────────────────

export const DS_FILTER_OPTIONS = [
  { id: '', name: 'Todos os bancos' },
  { id: 'ds-001', name: 'Postgres Produção' },
  { id: 'ds-002', name: 'MySQL Staging' },
  { id: 'ds-003', name: 'SQLite Local' },
  { id: 'ds-004', name: 'MongoDB Atlas' },
];
