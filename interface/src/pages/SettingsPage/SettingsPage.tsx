import { useEffect, useState } from 'react';
import { systemApi } from '../../services/api';
import { AlertTriangleIcon, CheckCircleIcon, SpinnerIcon } from '../../components/Icons';
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

export default function SettingsPage() {
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

  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [waApiUrl, setWaApiUrl] = useState('http://localhost:8080');
  const [waApiKey, setWaApiKey] = useState('');
  const [waInstance, setWaInstance] = useState('');
  const [waRecipients, setWaRecipients] = useState('');
  const [waImportantOnly, setWaImportantOnly] = useState(true);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const data = await systemApi.list();

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

      setWhatsappEnabled(asBool(data['notifications.whatsapp_enabled']?.value, false));
      const wa = (data['notifications.whatsapp_evolution_config']?.value ?? {}) as WhatsappEvolutionConfig;
      setWaApiUrl(asString(wa.api_url, 'http://localhost:8080'));
      setWaApiKey('');
      setWaInstance(asString(wa.instance));
      setWaRecipients(Array.isArray(wa.to) ? wa.to.join(', ') : '');
      setWaImportantOnly(asBool(wa.important_only, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar configuracoes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function handleSave() {
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
          to: parseCsv(smtpTo),
        },
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
          <p className={styles.subtitle}>Tela guiada para configurar sistema, e-mail, webhook e WhatsApp sem JSON manual.</p>
        </div>
        <button className={styles.primaryBtn} onClick={() => void handleSave()} disabled={saving}>
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
          <h3 className={styles.cardTitle}>Notificacoes por E-mail / Webhook</h3>
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
          <label className={styles.field}><span>Destinatarios (separados por virgula)</span><input className={styles.input} type="text" value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} placeholder="admin@empresa.com,devops@empresa.com" /></label>

          <button className={styles.secondaryBtn} onClick={() => void handleTestSmtp()}>
            Testar SMTP
          </button>
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>WhatsApp (Evolution API)</h3>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={whatsappEnabled} onChange={(e) => setWhatsappEnabled(e.target.checked)} />
            <span>Habilitar notificacoes via WhatsApp</span>
          </label>
          <label className={styles.field}>
            <span>URL da Evolution API</span>
            <input className={styles.input} type="text" value={waApiUrl} onChange={(e) => setWaApiUrl(e.target.value)} placeholder="http://localhost:8080" />
          </label>
          <label className={styles.field}>
            <span>API Key (deixe vazio para manter a atual)</span>
            <input className={styles.input} type="password" value={waApiKey} onChange={(e) => setWaApiKey(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Nome da instancia</span>
            <input className={styles.input} type="text" value={waInstance} onChange={(e) => setWaInstance(e.target.value)} placeholder="dataguardian" />
          </label>
          <label className={styles.field}>
            <span>Numeros de destino (com DDI, separados por virgula)</span>
            <input className={styles.input} type="text" value={waRecipients} onChange={(e) => setWaRecipients(e.target.value)} placeholder="5511999999999,5511888888888" />
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={waImportantOnly} onChange={(e) => setWaImportantOnly(e.target.checked)} />
            <span>Enviar somente notificacoes importantes (warning e critical)</span>
          </label>
        </section>
      </div>
    </div>
  );
}
