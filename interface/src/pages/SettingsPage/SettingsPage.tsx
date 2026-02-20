import { useEffect, useMemo, useState } from 'react';
import { systemApi } from '../../services/api';
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

export default function SettingsPage() {
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

  useEffect(() => {
    void loadSettings();
  }, []);

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
          <p className={styles.subtitle}>Configure integracoes sem JSON manual e com status claro do que falta.</p>
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
