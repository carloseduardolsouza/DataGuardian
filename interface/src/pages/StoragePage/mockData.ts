// ── Types ─────────────────────────────────────────────────────────

export type StorageType   = 'local' | 'ssh' | 's3' | 'minio' | 'backblaze';
export type StorageStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface MockFile {
  id:         string;
  name:       string;
  kind:       'file' | 'folder';
  sizeBytes:  number | null;  // null para pastas
  created:    string;         // ISO
  modified:   string;         // ISO
  path:       string;
  datasource?: string;
  children?:  MockFile[];     // somente para pastas
}

// ── Storage config types ──────────────────────────────────────────

export interface LocalConfig {
  type: 'local';
  path: string;
  maxSizeGb: number;
}

export interface SshConfig {
  type: 'ssh';
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
  remotePath: string;
}

export interface S3Config {
  type: 's3';
  endpoint: string;
  bucket: string;
  region: string;
  storageClass: 'STANDARD' | 'STANDARD_IA' | 'GLACIER' | 'DEEP_ARCHIVE';
  accessKeyId: string;
  secretAccessKey: string;
}

export interface MinioConfig {
  type: 'minio';
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  useSsl: boolean;
}

export interface BackblazeConfig {
  type: 'backblaze';
  bucketName: string;
  bucketId: string;
  applicationKeyId: string;
  applicationKey: string;
}

export type StorageConfig =
  | LocalConfig
  | SshConfig
  | S3Config
  | MinioConfig
  | BackblazeConfig;

export interface MockStorageLocation {
  id:         string;
  name:       string;
  type:       StorageType;
  status:     StorageStatus;
  isDefault:  boolean;
  lastCheck:  string;
  usedBytes:  number;
  totalBytes: number;  // 0 = ilimitado (cloud)
  latencyMs:  number | null;
  config:     StorageConfig;
  files:      MockFile[];
}

// ── Helpers ───────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

export function getLocationPath(loc: MockStorageLocation): string {
  switch (loc.config.type) {
    case 'local':    return loc.config.path;
    case 'ssh':      return `${loc.config.username}@${loc.config.host}:${loc.config.remotePath}`;
    case 's3':       return `s3://${loc.config.bucket} · ${loc.config.region}`;
    case 'minio':    return `${loc.config.endpoint}/${loc.config.bucket}`;
    case 'backblaze':return `b2://${loc.config.bucketName}`;
  }
}

export function getRootLabel(loc: MockStorageLocation): string {
  switch (loc.config.type) {
    case 'local':    return loc.config.path;
    case 'ssh':      return loc.config.remotePath;
    case 's3':       return `s3://${loc.config.bucket}`;
    case 'minio':    return `minio://${loc.config.bucket}`;
    case 'backblaze':return `b2://${loc.config.bucketName}`;
  }
}

// ── Mock file trees ───────────────────────────────────────────────

const PG_FILES: MockFile[] = [
  { id: 'f-pg-1', name: 'pg_prod_daily_2026-02-18.tar.gz', kind: 'file', sizeBytes: 1_288_490_189, created: '2026-02-18T02:04:12Z', modified: '2026-02-18T02:04:12Z', path: '/backups/postgres-producao/', datasource: 'Postgres Produção' },
  { id: 'f-pg-2', name: 'pg_prod_daily_2026-02-17.tar.gz', kind: 'file', sizeBytes: 1_235_000_000, created: '2026-02-17T02:03:58Z', modified: '2026-02-17T02:03:58Z', path: '/backups/postgres-producao/', datasource: 'Postgres Produção' },
  { id: 'f-pg-3', name: 'pg_prod_daily_2026-02-16.tar.gz', kind: 'file', sizeBytes: 1_198_000_000, created: '2026-02-16T02:04:01Z', modified: '2026-02-16T02:04:01Z', path: '/backups/postgres-producao/', datasource: 'Postgres Produção' },
  { id: 'f-pg-4', name: 'pg_prod_daily_2026-02-15.tar.gz', kind: 'file', sizeBytes: 1_180_000_000, created: '2026-02-15T02:03:44Z', modified: '2026-02-15T02:03:44Z', path: '/backups/postgres-producao/', datasource: 'Postgres Produção' },
  { id: 'f-pg-5', name: 'pg_prod_weekly_2026-02-09.tar.gz', kind: 'file', sizeBytes: 1_160_000_000, created: '2026-02-09T02:00:00Z', modified: '2026-02-09T02:00:00Z', path: '/backups/postgres-producao/', datasource: 'Postgres Produção' },
];

const MYSQL_FILES: MockFile[] = [
  { id: 'f-my-1', name: 'mysql_staging_2026-02-18.tar.gz', kind: 'file', sizeBytes: 471_859_200, created: '2026-02-18T03:31:44Z', modified: '2026-02-18T03:31:44Z', path: '/backups/mysql-staging/', datasource: 'MySQL Staging' },
  { id: 'f-my-2', name: 'mysql_staging_2026-02-17.tar.gz', kind: 'file', sizeBytes: 468_000_000, created: '2026-02-17T03:30:22Z', modified: '2026-02-17T03:30:22Z', path: '/backups/mysql-staging/', datasource: 'MySQL Staging' },
  { id: 'f-my-3', name: 'mysql_staging_2026-02-16.tar.gz', kind: 'file', sizeBytes: 462_000_000, created: '2026-02-16T03:29:11Z', modified: '2026-02-16T03:29:11Z', path: '/backups/mysql-staging/', datasource: 'MySQL Staging' },
];

const SQLITE_FILES: MockFile[] = [
  { id: 'f-sl-1', name: 'sqlite_backup_2026-01-05.tar.gz', kind: 'file', sizeBytes: 52_428_800, created: '2026-01-05T04:00:22Z', modified: '2026-01-05T04:00:22Z', path: '/backups/sqlite-local/', datasource: 'SQLite Local' },
];

// ── Mock storage locations ────────────────────────────────────────

export const MOCK_STORAGE_LOCATIONS: MockStorageLocation[] = [
  {
    id: 'sl-001',
    name: 'Servidor Local',
    type: 'local',
    status: 'healthy',
    isDefault: true,
    lastCheck: '2026-02-18T14:30:00Z',
    usedBytes:  42_949_672_960,   // ~40 GB
    totalBytes: 107_374_182_400,  // 100 GB
    latencyMs: 2,
    config: { type: 'local', path: '/backups', maxSizeGb: 100 },
    files: [
      { id: 'd-001', name: 'postgres-producao', kind: 'folder', sizeBytes: null, created: '2025-10-01T00:00:00Z', modified: '2026-02-18T02:04:12Z', path: '/backups/', children: PG_FILES },
      { id: 'd-002', name: 'mysql-staging',     kind: 'folder', sizeBytes: null, created: '2025-10-01T00:00:00Z', modified: '2026-02-18T03:31:44Z', path: '/backups/', children: MYSQL_FILES },
      { id: 'd-003', name: 'sqlite-local',      kind: 'folder', sizeBytes: null, created: '2025-11-15T00:00:00Z', modified: '2026-01-05T04:00:22Z', path: '/backups/', children: SQLITE_FILES },
    ],
  },
  {
    id: 'sl-002',
    name: 'NAS via SSH',
    type: 'ssh',
    status: 'healthy',
    isDefault: false,
    lastCheck: '2026-02-18T14:30:00Z',
    usedBytes:  214_748_364_800,   // 200 GB
    totalBytes: 2_199_023_255_552, // 2 TB
    latencyMs: 14,
    config: { type: 'ssh', host: '192.168.1.100', port: 22, username: 'backup-user', authMethod: 'key', remotePath: '/volume1/backups' },
    files: [
      {
        id: 'ssh-d-001', name: 'postgres-producao', kind: 'folder', sizeBytes: null,
        created: '2025-10-01T00:00:00Z', modified: '2026-02-18T02:10:00Z', path: '/volume1/backups/',
        children: PG_FILES.map(f => ({ ...f, path: '/volume1/backups/postgres-producao/' })),
      },
      {
        id: 'ssh-d-002', name: 'mysql-staging', kind: 'folder', sizeBytes: null,
        created: '2025-10-01T00:00:00Z', modified: '2026-02-18T03:35:00Z', path: '/volume1/backups/',
        children: MYSQL_FILES.map(f => ({ ...f, path: '/volume1/backups/mysql-staging/' })),
      },
    ],
  },
  {
    id: 'sl-003',
    name: 'Amazon S3',
    type: 's3',
    status: 'healthy',
    isDefault: false,
    lastCheck: '2026-02-18T14:25:00Z',
    usedBytes:  4_831_838_208, // ~4.5 GB
    totalBytes: 0,             // ilimitado
    latencyMs: 88,
    config: { type: 's3', endpoint: 'https://s3.amazonaws.com', bucket: 'dg-backups-prod', region: 'us-east-1', storageClass: 'STANDARD_IA', accessKeyId: 'AKIAXXX***', secretAccessKey: '***masked***' },
    files: [
      {
        id: 's3-d-001', name: '2026-02', kind: 'folder', sizeBytes: null,
        created: '2026-02-01T00:00:00Z', modified: '2026-02-18T02:04:12Z', path: 's3://dg-backups-prod/',
        children: [
          { ...PG_FILES[0], id: 's3-f-001', path: 's3://dg-backups-prod/2026-02/' },
          { ...PG_FILES[1], id: 's3-f-002', path: 's3://dg-backups-prod/2026-02/' },
        ],
      },
      {
        id: 's3-d-002', name: '2026-01', kind: 'folder', sizeBytes: null,
        created: '2026-01-01T00:00:00Z', modified: '2026-01-31T02:04:12Z', path: 's3://dg-backups-prod/',
        children: [
          { ...PG_FILES[4], id: 's3-f-003', name: 'pg_prod_daily_2026-01-31.tar.gz', path: 's3://dg-backups-prod/2026-01/' },
        ],
      },
    ],
  },
  {
    id: 'sl-004',
    name: 'MinIO Interno',
    type: 'minio',
    status: 'warning',
    isDefault: false,
    lastCheck: '2026-02-18T14:25:00Z',
    usedBytes:  45_097_156_608,  // ~42 GB — 84% cheio → warning
    totalBytes: 53_687_091_200,  // 50 GB
    latencyMs: 35,
    config: { type: 'minio', endpoint: 'http://minio.internal:9000', bucket: 'dataguardian', accessKeyId: 'minioadmin', secretAccessKey: '***masked***', useSsl: false },
    files: [
      {
        id: 'minio-d-001', name: 'mysql-staging', kind: 'folder', sizeBytes: null,
        created: '2025-11-01T00:00:00Z', modified: '2026-02-18T03:35:00Z', path: 'minio://dataguardian/',
        children: MYSQL_FILES.map(f => ({ ...f, path: 'minio://dataguardian/mysql-staging/' })),
      },
    ],
  },
  {
    id: 'sl-005',
    name: 'Backblaze B2',
    type: 'backblaze',
    status: 'unknown',
    isDefault: false,
    lastCheck: '2026-02-18T10:00:00Z',
    usedBytes:  0,
    totalBytes: 0,
    latencyMs: null,
    config: { type: 'backblaze', bucketName: 'dg-backups-offsite', bucketId: 'e73ede9969c64427a54', applicationKeyId: '004axxxx', applicationKey: '***masked***' },
    files: [],
  },
];
