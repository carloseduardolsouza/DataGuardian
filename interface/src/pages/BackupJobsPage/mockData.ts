// ── Types ─────────────────────────────────────────────────────────

export type JobStatus  = 'success' | 'running' | 'failed' | 'never';
export type BackupType = 'full' | 'incremental' | 'differential';
export type Frequency  = 'daily' | 'weekly' | 'monthly';

export interface StorageTarget {
  storageId:  string;
  order:      number;   // 1 = primário, 2+ = réplicas
  replicate:  boolean;  // true = copiar para todos, false = só primário
}

export interface JobSchedule {
  frequency:   Frequency;
  hour:        number;    // 0–23
  minute:      number;    // 0 ou 30
  daysOfWeek?: number[];  // 0=Dom … 6=Sáb (só frequency=weekly)
  dayOfMonth?: number;    // 1–28 (só frequency=monthly)
}

export interface RetentionPolicy {
  daily:   number;  // guardar N backups diários
  weekly:  number;  // guardar N backups semanais
  monthly: number;  // guardar N backups mensais
}

export interface LastExecution {
  status:          JobStatus;
  startedAt:       string;   // ISO
  completedAt:     string | null;
  sizeBytes:       number | null;
  durationSeconds: number | null;
}

export interface MockBackupJob {
  id:              string;
  name:            string;
  enabled:         boolean;
  datasourceId:    string;
  storageTargets:  StorageTarget[];
  schedule:        JobSchedule;
  backupType:      BackupType;
  retention:       RetentionPolicy;
  lastExecution:   LastExecution | null;
  nextExecutionAt: string;   // ISO
  createdAt:       string;   // ISO
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

export function scheduleLabel(s: JobSchedule): string {
  const hm = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  if (s.frequency === 'daily')   return `Diário às ${hm}`;
  if (s.frequency === 'monthly') return `Mensal, dia ${s.dayOfMonth ?? 1} às ${hm}`;
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const labels = (s.daysOfWeek ?? [1]).map(d => days[d]).join(', ');
  return `Semanal, ${labels} às ${hm}`;
}

export function nextRunLabel(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = d.getTime() - now.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 0)    return 'Atrasado';
  if (mins < 60)   return `Em ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `Em ${hrs}h`;
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${date} às ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export function lastRunLabel(exec: LastExecution): string {
  const d    = new Date(exec.startedAt);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)   return 'agora';
  if (mins < 60)  return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

// ── Mock jobs ─────────────────────────────────────────────────────

export const MOCK_BACKUP_JOBS: MockBackupJob[] = [
  {
    id:           'job-001',
    name:         'Postgres — Backup Diário',
    enabled:      true,
    datasourceId: 'ds-001',
    storageTargets: [
      { storageId: 'sl-001', order: 1, replicate: true  },
      { storageId: 'sl-002', order: 2, replicate: true  },
      { storageId: 'sl-003', order: 3, replicate: false },
    ],
    schedule:   { frequency: 'daily', hour: 2, minute: 0 },
    backupType: 'full',
    retention:  { daily: 7, weekly: 4, monthly: 12 },
    lastExecution: {
      status:          'success',
      startedAt:       '2026-02-18T02:00:12Z',
      completedAt:     '2026-02-18T02:04:24Z',
      sizeBytes:       1_288_490_189,
      durationSeconds: 252,
    },
    nextExecutionAt: '2026-02-19T02:00:00Z',
    createdAt:       '2025-10-01T10:00:00Z',
  },
  {
    id:           'job-002',
    name:         'MySQL — Staging Noturno',
    enabled:      true,
    datasourceId: 'ds-002',
    storageTargets: [
      { storageId: 'sl-001', order: 1, replicate: true  },
      { storageId: 'sl-004', order: 2, replicate: false },
    ],
    schedule:   { frequency: 'daily', hour: 3, minute: 30 },
    backupType: 'incremental',
    retention:  { daily: 5, weekly: 3, monthly: 6 },
    lastExecution: {
      status:          'success',
      startedAt:       '2026-02-18T03:30:22Z',
      completedAt:     '2026-02-18T03:32:00Z',
      sizeBytes:       471_859_200,
      durationSeconds: 98,
    },
    nextExecutionAt: '2026-02-19T03:30:00Z',
    createdAt:       '2025-10-15T10:00:00Z',
  },
  {
    id:           'job-003',
    name:         'MongoDB — Backup por Hora',
    enabled:      true,
    datasourceId: 'ds-004',
    storageTargets: [
      { storageId: 'sl-002', order: 1, replicate: false },
    ],
    schedule:   { frequency: 'daily', hour: 0, minute: 0 },
    backupType: 'incremental',
    retention:  { daily: 3, weekly: 2, monthly: 3 },
    lastExecution: {
      status:          'running',
      startedAt:       '2026-02-18T14:00:00Z',
      completedAt:     null,
      sizeBytes:       null,
      durationSeconds: null,
    },
    nextExecutionAt: '2026-02-18T15:00:00Z',
    createdAt:       '2025-11-01T10:00:00Z',
  },
  {
    id:           'job-004',
    name:         'SQLite — Backup Semanal',
    enabled:      false,
    datasourceId: 'ds-003',
    storageTargets: [
      { storageId: 'sl-001', order: 1, replicate: false },
    ],
    schedule:   { frequency: 'weekly', hour: 4, minute: 0, daysOfWeek: [0] },
    backupType: 'full',
    retention:  { daily: 0, weekly: 4, monthly: 3 },
    lastExecution: {
      status:          'failed',
      startedAt:       '2026-01-05T04:00:05Z',
      completedAt:     '2026-01-05T04:00:09Z',
      sizeBytes:       null,
      durationSeconds: 4,
    },
    nextExecutionAt: '2026-02-22T04:00:00Z',
    createdAt:       '2025-11-15T10:00:00Z',
  },
  {
    id:           'job-005',
    name:         'Postgres — Snapshot Mensal',
    enabled:      true,
    datasourceId: 'ds-001',
    storageTargets: [
      { storageId: 'sl-003', order: 1, replicate: true  },
      { storageId: 'sl-005', order: 2, replicate: true  },
    ],
    schedule:   { frequency: 'monthly', hour: 1, minute: 0, dayOfMonth: 1 },
    backupType: 'full',
    retention:  { daily: 0, weekly: 0, monthly: 24 },
    lastExecution: {
      status:          'success',
      startedAt:       '2026-02-01T01:00:00Z',
      completedAt:     '2026-02-01T01:06:30Z',
      sizeBytes:       1_350_000_000,
      durationSeconds: 390,
    },
    nextExecutionAt: '2026-03-01T01:00:00Z',
    createdAt:       '2025-10-01T11:00:00Z',
  },
];

// ── Datasources e storages resumidos para os selects do formulário ─

export interface DsOption  { id: string; name: string; type: string; status: string; }
export interface SlOption  { id: string; name: string; type: string; }

export const DS_OPTIONS: DsOption[] = [
  { id: 'ds-001', name: 'Postgres Produção', type: 'postgres', status: 'healthy' },
  { id: 'ds-002', name: 'MySQL Staging',     type: 'mysql',    status: 'warning' },
  { id: 'ds-003', name: 'SQLite Local',      type: 'sqlite',   status: 'critical' },
  { id: 'ds-004', name: 'MongoDB Atlas',     type: 'mongodb',  status: 'unknown' },
];

export const SL_OPTIONS: SlOption[] = [
  { id: 'sl-001', name: 'Servidor Local', type: 'local'     },
  { id: 'sl-002', name: 'NAS via SSH',    type: 'ssh'       },
  { id: 'sl-003', name: 'Amazon S3',      type: 's3'        },
  { id: 'sl-004', name: 'MinIO Interno',  type: 'minio'     },
  { id: 'sl-005', name: 'Backblaze B2',   type: 'backblaze' },
];
