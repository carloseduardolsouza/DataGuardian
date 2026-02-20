import { useEffect, useMemo, useState } from 'react';
import { accessApi, systemApi, type ApiAccessPermission, type ApiAccessRole, type ApiAccessUser } from '../../services/api';
import { AlertTriangleIcon, CheckCircleIcon, SpinnerIcon } from '../../components/Icons';
import Modal from '../../components/Modal/Modal';
import styles from './SettingsPage.module.css';

type SmtpConfig = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  from?: string;
  to?: string[];
};

type WhatsappEvolutionConfig = {
  api_url?: string;
  api_key?: string;
  instance?: string;
  to?: string[];
  important_only?: boolean;
};

interface Props {
  canManageAccess?: boolean;
}

const FRIENDLY_PERMISSION: Record<string, { label: string; description: string }> = {
  'access.manage': { label: 'Gerenciar usuarios e permissoes', description: 'Gerenciar usuarios, roles e permissoes de acesso' },
  'audit.read': { label: 'Ver auditoria', description: 'Consultar quem fez o que, quando e de qual IP' },
  'backup_jobs.read': { label: 'Ver jobs de backup', description: 'Listar e visualizar jobs de backup' },
  'backup_jobs.run': { label: 'Executar backup manual', description: 'Iniciar backup imediatamente pelo botao executar' },
  'backup_jobs.write': { label: 'Gerenciar jobs de backup', description: 'Criar, editar e remover jobs de backup' },
  'backups.read': { label: 'Ver backups', description: 'Listar backups existentes e seus detalhes' },
  'backups.restore': { label: 'Restaurar backups', description: 'Executar restore de backups para uma datasource' },
  'backups.restore_verify': { label: 'Validar restore em banco temporario', description: 'Executar restore verification mode sem afetar banco principal' },
  'dashboard.read': { label: 'Ver dashboard', description: 'Acessar indicadores e resumo geral da plataforma' },
  'datasources.query': { label: 'Executar SQL', description: 'Executar consultas SQL e operacoes de schema' },
  'datasources.read': { label: 'Ver bancos de dados', description: 'Listar e visualizar datasources cadastrados' },
  'datasources.write': { label: 'Gerenciar bancos de dados', description: 'Criar, editar e remover datasources' },
  'executions.control': { label: 'Controlar execucoes', description: 'Cancelar, remover e reprocessar execucoes' },
  'executions.read': { label: 'Ver execucoes', description: 'Visualizar historico e logs de execucao' },
  'health.read': { label: 'Ver saude do sistema', description: 'Visualizar status de saude de banco, storage e workers' },
  'notifications.manage': { label: 'Gerenciar notificacoes', description: 'Marcar como lida, limpar e excluir notificacoes' },
  'notifications.read': { label: 'Ver notificacoes', description: 'Visualizar notificacoes do sistema' },
  'storage.download': { label: 'Baixar arquivos do storage', description: 'Permitir download de arquivos nos storages' },
  'storage.read': { label: 'Ver storages', description: 'Listar storages e navegar na estrutura de arquivos' },
  'storage.write': { label: 'Gerenciar storages', description: 'Criar, editar e remover storages e arquivos' },
  'system.read': { label: 'Ver configuracoes do sistema', description: 'Visualizar parametros e integracoes' },
  'system.write': { label: 'Editar configuracoes do sistema', description: 'Alterar parametros e integracoes do sistema' },
};

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBool(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function parseCsv(value: string) {
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function boolLabel(value: boolean) {
  return value ? 'Configurado' : 'Incompleto';
}

function roleIdsOf(user: ApiAccessUser) {
  return user.roles.map((role) => role.id);
}

function formatWhen(value: string | null) {
  if (!value) return 'Nunca';
  return new Date(value).toLocaleString('pt-BR');
}

function getPermissionDisplay(permission: ApiAccessPermission) {
  const friendly = FRIENDLY_PERMISSION[permission.key];
  return {
    label: friendly?.label || permission.label || permission.key,
    description: friendly?.description || permission.description || 'Sem descricao',
  };
}

export default function SettingsPage({ canManageAccess = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [maxConcurrentBackups, setMaxConcurrentBackups] = useState(3);
  const [tempDirectory, setTempDirectory] = useState('/tmp/dataguardian');
  const [healthIntervalMin, setHealthIntervalMin] = useState(5);
  const [schedulerIntervalMin, setSchedulerIntervalMin] = useState(1);

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpHasPassword, setSmtpHasPassword] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTo, setSmtpTo] = useState('');

  const [webhookUrl, setWebhookUrl] = useState('');

  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [waApiUrl, setWaApiUrl] = useState('http://localhost:8080');
  const [waApiKey, setWaApiKey] = useState('');
  const [waHasApiKey, setWaHasApiKey] = useState(false);
  const [waInstance, setWaInstance] = useState('');
  const [waRecipients, setWaRecipients] = useState('');
  const [waImportantOnly, setWaImportantOnly] = useState(true);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrInstance, setQrInstance] = useState('');

  const [accessLoading, setAccessLoading] = useState(false);
  const [users, setUsers] = useState<ApiAccessUser[]>([]);
  const [roles, setRoles] = useState<ApiAccessRole[]>([]);
  const [permissions, setPermissions] = useState<ApiAccessPermission[]>([]);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    is_owner: false,
    role_ids: [] as string[],
  });
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRolePermissionIds, setNewRolePermissionIds] = useState<string[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string[]>>({});
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string[]>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'role' | 'user'; id: string; label: string } | null>(null);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const data = await systemApi.list();

      setMaxConcurrentBackups(asNumber(data['system.max_concurrent_backups']?.value, 3));
      setTempDirectory(asString(data['system.temp_directory']?.value, '/tmp/dataguardian'));
      setHealthIntervalMin(Math.max(1, Math.round(asNumber(data['system.health_check_interval_ms']?.value, 300000) / 60000)));
      setSchedulerIntervalMin(Math.max(1, Math.round(asNumber(data['system.scheduler_interval_ms']?.value, 60000) / 60000)));

      setEmailEnabled(asBool(data['notifications.email_enabled']?.value, false));

      const smtp = (data['notifications.email_smtp_config']?.value ?? {}) as SmtpConfig;
      setSmtpHost(asString(smtp.host));
      setSmtpPort(asNumber(smtp.port, 587));
      setSmtpUser(asString(smtp.user));
      setSmtpPassword('');
      setSmtpHasPassword(Boolean(asString(smtp.password)));
      setSmtpFrom(asString(smtp.from));
      setSmtpTo(Array.isArray(smtp.to) ? smtp.to.join(', ') : '');

      setWebhookUrl(asString(data['notifications.webhook_url']?.value, ''));

      setWhatsappEnabled(asBool(data['notifications.whatsapp_enabled']?.value, false));
      const wa = (data['notifications.whatsapp_evolution_config']?.value ?? {}) as WhatsappEvolutionConfig;
      setWaApiUrl(asString(wa.api_url, 'http://localhost:8080'));
      setWaApiKey('');
      setWaHasApiKey(Boolean(asString(wa.api_key)));
      setWaInstance(asString(wa.instance));
      setWaRecipients(Array.isArray(wa.to) ? wa.to.join(', ') : '');
      setWaImportantOnly(asBool(wa.important_only, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar configuracoes.');
    } finally {
      setLoading(false);
    }
  }

  async function loadAccess() {
    if (!canManageAccess) return;
    try {
      setAccessLoading(true);
      const [userRes, roleRes, permRes] = await Promise.all([
        accessApi.users(),
        accessApi.roles(),
        accessApi.permissions(),
      ]);

      setUsers(userRes.data);
      setRoles(roleRes.data);
      setPermissions(permRes.data);
      setRoleDrafts(Object.fromEntries(roleRes.data.map((role) => [role.id, role.permissions.map((p) => p.id)])));
      setUserRoleDrafts(Object.fromEntries(userRes.data.map((user) => [user.id, roleIdsOf(user)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar controle de acesso.');
    } finally {
      setAccessLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    if (canManageAccess) {
      void loadAccess();
    }
  }, [canManageAccess]);

  const smtpConfigured = useMemo(() => {
    return Boolean(
      smtpHost.trim()
      && smtpPort > 0
      && smtpUser.trim()
      && smtpFrom.trim()
      && parseCsv(smtpTo).length > 0
      && (smtpHasPassword || smtpPassword.trim()),
    );
  }, [smtpFrom, smtpHasPassword, smtpHost, smtpPassword, smtpPort, smtpTo, smtpUser]);

  const webhookConfigured = useMemo(() => Boolean(webhookUrl.trim()), [webhookUrl]);

  const waConfigured = useMemo(() => {
    return Boolean(
      waApiUrl.trim()
      && waInstance.trim()
      && parseCsv(waRecipients).length > 0
      && (waHasApiKey || waApiKey.trim()),
    );
  }, [waApiKey, waApiUrl, waHasApiKey, waInstance, waRecipients]);

  const editingRole = useMemo(
    () => roles.find((role) => role.id === editingRoleId) ?? null,
    [roles, editingRoleId],
  );

  const editingUser = useMemo(
    () => users.find((user) => user.id === editingUserId) ?? null,
    [users, editingUserId],
  );

  const passwordUser = useMemo(
    () => users.find((user) => user.id === passwordUserId) ?? null,
    [users, passwordUserId],
  );

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await systemApi.updateMany({
        'system.max_concurrent_backups': maxConcurrentBackups,
        'system.temp_directory': tempDirectory,
        'system.health_check_interval_ms': Math.max(1, healthIntervalMin) * 60000,
        'system.scheduler_interval_ms': Math.max(1, schedulerIntervalMin) * 60000,

        'notifications.email_enabled': emailEnabled,
        'notifications.email_smtp_config': {
          host: smtpHost.trim(),
          port: smtpPort,
          user: smtpUser.trim(),
          ...(smtpPassword.trim() ? { password: smtpPassword.trim() } : {}),
          from: smtpFrom.trim(),
          to: parseCsv(smtpTo),
        },

        'notifications.webhook_url': webhookUrl.trim() ? webhookUrl.trim() : null,

        'notifications.whatsapp_enabled': whatsappEnabled,
        'notifications.whatsapp_evolution_config': {
          api_url: waApiUrl.trim(),
          ...(waApiKey.trim() ? { api_key: waApiKey.trim() } : {}),
          instance: waInstance.trim(),
          to: parseCsv(waRecipients),
          important_only: waImportantOnly,
        },
      });

      setSuccess('Configuracoes salvas com sucesso.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configuracoes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleGetWhatsappQr() {
    try {
      setLoadingQr(true);
      setError(null);
      const response = await systemApi.whatsappQr({
        instance: waInstance.trim() ? waInstance.trim() : undefined,
      });
      setQrCode(response.qr_code);
      setQrInstance(response.instance);
    } catch (err) {
      setQrCode(null);
      setQrInstance('');
      setError(err instanceof Error ? err.message : 'Falha ao obter QR Code.');
    } finally {
      setLoadingQr(false);
    }
  }

  async function handleCreateRole() {
    try {
      setError(null);
      await accessApi.createRole({
        name: newRoleName,
        description: newRoleDescription || null,
        permission_ids: newRolePermissionIds,
      });
      setNewRoleName('');
      setNewRoleDescription('');
      setNewRolePermissionIds([]);
      setShowCreateRoleModal(false);
      await loadAccess();
      setSuccess('Role criada com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar role.');
    }
  }

  async function handleUpdateRolePermissions(roleId: string) {
    try {
      const permissionIds = roleDrafts[roleId] ?? [];
      await accessApi.updateRole(roleId, { permission_ids: permissionIds });
      setEditingRoleId(null);
      await loadAccess();
      setSuccess('Permissoes da role atualizadas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar role.');
    }
  }

  async function handleDeleteRole(roleId: string) {
    try {
      await accessApi.removeRole(roleId);
      setDeleteTarget(null);
      setEditingRoleId(null);
      await loadAccess();
      setSuccess('Role removida com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover role.');
    }
  }

  async function handleCreateUser() {
    try {
      setError(null);
      await accessApi.createUser({
        username: newUser.username,
        password: newUser.password,
        full_name: newUser.full_name || null,
        email: newUser.email || null,
        is_owner: newUser.is_owner,
        role_ids: newUser.role_ids,
      });
      setNewUser({ username: '', password: '', full_name: '', email: '', is_owner: false, role_ids: [] });
      setShowCreateUserModal(false);
      await loadAccess();
      setSuccess('Usuario criado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar usuario.');
    }
  }

  async function handleUpdateUser(user: ApiAccessUser) {
    try {
      await accessApi.updateUser(user.id, {
        is_active: user.is_active,
        is_owner: user.is_owner,
        role_ids: userRoleDrafts[user.id] ?? roleIdsOf(user),
      });
      setEditingUserId(null);
      await loadAccess();
      setSuccess(`Usuario ${user.username} atualizado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar usuario.');
    }
  }

  async function handleResetPassword(userId: string) {
    const password = passwordDrafts[userId]?.trim();
    if (!password || password.length < 8) {
      setError('Informe uma nova senha com pelo menos 8 caracteres.');
      return;
    }

    try {
      await accessApi.updateUserPassword(userId, { password });
      setPasswordDrafts((current) => ({ ...current, [userId]: '' }));
      setPasswordUserId(null);
      setSuccess('Senha atualizada com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar senha.');
    }
  }

  async function handleRemoveUser(userId: string) {
    try {
      await accessApi.removeUser(userId);
      setDeleteTarget(null);
      setEditingUserId(null);
      await loadAccess();
      setSuccess('Usuario removido com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover usuario.');
    }
  }

  function toggleRolePermission(roleId: string, permissionId: string) {
    setRoleDrafts((current) => {
      const existing = new Set(current[roleId] ?? []);
      if (existing.has(permissionId)) existing.delete(permissionId);
      else existing.add(permissionId);
      return { ...current, [roleId]: [...existing] };
    });
  }

  function toggleNewRolePermission(permissionId: string) {
    setNewRolePermissionIds((current) => current.includes(permissionId)
      ? current.filter((id) => id !== permissionId)
      : [...current, permissionId]);
  }

  function toggleUserRoleDraft(userId: string, roleId: string) {
    setUserRoleDrafts((current) => {
      const existing = new Set(current[userId] ?? []);
      if (existing.has(roleId)) existing.delete(roleId);
      else existing.add(roleId);
      return { ...current, [userId]: [...existing] };
    });
  }

  function openCreateRoleModal() {
    setNewRoleName('');
    setNewRoleDescription('');
    setNewRolePermissionIds([]);
    setShowCreateRoleModal(true);
  }

  function openCreateUserModal() {
    setNewUser({ username: '', password: '', full_name: '', email: '', is_owner: false, role_ids: [] });
    setShowCreateUserModal(true);
  }

  if (loading) {
    return (
      <div className={styles.centerState}>
        <SpinnerIcon width={16} height={16} /> Carregando configuracoes...
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Configuracoes</h2>
          <p className={styles.subtitle}>Configure integracoes, sistema e controle de acesso da plataforma.</p>
        </div>
        <button className={styles.primaryBtn} onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar tudo'}
        </button>
      </div>

      {error && <div className={`${styles.alert} ${styles.alertError}`}><AlertTriangleIcon width={14} height={14} /> {error}</div>}
      {success && <div className={`${styles.alert} ${styles.alertOk}`}><CheckCircleIcon width={14} height={14} /> {success}</div>}

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>E-mail (SMTP)</h3>
            <span className={`${styles.badge} ${smtpConfigured ? styles.badgeOk : styles.badgeWarn}`}>{boolLabel(smtpConfigured)}</span>
          </div>

          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
            <span>Ativar envio por e-mail</span>
          </label>

          <div className={styles.twoCols}>
            <label className={styles.field}><span>Host SMTP</span><input className={styles.input} type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.empresa.com" /></label>
            <label className={styles.field}><span>Porta</span><input className={styles.input} type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} /></label>
            <label className={styles.field}><span>Usuario</span><input className={styles.input} type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} /></label>
            <label className={styles.field}><span>Remetente (from)</span><input className={styles.input} type="text" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="noreply@empresa.com" /></label>
          </div>

          <label className={styles.field}>
            <span>Senha SMTP (deixe vazio para manter)</span>
            <input className={styles.input} type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} />
            {smtpHasPassword && !smtpPassword.trim() && <small className={styles.hint}>Uma senha ja esta salva.</small>}
          </label>

          <label className={styles.field}>
            <span>Destinatarios</span>
            <input className={styles.input} type="text" value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} placeholder="admin@empresa.com, devops@empresa.com" />
          </label>

          <p className={styles.infoLine}>Teste SMTP ainda nao implementado no backend. Salve e valide com uma notificacao real.</p>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Webhook</h3>
            <span className={`${styles.badge} ${webhookConfigured ? styles.badgeOk : styles.badgeWarn}`}>{boolLabel(webhookConfigured)}</span>
          </div>
          <label className={styles.field}>
            <span>URL do webhook</span>
            <input className={styles.input} type="text" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
            <small className={styles.hint}>Deixe vazio para desativar.</small>
          </label>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>WhatsApp (Evolution API)</h3>
            <span className={`${styles.badge} ${waConfigured ? styles.badgeOk : styles.badgeWarn}`}>{boolLabel(waConfigured)}</span>
          </div>

          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={whatsappEnabled} onChange={(e) => setWhatsappEnabled(e.target.checked)} />
            <span>Ativar notificacoes no WhatsApp</span>
          </label>

          <label className={styles.field}><span>URL da Evolution API</span><input className={styles.input} type="text" value={waApiUrl} onChange={(e) => setWaApiUrl(e.target.value)} placeholder="http://localhost:8080" /></label>
          <label className={styles.field}><span>Nome da instancia</span><input className={styles.input} type="text" value={waInstance} onChange={(e) => setWaInstance(e.target.value)} placeholder="dataguardian" /></label>
          <label className={styles.field}><span>API Key (deixe vazio para manter)</span><input className={styles.input} type="password" value={waApiKey} onChange={(e) => setWaApiKey(e.target.value)} /></label>
          {waHasApiKey && !waApiKey.trim() && <small className={styles.hint}>Uma API key ja esta salva.</small>}

          <label className={styles.field}>
            <span>Numeros de destino</span>
            <input className={styles.input} type="text" value={waRecipients} onChange={(e) => setWaRecipients(e.target.value)} placeholder="5511999999999, 5511888888888" />
          </label>

          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={waImportantOnly} onChange={(e) => setWaImportantOnly(e.target.checked)} />
            <span>Enviar somente alertas importantes (warning/critical)</span>
          </label>

          <div className={styles.actionsRow}>
            <button className={styles.secondaryBtn} onClick={() => void handleGetWhatsappQr()} disabled={loadingQr}>
              {loadingQr ? 'Gerando QR...' : 'Obter QR Code'}
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Sistema</h3>
          <div className={styles.twoCols}>
            <label className={styles.field}>
              <span>Backups simultaneos</span>
              <input className={styles.input} type="number" min={1} value={maxConcurrentBackups} onChange={(e) => setMaxConcurrentBackups(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className={styles.field}>
              <span>Health check (min)</span>
              <input className={styles.input} type="number" min={1} value={healthIntervalMin} onChange={(e) => setHealthIntervalMin(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className={styles.field}>
              <span>Scheduler (min)</span>
              <input className={styles.input} type="number" min={1} value={schedulerIntervalMin} onChange={(e) => setSchedulerIntervalMin(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className={styles.field}>
              <span>Diretorio temporario</span>
              <input className={styles.input} type="text" value={tempDirectory} onChange={(e) => setTempDirectory(e.target.value)} />
            </label>
          </div>
        </section>
      </div>

      {canManageAccess && (
        <div className={styles.accessArea}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Controle de Acesso (RBAC)</h3>
              <div className={styles.actionsRow}>
                <button className={styles.secondaryBtn} onClick={() => void loadAccess()} disabled={accessLoading}>
                  {accessLoading ? 'Atualizando...' : 'Atualizar'}
                </button>
                <button className={styles.primaryBtn} onClick={openCreateUserModal}>Novo usuario</button>
                <button className={styles.primaryBtn} onClick={openCreateRoleModal}>Nova role</button>
              </div>
            </div>
            <div className={styles.helpGrid}>
              <div className={styles.helpItem}>
                <p className={styles.helpTitle}>Usuario</p>
                <p className={styles.hint}>Pessoa/equipe que faz login no sistema.</p>
              </div>
              <div className={styles.helpItem}>
                <p className={styles.helpTitle}>Role</p>
                <p className={styles.hint}>Conjunto de permissoes que voce atribui a um usuario.</p>
              </div>
              <div className={styles.helpItem}>
                <p className={styles.helpTitle}>Permissao</p>
                <p className={styles.hint}>Regra de acesso para tela ou acao especifica.</p>
              </div>
            </div>
          </section>

          <div className={styles.accessSplit}>
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Roles existentes</h3>
              {roles.map((role) => (
                <div key={role.id} className={styles.accessBlock}>
                  <div className={styles.accessRow}>
                    <div>
                      <strong className={styles.helpTitle}>{role.name}</strong>
                      <p className={styles.hint} >{role.description || 'Sem descricao'} · {role.users_count} usuario(s)</p>
                    </div>
                    <div className={styles.actionsRow}>
                      <button className={styles.secondaryBtn} onClick={() => setEditingRoleId(role.id)}>Editar</button>
                      {!role.is_system && (
                        <button className={styles.dangerBtn} onClick={() => setDeleteTarget({ type: 'role', id: role.id, label: role.name })}>
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Usuarios existentes</h3>
              {users.map((user) => (
                <div key={user.id} className={styles.accessBlock}>
                  <div className={styles.accessRow}>
                    <div>
                      <strong className={styles.helpTitle}>{user.username}</strong>
                      <p className={styles.hint}>Ultimo login: {formatWhen(user.last_login_at)}</p>
                    </div>
                    <div className={styles.actionsRow}>
                      <button className={styles.secondaryBtn} onClick={() => setEditingUserId(user.id)}>Editar</button>
                      <button className={styles.secondaryBtn} onClick={() => setPasswordUserId(user.id)}>Senha</button>
                      <button className={styles.dangerBtn} onClick={() => setDeleteTarget({ type: 'user', id: user.id, label: user.username })}>
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}

      {showCreateRoleModal && (
        <Modal
          title="Nova role"
          subtitle="Defina o nome e as permissoes desta role."
          onClose={() => setShowCreateRoleModal(false)}
          size="lg"
          footer={(
            <>
              <button className={styles.secondaryBtn} onClick={() => setShowCreateRoleModal(false)}>Cancelar</button>
              <button className={styles.primaryBtn} onClick={() => void handleCreateRole()} disabled={!newRoleName.trim()}>
                Criar role
              </button>
            </>
          )}
        >
          <div className={styles.twoCols}>
            <label className={styles.field}><span>Nome</span><input className={styles.input} value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="devops" /></label>
            <label className={styles.field}><span>Descricao</span><input className={styles.input} value={newRoleDescription} onChange={(e) => setNewRoleDescription(e.target.value)} placeholder="Acesso para equipe DevOps" /></label>
          </div>
          <p className={styles.hint}>Permissoes da role:</p>
          <div className={styles.checkboxGrid}>
            {permissions.map((permission) => {
              const display = getPermissionDisplay(permission);
              return (
                <label key={permission.id} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={newRolePermissionIds.includes(permission.id)}
                    onChange={() => toggleNewRolePermission(permission.id)}
                  />
                  <span className={styles.permissionText}>
                    <strong className={styles.permissionTitle}>{display.label}</strong>
                    <small className={styles.permissionDescription}>{display.description}</small>
                    <code className={styles.permissionKey}>{permission.key}</code>
                  </span>
                </label>
              );
            })}
          </div>
        </Modal>
      )}

      {editingRole && (
        <Modal
          title={`Editar role: ${editingRole.name}`}
          subtitle="Atualize permissoes e salve."
          onClose={() => setEditingRoleId(null)}
          size="lg"
          footer={(
            <>
              <button className={styles.secondaryBtn} onClick={() => setEditingRoleId(null)}>Cancelar</button>
              <button className={styles.primaryBtn} onClick={() => void handleUpdateRolePermissions(editingRole.id)}>
                Salvar permissoes
              </button>
            </>
          )}
        >
          <div className={styles.checkboxGrid}>
            {permissions.map((permission) => {
              const display = getPermissionDisplay(permission);
              return (
                <label key={`${editingRole.id}-${permission.id}`} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={(roleDrafts[editingRole.id] ?? []).includes(permission.id)}
                    onChange={() => toggleRolePermission(editingRole.id, permission.id)}
                  />
                  <span className={styles.permissionText}>
                    <strong className={styles.permissionTitle}>{display.label}</strong>
                    <small className={styles.permissionDescription}>{display.description}</small>
                    <code className={styles.permissionKey}>{permission.key}</code>
                  </span>
                </label>
              );
            })}
          </div>
        </Modal>
      )}

      {showCreateUserModal && (
        <Modal
          title="Novo usuario"
          subtitle="Crie usuario e defina suas roles."
          onClose={() => setShowCreateUserModal(false)}
          size="lg"
          footer={(
            <>
              <button className={styles.secondaryBtn} onClick={() => setShowCreateUserModal(false)}>Cancelar</button>
              <button className={styles.primaryBtn} onClick={() => void handleCreateUser()} disabled={!newUser.username.trim() || newUser.password.length < 8}>
                Criar usuario
              </button>
            </>
          )}
        >
          <div className={styles.twoCols}>
            <label className={styles.field}><span>Username</span><input className={styles.input} value={newUser.username} onChange={(e) => setNewUser((c) => ({ ...c, username: e.target.value }))} /></label>
            <label className={styles.field}><span>Senha</span><input className={styles.input} type="password" value={newUser.password} onChange={(e) => setNewUser((c) => ({ ...c, password: e.target.value }))} /></label>
            <label className={styles.field}><span>Nome completo</span><input className={styles.input} value={newUser.full_name} onChange={(e) => setNewUser((c) => ({ ...c, full_name: e.target.value }))} /></label>
            <label className={styles.field}><span>E-mail</span><input className={styles.input} value={newUser.email} onChange={(e) => setNewUser((c) => ({ ...c, email: e.target.value }))} /></label>
          </div>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={newUser.is_owner} onChange={(e) => setNewUser((c) => ({ ...c, is_owner: e.target.checked }))} />
            <span>Marcar como owner</span>
          </label>
          <div className={styles.checkboxGrid}>
            {roles.map((role) => (
              <label key={`new-${role.id}`} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={newUser.role_ids.includes(role.id)}
                  onChange={() => setNewUser((c) => ({
                    ...c,
                    role_ids: c.role_ids.includes(role.id)
                      ? c.role_ids.filter((id) => id !== role.id)
                      : [...c.role_ids, role.id],
                  }))}
                />
                <span>{role.name}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}

      {editingUser && (
        <Modal
          title={`Editar usuario: ${editingUser.username}`}
          subtitle="Atualize status e roles deste usuario."
          onClose={() => setEditingUserId(null)}
          size="lg"
          footer={(
            <>
              <button className={styles.secondaryBtn} onClick={() => setEditingUserId(null)}>Cancelar</button>
              <button className={styles.primaryBtn} onClick={() => void handleUpdateUser(editingUser)}>
                Salvar usuario
              </button>
            </>
          )}
        >
          <div className={styles.toggleRow}>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={editingUser.is_active}
                onChange={(e) => setUsers((curr) => curr.map((item) => item.id === editingUser.id ? { ...item, is_active: e.target.checked } : item))}
              />
              <span>Ativo</span>
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={editingUser.is_owner}
                onChange={(e) => setUsers((curr) => curr.map((item) => item.id === editingUser.id ? { ...item, is_owner: e.target.checked } : item))}
              />
              <span>Owner</span>
            </label>
          </div>
          <div className={styles.checkboxGrid}>
            {roles.map((role) => (
              <label key={`${editingUser.id}-${role.id}`} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={(userRoleDrafts[editingUser.id] ?? roleIdsOf(editingUser)).includes(role.id)}
                  onChange={() => toggleUserRoleDraft(editingUser.id, role.id)}
                />
                <span>{role.name}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}

      {passwordUser && (
        <Modal
          title={`Redefinir senha: ${passwordUser.username}`}
          subtitle="A nova senha deve ter no minimo 8 caracteres."
          onClose={() => setPasswordUserId(null)}
          size="sm"
          footer={(
            <>
              <button className={styles.secondaryBtn} onClick={() => setPasswordUserId(null)}>Cancelar</button>
              <button className={styles.primaryBtn} onClick={() => void handleResetPassword(passwordUser.id)}>
                Atualizar senha
              </button>
            </>
          )}
        >
          <input
            className={styles.input}
            type="password"
            placeholder="Nova senha"
            value={passwordDrafts[passwordUser.id] ?? ''}
            onChange={(e) => setPasswordDrafts((curr) => ({ ...curr, [passwordUser.id]: e.target.value }))}
          />
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Confirmar exclusao"
          subtitle={`Deseja remover ${deleteTarget.type === 'user' ? 'o usuario' : 'a role'} '${deleteTarget.label}'?`}
          onClose={() => setDeleteTarget(null)}
          size="sm"
          footer={(
            <>
              <button className={styles.secondaryBtn} onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button
                className={styles.dangerBtn}
                onClick={() => void (deleteTarget.type === 'user' ? handleRemoveUser(deleteTarget.id) : handleDeleteRole(deleteTarget.id))}
              >
                Confirmar exclusao
              </button>
            </>
          )}
        >
          <p className={styles.infoLine}>Essa acao nao pode ser desfeita.</p>
        </Modal>
      )}

      {qrCode && (
        <Modal
          title="Conectar WhatsApp"
          subtitle={`Instancia: ${qrInstance}`}
          onClose={() => setQrCode(null)}
          size="sm"
          footer={(
            <button className={styles.primaryBtn} onClick={() => setQrCode(null)}>
              Fechar
            </button>
          )}
        >
          <div className={styles.qrWrap}>
            <img src={qrCode} alt="QR Code da Evolution API" className={styles.qrImage} />
            <p className={styles.hint}>
              Abra o WhatsApp no celular, toque em Dispositivos conectados e escaneie este QR Code.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
