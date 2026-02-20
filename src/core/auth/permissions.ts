export const PERMISSIONS = {
  DASHBOARD_READ: 'dashboard.read',
  DATASOURCES_READ: 'datasources.read',
  DATASOURCES_WRITE: 'datasources.write',
  DATASOURCES_QUERY: 'datasources.query',
  STORAGE_READ: 'storage.read',
  STORAGE_WRITE: 'storage.write',
  STORAGE_DOWNLOAD: 'storage.download',
  BACKUP_JOBS_READ: 'backup_jobs.read',
  BACKUP_JOBS_WRITE: 'backup_jobs.write',
  BACKUP_JOBS_RUN: 'backup_jobs.run',
  BACKUPS_READ: 'backups.read',
  BACKUPS_RESTORE: 'backups.restore',
  EXECUTIONS_READ: 'executions.read',
  EXECUTIONS_CONTROL: 'executions.control',
  HEALTH_READ: 'health.read',
  NOTIFICATIONS_READ: 'notifications.read',
  NOTIFICATIONS_MANAGE: 'notifications.manage',
  SYSTEM_READ: 'system.read',
  SYSTEM_WRITE: 'system.write',
  ACCESS_MANAGE: 'access.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

interface PermissionSeed {
  key: PermissionKey;
  label: string;
  description: string;
}

export const PERMISSION_SEEDS: PermissionSeed[] = [
  { key: PERMISSIONS.DASHBOARD_READ, label: 'Dashboard', description: 'Visualizar dashboard geral do sistema' },
  { key: PERMISSIONS.DATASOURCES_READ, label: 'Datasources - leitura', description: 'Listar e visualizar datasources' },
  { key: PERMISSIONS.DATASOURCES_WRITE, label: 'Datasources - escrita', description: 'Criar, editar e remover datasources' },
  { key: PERMISSIONS.DATASOURCES_QUERY, label: 'Datasources - query', description: 'Executar SQL e operações de schema em datasource' },
  { key: PERMISSIONS.STORAGE_READ, label: 'Storage - leitura', description: 'Listar storages e explorar arquivos' },
  { key: PERMISSIONS.STORAGE_WRITE, label: 'Storage - escrita', description: 'Criar, editar e remover storages e arquivos' },
  { key: PERMISSIONS.STORAGE_DOWNLOAD, label: 'Storage - download', description: 'Baixar arquivos de storage' },
  { key: PERMISSIONS.BACKUP_JOBS_READ, label: 'Backup jobs - leitura', description: 'Listar e visualizar jobs de backup' },
  { key: PERMISSIONS.BACKUP_JOBS_WRITE, label: 'Backup jobs - escrita', description: 'Criar, editar e remover jobs de backup' },
  { key: PERMISSIONS.BACKUP_JOBS_RUN, label: 'Backup jobs - executar', description: 'Executar backup manual imediato' },
  { key: PERMISSIONS.BACKUPS_READ, label: 'Backups - leitura', description: 'Listar backups existentes' },
  { key: PERMISSIONS.BACKUPS_RESTORE, label: 'Backups - restore', description: 'Iniciar restore de backups' },
  { key: PERMISSIONS.EXECUTIONS_READ, label: 'Execuções - leitura', description: 'Visualizar histórico e logs de execução' },
  { key: PERMISSIONS.EXECUTIONS_CONTROL, label: 'Execuções - controle', description: 'Cancelar, apagar e reprocessar execuções' },
  { key: PERMISSIONS.HEALTH_READ, label: 'Health - leitura', description: 'Visualizar status de saúde e histórico' },
  { key: PERMISSIONS.NOTIFICATIONS_READ, label: 'Notificações - leitura', description: 'Visualizar notificações' },
  { key: PERMISSIONS.NOTIFICATIONS_MANAGE, label: 'Notificações - gestão', description: 'Marcar leitura, limpar e excluir notificações' },
  { key: PERMISSIONS.SYSTEM_READ, label: 'Sistema - leitura', description: 'Visualizar configurações do sistema' },
  { key: PERMISSIONS.SYSTEM_WRITE, label: 'Sistema - escrita', description: 'Alterar configurações de sistema/integracões' },
  { key: PERMISSIONS.ACCESS_MANAGE, label: 'Acesso - gestão', description: 'Gerenciar usuários, roles e permissões' },
];

export const DEFAULT_ROLE_NAMES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  READONLY: 'readonly',
} as const;

export const DEFAULT_ROLE_SEEDS: Array<{
  name: string;
  description: string;
  isSystem: boolean;
  permissions: PermissionKey[];
}> = [
  {
    name: DEFAULT_ROLE_NAMES.ADMIN,
    description: 'Acesso total ao sistema',
    isSystem: true,
    permissions: PERMISSION_SEEDS.map((p) => p.key),
  },
  {
    name: DEFAULT_ROLE_NAMES.OPERATOR,
    description: 'Opera backups e restore sem administrar acesso',
    isSystem: true,
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.DATASOURCES_READ,
      PERMISSIONS.DATASOURCES_QUERY,
      PERMISSIONS.STORAGE_READ,
      PERMISSIONS.STORAGE_DOWNLOAD,
      PERMISSIONS.BACKUP_JOBS_READ,
      PERMISSIONS.BACKUP_JOBS_RUN,
      PERMISSIONS.BACKUPS_READ,
      PERMISSIONS.BACKUPS_RESTORE,
      PERMISSIONS.EXECUTIONS_READ,
      PERMISSIONS.EXECUTIONS_CONTROL,
      PERMISSIONS.HEALTH_READ,
      PERMISSIONS.NOTIFICATIONS_READ,
      PERMISSIONS.NOTIFICATIONS_MANAGE,
      PERMISSIONS.SYSTEM_READ,
    ],
  },
  {
    name: DEFAULT_ROLE_NAMES.READONLY,
    description: 'Acesso somente leitura',
    isSystem: true,
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.DATASOURCES_READ,
      PERMISSIONS.STORAGE_READ,
      PERMISSIONS.BACKUP_JOBS_READ,
      PERMISSIONS.BACKUPS_READ,
      PERMISSIONS.EXECUTIONS_READ,
      PERMISSIONS.HEALTH_READ,
      PERMISSIONS.NOTIFICATIONS_READ,
      PERMISSIONS.SYSTEM_READ,
    ],
  },
];
