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
  BACKUPS_RESTORE_VERIFY: 'backups.restore_verify',
  EXECUTIONS_READ: 'executions.read',
  EXECUTIONS_CONTROL: 'executions.control',
  HEALTH_READ: 'health.read',
  NOTIFICATIONS_READ: 'notifications.read',
  NOTIFICATIONS_MANAGE: 'notifications.manage',
  SYSTEM_READ: 'system.read',
  SYSTEM_WRITE: 'system.write',
  AUDIT_READ: 'audit.read',
  ACCESS_MANAGE: 'access.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

interface PermissionSeed {
  key: PermissionKey;
  label: string;
  description: string;
}

export const PERMISSION_SEEDS: PermissionSeed[] = [
  { key: PERMISSIONS.DASHBOARD_READ, label: 'Ver dashboard', description: 'Acessar indicadores e resumo geral da plataforma' },
  { key: PERMISSIONS.DATASOURCES_READ, label: 'Ver bancos de dados', description: 'Listar e visualizar datasources cadastrados' },
  { key: PERMISSIONS.DATASOURCES_WRITE, label: 'Gerenciar bancos de dados', description: 'Criar, editar e remover datasources' },
  { key: PERMISSIONS.DATASOURCES_QUERY, label: 'Executar SQL', description: 'Executar consultas SQL e operacoes de schema' },
  { key: PERMISSIONS.STORAGE_READ, label: 'Ver storages', description: 'Listar storages e navegar na estrutura de arquivos' },
  { key: PERMISSIONS.STORAGE_WRITE, label: 'Gerenciar storages', description: 'Criar, editar e remover storages e arquivos' },
  { key: PERMISSIONS.STORAGE_DOWNLOAD, label: 'Baixar arquivos do storage', description: 'Permitir download de arquivos nos storages' },
  { key: PERMISSIONS.BACKUP_JOBS_READ, label: 'Ver jobs de backup', description: 'Listar e visualizar jobs de backup' },
  { key: PERMISSIONS.BACKUP_JOBS_WRITE, label: 'Gerenciar jobs de backup', description: 'Criar, editar e remover jobs de backup' },
  { key: PERMISSIONS.BACKUP_JOBS_RUN, label: 'Executar backup manual', description: 'Iniciar backup imediatamente pelo botao executar' },
  { key: PERMISSIONS.BACKUPS_READ, label: 'Ver backups', description: 'Listar backups existentes e seus detalhes' },
  { key: PERMISSIONS.BACKUPS_RESTORE, label: 'Restaurar backups', description: 'Executar restore de backups para uma datasource' },
  { key: PERMISSIONS.BACKUPS_RESTORE_VERIFY, label: 'Validar backup em banco temporario', description: 'Executar restore verification mode em banco temporario' },
  { key: PERMISSIONS.EXECUTIONS_READ, label: 'Ver execucoes', description: 'Visualizar historico e logs de execucao' },
  { key: PERMISSIONS.EXECUTIONS_CONTROL, label: 'Controlar execucoes', description: 'Cancelar, remover e reprocessar execucoes' },
  { key: PERMISSIONS.HEALTH_READ, label: 'Ver saude do sistema', description: 'Visualizar status de saude de banco, storage e workers' },
  { key: PERMISSIONS.NOTIFICATIONS_READ, label: 'Ver notificacoes', description: 'Visualizar notificacoes do sistema' },
  { key: PERMISSIONS.NOTIFICATIONS_MANAGE, label: 'Gerenciar notificacoes', description: 'Marcar como lida, limpar e excluir notificacoes' },
  { key: PERMISSIONS.SYSTEM_READ, label: 'Ver configuracoes do sistema', description: 'Visualizar parametros e integracoes' },
  { key: PERMISSIONS.SYSTEM_WRITE, label: 'Editar configuracoes do sistema', description: 'Alterar parametros e integracoes do sistema' },
  { key: PERMISSIONS.AUDIT_READ, label: 'Ver auditoria', description: 'Consultar quem fez o que, quando e de qual IP' },
  { key: PERMISSIONS.ACCESS_MANAGE, label: 'Gerenciar usuarios e permissoes', description: 'Gerenciar usuarios, roles e permissoes de acesso' },
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
      PERMISSIONS.AUDIT_READ,
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
      PERMISSIONS.AUDIT_READ,
    ],
  },
];
