import { notifyError } from '../components/Toast/notify';

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Types ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export type DatasourceType   = 'postgres' | 'mysql' | 'mongodb' | 'sqlserver' | 'sqlite' | 'files';
export type DatasourceStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
export type StorageLocationType   = 'local' | 's3' | 'ssh' | 'minio' | 'backblaze';
export type StorageLocationStatus = 'healthy' | 'full' | 'unreachable';

export interface ApiDatasource {
  id: string;
  name: string;
  type: DatasourceType;
  status: DatasourceStatus;
  enabled: boolean;
  tags: string[];
  last_health_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiDatasourceDetail extends ApiDatasource {
  connection_config: Record<string, unknown>;
}

export interface ApiStorageLocation {
  id: string;
  name: string;
  type: StorageLocationType;
  is_default: boolean;
  available_space_gb: number | null;
  status: StorageLocationStatus;
  created_at: string;
  updated_at: string;
}

export interface ApiStorageLocationDetail extends ApiStorageLocation {
  config: Record<string, unknown>;
}

export interface ApiSchemaColumn {
  name:         string;
  type:         string;
  nullable:     boolean;
  primaryKey:   boolean;
  unique:       boolean;
  foreignKey:   boolean;
  defaultValue: string | null;
}

export interface ApiSchemaTable {
  name:    string;
  columns: ApiSchemaColumn[];
}

export interface ApiSchema {
  name:   string;
  tables: ApiSchemaTable[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiSystemHealth {
  status: 'ok' | 'degraded';
  version: string;
  uptime_seconds: number;
  services: {
    database: string;
    redis: string;
    workers: {
      backup: string;
      scheduler: string;
      health: string;
      cleanup: string;
    };
  };
  stats: {
    datasources_total: number;
    datasources_healthy: number;
    datasources_critical: number;
    jobs_total: number;
    jobs_enabled: number;
    executions_today: number;
    executions_failed_today: number;
  };
}

export interface ApiDatasourceHealthEntry {
  id: string;
  datasource_id: string;
  datasource?: { name: string; type: string };
  checked_at: string;
  status: string;
  latency_ms: number | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ApiStorageHealthEntry {
  id: string;
  storage_location_id: string;
  storage_name: string;
  storage_type: string;
  checked_at: string;
  status: 'ok' | 'error';
  latency_ms: number | null;
  available_space_gb: number | null;
  error_message: string | null;
}

export interface ApiBackupJob {
  id: string;
  name: string;
  datasource_id: string;
  storage_location_id: string;
  schedule_cron: string;
  schedule_timezone: string;
  enabled: boolean;
  retention_policy: {
    keep_daily: number;
    keep_weekly: number;
    keep_monthly: number;
    auto_delete: boolean;
  };
  backup_options: {
    compression: 'gzip' | 'zstd' | 'lz4' | 'none';
    compression_level?: number;
    parallel_jobs?: number;
    exclude_tables?: string[];
    include_tables?: string[];
    max_file_size_mb?: number;
    storage_strategy?: 'replicate' | 'fallback';
    storage_targets?: Array<{
      storage_location_id: string;
      order: number;
    }>;
  };
  storage_targets?: Array<{
    storage_location_id: string;
    order: number;
  }>;
  storage_strategy?: 'replicate' | 'fallback';
  last_execution_at: string | null;
  next_execution_at: string | null;
  created_at: string;
  updated_at: string;
  datasource?: { id: string; name: string; type: DatasourceType };
  storage_location?: { id: string; name: string; type: StorageLocationType };
  last_execution?: {
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    started_at: string | null;
    finished_at: string | null;
    size_bytes: number | null;
    duration_seconds: number | null;
  };
}

export interface ApiExecution {
  id: string;
  job_id: string;
  datasource_id: string;
  storage_location_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  backup_type: 'full' | 'incremental' | 'differential';
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  size_bytes: number | string | null;
  compressed_size_bytes: number | string | null;
  backup_path: string | null;
  files_count: number | null;
  error_message: string | null;
  operation?: 'backup' | 'restore';
  metadata: Record<string, unknown> | null;
  created_at: string;
  job?: { name: string; schedule_cron: string };
  datasource?: { name: string; type: DatasourceType };
  storage_location?: { name: string; type: StorageLocationType };
  chunks?: Array<{
    chunk_number: number;
    file_path: string;
    size_bytes: number | string | null;
    checksum: string;
  }>;
}

export interface ApiExecutionLogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  message: string;
}

export interface ApiExecutionLogs {
  execution_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string | null;
  finished_at: string | null;
  logs: ApiExecutionLogEntry[];
}

export interface ApiSystemSettingItem {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export type ApiSystemSettingsMap = Record<string, {
  value: unknown;
  description: string | null;
  updated_at: string;
}>;

export interface ApiNotification {
  id: string;
  type: 'backup_success' | 'backup_failed' | 'connection_lost' | 'connection_restored' | 'storage_full' | 'storage_unreachable' | 'health_degraded' | 'cleanup_completed';
  severity: 'info' | 'warning' | 'critical';
  entity_type: 'datasource' | 'backup_job' | 'storage_location' | 'system';
  entity_id: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface ApiAuthStatus {
  has_user: boolean;
  authenticated: boolean;
  user: { username: string } | null;
}

export interface ApiDashboardOverview {
  generated_at: string;
  stats: {
    datasources_total: number;
    datasources_healthy: number;
    jobs_total: number;
    jobs_enabled: number;
    storages_total: number;
    storages_healthy: number;
    executions_today: number;
    executions_failed_today: number;
    success_rate_24h: number;
    executions_24h_total: number;
  };
  services: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
    workers: {
      backup: string;
      scheduler: string;
      health: string;
      cleanup: string;
    };
  };
  recent_executions: Array<{
    id: string;
    datasource_name: string;
    datasource_type: DatasourceType | null;
    job_name: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    size_bytes: number | string | null;
    compressed_size_bytes: number | string | null;
    duration_seconds: number | null;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
  }>;
  upcoming_jobs: Array<{
    id: string;
    name: string;
    schedule_cron: string;
    schedule_timezone: string;
    next_execution_at: string | null;
    enabled: boolean;
    datasource_name: string;
    datasource_type: DatasourceType;
  }>;
  datasource_health: Array<{
    id: string;
    name: string;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    latency_ms: number | null;
    health_status: string | null;
    last_health_check_at: string | null;
  }>;
  executions_by_day: Array<{
    date: string;
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    running: number;
    queued: number;
  }>;
}

export interface ApiBackupDatasourceSummary {
  datasource_id: string;
  datasource_name: string;
  datasource_type: DatasourceType;
  datasource_status: DatasourceStatus;
  datasource_enabled: boolean;
  backups_count: number;
  last_backup_at: string | null;
  updated_at: string;
}

export interface ApiBackupStorageLocation {
  storage_location_id: string;
  storage_name: string;
  storage_type: StorageLocationType | null;
  configured_status: StorageLocationStatus | 'unreachable';
  backup_path: string | null;
  relative_path: string | null;
  status: 'available' | 'missing' | 'unreachable' | 'unknown';
  message: string | null;
}

export interface ApiBackupEntry {
  execution_id: string;
  status: 'completed';
  backup_type: 'full' | 'incremental' | 'differential';
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  size_bytes: number | string | null;
  compressed_size_bytes: number | string | null;
  backup_path: string | null;
  datasource: {
    id: string;
    name: string;
    type: DatasourceType;
  };
  job: {
    id: string;
    name: string;
  };
  primary_storage: {
    id: string;
    name: string;
    type: StorageLocationType;
    status: StorageLocationStatus;
  };
  storage_locations: ApiBackupStorageLocation[];
}

export interface ApiBackupsByDatasourceResponse {
  datasource_id: string;
  total_backups: number;
  backups: ApiBackupEntry[];
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Base request ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${BASE}${url}`, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      credentials: 'include',
      ...options,
    });
  } catch {
    const message = 'Falha de conexao com o servidor';
    notifyError(message);
    throw new Error(message);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Erro desconhecido' }));
    const message = err.message || `Erro HTTP ${res.status}`;
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('dg:unauthorized'));
    }
    notifyError(message);
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Datasources API ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export const datasourceApi = {
  list: () =>
    request<PaginatedResponse<ApiDatasource>>('/datasources?limit=100'),

  getById: (id: string) =>
    request<ApiDatasourceDetail>(`/datasources/${id}`),

  create: (data: {
    name: string;
    type: DatasourceType;
    connection_config: Record<string, unknown>;
    enabled: boolean;
    tags: string[];
  }) =>
    request<ApiDatasource>('/datasources', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: {
    name?: string;
    connection_config?: Record<string, unknown>;
    enabled?: boolean;
    tags?: string[];
  }) =>
    request<ApiDatasource>(`/datasources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    request<void>(`/datasources/${id}`, { method: 'DELETE' }),

  test: (id: string) =>
    request<{ status: string; latency_ms: number | null; error?: string; message?: string }>(
      `/datasources/${id}/test`,
      { method: 'POST' },
    ),

  schema: (id: string) =>
    request<ApiSchema[]>(`/datasources/${id}/schema`),

  query: (id: string, sql: string) =>
    request<{
      columns:       string[];
      rows:          Record<string, unknown>[];
      rowCount:      number;
      executionTime: number;
      message?:      string;
    }>(`/datasources/${id}/query`, {
      method: 'POST',
      body:   JSON.stringify({ sql }),
    }),
};

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Storage Locations API ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export const storageApi = {
  list: () =>
    request<PaginatedResponse<ApiStorageLocation>>('/storage-locations?limit=100'),

  getById: (id: string) =>
    request<ApiStorageLocationDetail>(`/storage-locations/${id}`),

  create: (data: {
    name: string;
    type: StorageLocationType;
    config: Record<string, unknown>;
    is_default: boolean;
  }) =>
    request<ApiStorageLocation>('/storage-locations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: {
    name?: string;
    config?: Record<string, unknown>;
    is_default?: boolean;
  }) =>
    request<ApiStorageLocation>(`/storage-locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    request<void>(`/storage-locations/${id}`, { method: 'DELETE' }),

  test: (id: string) =>
    request<{ status: string; available_space_gb?: number; latency_ms: number | null }>(
      `/storage-locations/${id}/test`,
      { method: 'POST' },
    ),

  testConfig: (data: {
    type: StorageLocationType;
    config: Record<string, unknown>;
  }) =>
    request<{ status: string; available_space_gb?: number; latency_ms: number | null }>(
      '/storage-locations/test',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    ),
};

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Health API ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export const healthApi = {
  system: () =>
    request<ApiSystemHealth>('/health'),

  datasources: () =>
    request<PaginatedResponse<ApiDatasourceHealthEntry>>('/health/datasources?limit=100'),

  storage: () =>
    request<PaginatedResponse<ApiStorageHealthEntry>>('/health/storage?limit=100'),
};

export const dashboardApi = {
  overview: () =>
    request<ApiDashboardOverview>('/dashboard/overview'),
};

export const backupsApi = {
  listDatasources: () =>
    request<{ data: ApiBackupDatasourceSummary[] }>('/backups/datasources'),

  listByDatasource: (datasourceId: string) =>
    request<ApiBackupsByDatasourceResponse>(`/backups/datasources/${datasourceId}`),

  restore: (executionId: string, data?: { storage_location_id?: string; drop_existing?: boolean }) =>
    request<{
      message: string;
      execution_id: string;
      source_execution_id: string;
      datasource_id: string;
      datasource_name: string;
      datasource_type: DatasourceType;
      status: 'running';
      started_at: string;
    }>(`/backups/${executionId}/restore`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),
};

export const authApi = {
  status: () =>
    request<ApiAuthStatus>('/auth/status'),

  setup: (data: { username: string; password: string }) =>
    request<{ message: string; user: { username: string } }>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { username: string; password: string }) =>
    request<{ message: string; user: { username: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    request<{ message: string }>('/auth/logout', { method: 'POST' }),

  me: () =>
    request<{ user: { username: string } }>('/auth/me'),
};

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Backup Jobs API ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export const backupJobsApi = {
  list: () =>
    request<PaginatedResponse<ApiBackupJob>>('/backup-jobs?limit=100'),

  getById: (id: string) =>
    request<ApiBackupJob>(`/backup-jobs/${id}`),

  create: (data: {
    name: string;
    datasource_id: string;
    storage_location_id: string;
    schedule_cron: string;
    schedule_timezone: string;
    enabled: boolean;
    retention_policy: {
      keep_daily: number;
      keep_weekly: number;
      keep_monthly: number;
      auto_delete: boolean;
    };
    backup_options: {
      compression: 'gzip' | 'zstd' | 'lz4' | 'none';
      compression_level?: number;
      parallel_jobs?: number;
      exclude_tables?: string[];
      include_tables?: string[];
      max_file_size_mb?: number;
      storage_strategy?: 'replicate' | 'fallback';
      storage_targets?: Array<{
        storage_location_id: string;
        order: number;
      }>;
    };
  }) =>
    request<ApiBackupJob>('/backup-jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: {
    name?: string;
    datasource_id?: string;
    storage_location_id?: string;
    schedule_cron?: string;
    schedule_timezone?: string;
    enabled?: boolean;
    retention_policy?: {
      keep_daily: number;
      keep_weekly: number;
      keep_monthly: number;
      auto_delete: boolean;
    };
    backup_options?: {
      compression: 'gzip' | 'zstd' | 'lz4' | 'none';
      compression_level?: number;
      parallel_jobs?: number;
      exclude_tables?: string[];
      include_tables?: string[];
      max_file_size_mb?: number;
      storage_strategy?: 'replicate' | 'fallback';
      storage_targets?: Array<{
        storage_location_id: string;
        order: number;
      }>;
    };
  }) =>
    request<ApiBackupJob>(`/backup-jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    request<void>(`/backup-jobs/${id}`, { method: 'DELETE' }),

  run: (id: string) =>
    request<{ execution_id: string; message: string; status: string }>(`/backup-jobs/${id}/run`, {
      method: 'POST',
    }),
};

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Executions API ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export const executionsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    job_id?: string;
    datasource_id?: string;
    storage_location_id?: string;
    status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    from?: string;
    to?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.job_id) qs.set('job_id', params.job_id);
    if (params?.datasource_id) qs.set('datasource_id', params.datasource_id);
    if (params?.storage_location_id) qs.set('storage_location_id', params.storage_location_id);
    if (params?.status) qs.set('status', params.status);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const query = qs.toString();
    return request<PaginatedResponse<ApiExecution>>(`/executions${query ? `?${query}` : ''}`);
  },

  getById: (id: string) =>
    request<ApiExecution>(`/executions/${id}`),

  logs: (id: string) =>
    request<ApiExecutionLogs>(`/executions/${id}/logs`),

  cancel: (id: string) =>
    request<{ id: string; status: string; message: string }>(`/executions/${id}/cancel`, {
      method: 'POST',
    }),

  retryUpload: (id: string) =>
    request<{ execution_id: string; status: string; message: string }>(`/executions/${id}/retry-upload`, {
      method: 'POST',
    }),

  remove: (id: string) =>
    request<void>(`/executions/${id}`, { method: 'DELETE' }),
};

export const notificationsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    read?: 'true' | 'false';
    severity?: 'info' | 'warning' | 'critical';
    type?: ApiNotification['type'];
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.read) qs.set('read', params.read);
    if (params?.severity) qs.set('severity', params.severity);
    if (params?.type) qs.set('type', params.type);
    const query = qs.toString();
    return request<PaginatedResponse<ApiNotification> & { unread_count: number }>(`/notifications${query ? `?${query}` : ''}`);
  },

  markAsRead: (id: string) =>
    request<{ id: string; read_at: string }>(`/notifications/${id}/read`, { method: 'PUT' }),

  markAllAsRead: () =>
    request<{ updated_count: number }>('/notifications/read-all', { method: 'PUT' }),

  remove: (id: string) =>
    request<void>(`/notifications/${id}`, { method: 'DELETE' }),
};

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ System Settings API ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export const systemApi = {
  list: () =>
    request<ApiSystemSettingsMap>('/system/settings'),

  create: (data: { key: string; value: unknown; description?: string | null }) =>
    request<ApiSystemSettingItem>('/system/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMany: (data: Record<string, unknown>) =>
    request<ApiSystemSettingsMap>('/system/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getByKey: (key: string) =>
    request<ApiSystemSettingItem>(`/system/settings/${encodeURIComponent(key)}`),

  updateByKey: (key: string, patch: { value?: unknown; description?: string | null }) =>
    request<ApiSystemSettingItem>(`/system/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  removeByKey: (key: string) =>
    request<void>(`/system/settings/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),

  testSmtp: () =>
    request<{ status?: string; message: string; error?: string }>('/system/settings/test-smtp', {
      method: 'POST',
    }),
};

