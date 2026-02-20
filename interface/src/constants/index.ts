// Abreviacoes de tipos de datasource
export const DS_ABBR: Record<string, string> = {
  postgres:  'PG',
  mysql:     'MY',
  mariadb:   'MDB',
  mongodb:   'MG',
  sqlserver: 'MS',
  sqlite:    'SL',
  files:     'FS',
};

// Abreviacoes de tipos de storage
export const SL_ABBR: Record<string, string> = {
  local:     'HDD',
  ssh:       'SSH',
  s3:        'S3',
  minio:     'MIO',
  backblaze: 'B2',
};

// Labels de status de execucao
export const EXEC_STATUS_LABELS: Record<string, string> = {
  completed: 'Concluido',
  failed:    'Erro',
  running:   'Executando',
  cancelled: 'Cancelado',
  queued:    'Na fila',
};

// Labels de status de job
export const JOB_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  success: { label: 'Sucesso',  cls: 'success' },
  failed:  { label: 'Falhou',   cls: 'danger'  },
  running: { label: 'Rodando',  cls: 'running' },
  never:   { label: 'Nunca',    cls: 'neutral' },
};

// Labels de status do dashboard
export const DASHBOARD_STATUS_LABELS: Record<string, string> = {
  success: 'Sucesso',
  failed:  'Falhou',
  running: 'Rodando',
  warning: 'Aviso',
  error:   'Erro',
};

// Tipos de datasource
export type DatasourceType = 'postgres' | 'mysql' | 'mariadb' | 'mongodb' | 'sqlserver' | 'sqlite' | 'files';

export interface DatasourceTypeOption {
  type:        DatasourceType;
  label:       string;
  description: string;
  defaultPort: number | null;
}

export const DATASOURCE_TYPES: DatasourceTypeOption[] = [
  { type: 'postgres',  label: 'PostgreSQL',  description: 'Banco relacional avancado e open-source',            defaultPort: 5432  },
  { type: 'mysql',     label: 'MySQL',       description: 'Banco relacional popular e amplamente suportado',    defaultPort: 3306  },
  { type: 'mariadb',   label: 'MariaDB',     description: 'Fork open-source do MySQL com alta compatibilidade', defaultPort: 3306  },
  { type: 'mongodb',   label: 'MongoDB',     description: 'Banco NoSQL orientado a documentos',                 defaultPort: 27017 },
  { type: 'sqlserver', label: 'SQL Server',  description: 'Microsoft SQL Server',                               defaultPort: 1433  },
  { type: 'sqlite',    label: 'SQLite',      description: 'Banco leve baseado em arquivo local',                defaultPort: null  },
  { type: 'files',     label: 'Arquivos',    description: 'Backup de diretorios e arquivos do filesystem',      defaultPort: null  },
];

// Tipos de storage
export type StorageType = 'local' | 'ssh' | 's3' | 'minio' | 'backblaze';

export interface StorageTypeOption {
  type:        StorageType;
  label:       string;
  description: string;
}

export const STORAGE_TYPES: StorageTypeOption[] = [
  { type: 'local',     label: 'Disco Local',   description: 'Diretorio no servidor onde a API esta rodando' },
  { type: 'ssh',       label: 'SSH / SFTP',    description: 'NAS ou servidor remoto via protocolo SSH' },
  { type: 's3',        label: 'Amazon S3',     description: 'AWS S3 ou compativel: Wasabi, DO Spaces, etc.' },
  { type: 'minio',     label: 'MinIO',         description: 'Object storage S3-compativel self-hosted' },
  { type: 'backblaze', label: 'Backblaze B2',  description: 'Cloud storage de baixo custo da Backblaze' },
];

// Log level labels
export const LEVEL_LABELS: Record<string, string> = {
  error:   'ERROR',
  warn:    'WARN',
  info:    'INFO',
  success: 'OK',
  debug:   'DEBUG',
};
