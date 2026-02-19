// ── Types ─────────────────────────────────────────────────────────

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

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ── Base request ──────────────────────────────────────────────────

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Erro desconhecido' }));
    throw new Error(err.message || `Erro HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Datasources API ───────────────────────────────────────────────

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

// ── Storage Locations API ─────────────────────────────────────────

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
