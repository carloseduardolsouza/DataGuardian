import { useEffect, useMemo, useState } from 'react';
import { systemApi } from '../../services/api';
import type { ApiSystemSettingsMap } from '../../services/api';
import { AlertTriangleIcon, CheckCircleIcon, PlusIcon, SpinnerIcon, TrashIcon } from '../../components/Icons';
import styles from './SettingsPage.module.css';

type SmtpConfig = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  from?: string;
  to?: string[];
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<ApiSystemSettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [maxConcurrentBackups, setMaxConcurrentBackups] = useState(3);
  const [tempDirectory, setTempDirectory] = useState('/tmp/dataguardian');
  const [healthIntervalMs, setHealthIntervalMs] = useState(300000);
  const [schedulerIntervalMs, setSchedulerIntervalMs] = useState(60000);

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTo, setSmtpTo] = useState('');

  const [newKey, setNewKey] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newValueJson, setNewValueJson] = useState('""');
  const [creating, setCreating] = useState(false);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const data = await systemApi.list();
      setSettings(data);

      setMaxConcurrentBackups(asNumber(data['system.max_concurrent_backups']?.value, 3));
      setTempDirectory(asString(data['system.temp_directory']?.value, '/tmp/dataguardian'));
      setHealthIntervalMs(asNumber(data['system.health_check_interval_ms']?.value, 300000));
      setSchedulerIntervalMs(asNumber(data['system.scheduler_interval_ms']?.value, 60000));

      setEmailEnabled(asBool(data['notifications.email_enabled']?.value, false));
      setWebhookUrl(asString(data['notifications.webhook_url']?.value, ''));

      const smtp = (data['notifications.email_smtp_config']?.value ?? {}) as SmtpConfig;
      setSmtpHost(asString(smtp.host));
      setSmtpPort(asNumber(smtp.port, 587));
      setSmtpUser(asString(smtp.user));
      setSmtpPassword('');
      setSmtpFrom(asString(smtp.from));
      setSmtpTo(Array.isArray(smtp.to) ? smtp.to.join(', ') : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar configuracoes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  const advancedKeys = useMemo(() => {
    return Object.keys(settings).sort();
  }, [settings]);

  async function handleSaveCoreAndNotifications() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await systemApi.updateMany({
        'system.max_concurrent_backups': maxConcurrentBackups,
        'system.temp_directory': tempDirectory,
        'system.health_check_interval_ms': healthIntervalMs,
        'system.scheduler_interval_ms': schedulerIntervalMs,
        'notifications.email_enabled': emailEnabled,
        'notifications.webhook_url': webhookUrl.trim() ? webhookUrl.trim() : null,
        'notifications.email_smtp_config': {
          host: smtpHost.trim(),
          port: smtpPort,
          user: smtpUser.trim(),
          ...(smtpPassword.trim() ? { password: smtpPassword } : {}),
          from: smtpFrom.trim(),
          to: smtpTo.split(',').map((v) => v.trim()).filter(Boolean),
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

  async function handleTestSmtp() {
    try {
      setError(null);
      setSuccess(null);
      const result = await systemApi.testSmtp();
      setSuccess(result.message ?? 'Teste SMTP executado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao testar SMTP.');
    }
  }

  async function handleCreateSetting() {
    try {
      setCreating(true);
      setError(null);
      setSuccess(null);

      const parsed = JSON.parse(newValueJson);
      await systemApi.create({
        key: newKey.trim(),
        value: parsed,
        description: newDescription.trim() || null,
      });

      setNewKey('');
      setNewDescription('');
      setNewValueJson('""');
      setSuccess('Configuracao criada com sucesso.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar configuracao.');
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateAdvancedKey(key: string, valueJson: string) {
    try {
      setError(null);
      setSuccess(null);
      const parsed = JSON.parse(valueJson);
      await systemApi.updateByKey(key, { value: parsed });
      setSuccess(`Configuracao '${key}' atualizada.`);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Falha ao atualizar '${key}'.`);
    }
  }

  async function handleDeleteAdvancedKey(key: string) {
    if (!confirm(`Remover configuracao '${key}'?`)) return;

    try {
      setError(null);
      setSuccess(null);
      await systemApi.removeByKey(key);
      setSuccess(`Configuracao '${key}' removida.`);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Falha ao remover '${key}'.`);
    }
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
          <h2 className={styles.title}>Configuracoes do Sistema</h2>
          <p className={styles.subtitle}>Gerencie parametros globais, notificacoes e chaves avancadas.</p>
        </div>
        <button className={styles.primaryBtn} onClick={() => void handleSaveCoreAndNotifications()} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar alteracoes'}
        </button>
      </div>

      {error && <div className={`${styles.alert} ${styles.alertError}`}><AlertTriangleIcon width={14} height={14} /> {error}</div>}
      {success && <div className={`${styles.alert} ${styles.alertOk}`}><CheckCircleIcon width={14} height={14} /> {success}</div>}

      <div className={styles.grid}>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Sistema</h3>
          <label className={styles.field}>
            <span>Maximo de backups simultaneos</span>
            <input className={styles.input} type="number" min={1} value={maxConcurrentBackups} onChange={(e) => setMaxConcurrentBackups(Number(e.target.value))} />
          </label>
          <label className={styles.field}>
            <span>Diretorio temporario</span>
            <input className={styles.input} type="text" value={tempDirectory} onChange={(e) => setTempDirectory(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Intervalo do health worker (ms)</span>
            <input className={styles.input} type="number" min={10000} value={healthIntervalMs} onChange={(e) => setHealthIntervalMs(Number(e.target.value))} />
          </label>
          <label className={styles.field}>
            <span>Intervalo do scheduler (ms)</span>
            <input className={styles.input} type="number" min={5000} value={schedulerIntervalMs} onChange={(e) => setSchedulerIntervalMs(Number(e.target.value))} />
          </label>
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Notificacoes</h3>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
            <span>Habilitar envio por e-mail</span>
          </label>
          <label className={styles.field}>
            <span>Webhook URL</span>
            <input className={styles.input} type="text" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
          </label>
          <div className={styles.divider} />
          <h4 className={styles.subTitle}>SMTP</h4>
          <label className={styles.field}><span>Host</span><input className={styles.input} type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} /></label>
          <label className={styles.field}><span>Porta</span><input className={styles.input} type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} /></label>
          <label className={styles.field}><span>Usuario</span><input className={styles.input} type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} /></label>
          <label className={styles.field}><span>Nova senha (opcional)</span><input className={styles.input} type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} /></label>
          <label className={styles.field}><span>From</span><input className={styles.input} type="text" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} /></label>
          <label className={styles.field}><span>Destinatarios (separados por virgula)</span><input className={styles.input} type="text" value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} /></label>

          <button className={styles.secondaryBtn} onClick={() => void handleTestSmtp()}>
            Testar SMTP
          </button>
        </section>
      </div>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>CRUD de chaves (avancado)</h3>

        <div className={styles.newRow}>
          <input className={styles.input} type="text" placeholder="Nova chave (ex: app.custom_key)" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <input className={styles.input} type="text" placeholder="Descricao" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          <input className={styles.input} type="text" placeholder='Valor JSON (ex: {"enabled":true})' value={newValueJson} onChange={(e) => setNewValueJson(e.target.value)} />
          <button className={styles.primaryBtn} onClick={() => void handleCreateSetting()} disabled={creating || !newKey.trim()}>
            <PlusIcon width={14} height={14} /> {creating ? 'Criando...' : 'Criar'}
          </button>
        </div>

        <div className={styles.advancedList}>
          {advancedKeys.map((key) => (
            <AdvancedRow
              key={key}
              settingKey={key}
              initialValue={JSON.stringify(settings[key]?.value ?? null)}
              description={settings[key]?.description ?? ''}
              updatedAt={settings[key]?.updated_at ?? ''}
              onSave={handleUpdateAdvancedKey}
              onDelete={handleDeleteAdvancedKey}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function AdvancedRow({
  settingKey,
  initialValue,
  description,
  updatedAt,
  onSave,
  onDelete,
}: {
  settingKey: string;
  initialValue: string;
  description: string;
  updatedAt: string;
  onSave: (key: string, valueJson: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}) {
  const [valueJson, setValueJson] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValueJson(initialValue);
  }, [initialValue]);

  return (
    <div className={styles.advancedRow}>
      <div className={styles.advancedMeta}>
        <p className={styles.advancedKey}>{settingKey}</p>
        <p className={styles.advancedDesc}>{description || 'Sem descricao'} • {updatedAt ? new Date(updatedAt).toLocaleString('pt-BR') : '-'}</p>
      </div>
      <textarea className={styles.textarea} rows={3} value={valueJson} onChange={(e) => setValueJson(e.target.value)} />
      <div className={styles.actionsRow}>
        <button className={styles.secondaryBtn} onClick={async () => { setSaving(true); await onSave(settingKey, valueJson); setSaving(false); }} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button className={styles.dangerBtn} onClick={() => void onDelete(settingKey)}>
          <TrashIcon width={14} height={14} /> Remover
        </button>
      </div>
    </div>
  );
}
