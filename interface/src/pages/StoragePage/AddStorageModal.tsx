import { useState } from 'react';
import type { StorageType } from './mockData';
import styles from './AddStorageModal.module.css';

interface Props {
  onClose: () => void;
  onSave:  (data: unknown) => void;
}

// ── Definição dos tipos de storage ───────────────────────────────

interface StorageTypeOption {
  type:        StorageType;
  label:       string;
  description: string;
}

const STORAGE_TYPES: StorageTypeOption[] = [
  { type: 'local',     label: 'Disco Local',   description: 'Diretório no servidor onde a API está rodando' },
  { type: 'ssh',       label: 'SSH / SFTP',    description: 'NAS ou servidor remoto via protocolo SSH' },
  { type: 's3',        label: 'Amazon S3',     description: 'AWS S3 ou compatível: Wasabi, DO Spaces, etc.' },
  { type: 'minio',     label: 'MinIO',         description: 'Object storage S3-compatível self-hosted' },
  { type: 'backblaze', label: 'Backblaze B2',  description: 'Cloud storage de baixo custo da Backblaze' },
];

const S3_STORAGE_CLASSES = [
  { value: 'STANDARD',     label: 'STANDARD — Acesso frequente' },
  { value: 'STANDARD_IA',  label: 'STANDARD_IA — Acesso infrequente (recomendado)' },
  { value: 'GLACIER',      label: 'GLACIER — Arquivamento (minutos para restaurar)' },
  { value: 'DEEP_ARCHIVE', label: 'DEEP_ARCHIVE — Arquivamento profundo (horas)' },
];

// ── Formulário ────────────────────────────────────────────────────

type AuthMethod = 'key' | 'password';

interface FormState {
  name:             string;
  isDefault:        boolean;
  // local
  localPath:        string;
  localMaxSizeGb:   string;
  // ssh
  sshHost:          string;
  sshPort:          string;
  sshUsername:      string;
  sshAuthMethod:    AuthMethod;
  sshPrivateKey:    string;
  sshPassword:      string;
  sshRemotePath:    string;
  // s3
  s3Endpoint:       string;
  s3Bucket:         string;
  s3Region:         string;
  s3StorageClass:   string;
  s3AccessKeyId:    string;
  s3SecretKey:      string;
  // minio
  minioEndpoint:    string;
  minioBucket:      string;
  minioAccessKey:   string;
  minioSecret:      string;
  minioUseSsl:      boolean;
  // backblaze
  b2BucketName:     string;
  b2BucketId:       string;
  b2AppKeyId:       string;
  b2AppKey:         string;
}

const INITIAL_FORM: FormState = {
  name: '', isDefault: false,
  localPath: '', localMaxSizeGb: '100',
  sshHost: '', sshPort: '22', sshUsername: '', sshAuthMethod: 'key',
  sshPrivateKey: '', sshPassword: '', sshRemotePath: '',
  s3Endpoint: 'https://s3.amazonaws.com', s3Bucket: '', s3Region: 'us-east-1',
  s3StorageClass: 'STANDARD_IA', s3AccessKeyId: '', s3SecretKey: '',
  minioEndpoint: '', minioBucket: '', minioAccessKey: '', minioSecret: '', minioUseSsl: false,
  b2BucketName: '', b2BucketId: '', b2AppKeyId: '', b2AppKey: '',
};

// ── Componente principal ──────────────────────────────────────────

export default function AddStorageModal({ onClose, onSave }: Props) {
  const [step, setStep]               = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<StorageType | null>(null);
  const [form, setForm]               = useState<FormState>(INITIAL_FORM);
  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState<'ok' | 'error' | null>(null);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const setCheck = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.checked }));

  const handleTest = () => {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      setTestResult('ok');
    }, 1500);
  };

  const handleSave = () => {
    onSave({ type: selectedType, ...form });
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* ── Header ────────────────────────────────────────── */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Adicionar Storage</h2>
            <p className={styles.sub}>
              {step === 1 ? 'Escolha o tipo de armazenamento' : 'Configure a conexão'}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Fechar">
            <CloseIcon />
          </button>
        </div>

        {/* ── Steps indicator ───────────────────────────────── */}
        <div className={styles.steps}>
          <div className={`${styles.step} ${step >= 1 ? styles.stepDone : ''}`}>
            <span className={styles.stepNum}>{step > 1 ? <CheckIcon /> : '1'}</span>
            <span>Tipo</span>
          </div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step >= 2 ? styles.stepDone : ''}`}>
            <span className={styles.stepNum}>2</span>
            <span>Configuração</span>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────── */}
        <div className={styles.body}>

          {/* STEP 1 — Seleção de tipo */}
          {step === 1 && (
            <div className={styles.typeGrid}>
              {STORAGE_TYPES.map(opt => (
                <button
                  key={opt.type}
                  className={`${styles.typeCard} ${selectedType === opt.type ? styles.typeCardActive : ''}`}
                  onClick={() => setSelectedType(opt.type)}
                >
                  <div className={`${styles.typeCardIcon} ${styles[opt.type]}`}>
                    <TypeIcon type={opt.type} />
                  </div>
                  <span className={styles.typeCardLabel}>{opt.label}</span>
                  <span className={styles.typeCardDesc}>{opt.description}</span>
                  {selectedType === opt.type && (
                    <span className={styles.typeCardCheck}><CheckIcon /></span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* STEP 2 — Formulário dinâmico */}
          {step === 2 && selectedType && (
            <div className={styles.formArea}>
              {/* Campos comuns */}
              <Row label="Nome *">
                <input
                  className={styles.input}
                  type="text"
                  placeholder={`Ex: ${selectedType === 'ssh' ? 'NAS do escritório' : selectedType === 's3' ? 'S3 Produção' : 'Storage principal'}`}
                  value={form.name}
                  onChange={set('name')}
                />
              </Row>

              <label className={styles.checkLabel}>
                <input type="checkbox" checked={form.isDefault} onChange={setCheck('isDefault')} />
                <span>Definir como local de armazenamento padrão</span>
              </label>

              <div className={styles.divider} />

              {/* ── Local ──────────────────────────────── */}
              {selectedType === 'local' && (
                <>
                  <Row label="Caminho absoluto *" hint="Diretório no servidor onde os backups serão salvos">
                    <input className={styles.input} type="text" placeholder="/backups" value={form.localPath} onChange={set('localPath')} />
                  </Row>
                  <Row label="Tamanho máximo (GB)" hint="0 = sem limite">
                    <input className={styles.input} type="number" min="0" value={form.localMaxSizeGb} onChange={set('localMaxSizeGb')} />
                  </Row>
                </>
              )}

              {/* ── SSH / SFTP ─────────────────────────── */}
              {selectedType === 'ssh' && (
                <>
                  <div className={styles.grid2}>
                    <Row label="Host *">
                      <input className={styles.input} type="text" placeholder="192.168.1.100 ou nas.local" value={form.sshHost} onChange={set('sshHost')} />
                    </Row>
                    <Row label="Porta">
                      <input className={styles.input} type="number" value={form.sshPort} onChange={set('sshPort')} />
                    </Row>
                  </div>

                  <Row label="Usuário *">
                    <input className={styles.input} type="text" placeholder="backup-user" value={form.sshUsername} onChange={set('sshUsername')} />
                  </Row>

                  <Row label="Autenticação">
                    <div className={styles.radioGroup}>
                      <label className={styles.radioLabel}>
                        <input type="radio" name="authMethod" value="key" checked={form.sshAuthMethod === 'key'}
                          onChange={() => setForm(p => ({ ...p, sshAuthMethod: 'key' }))} />
                        <span>Chave SSH <span className={styles.recommended}>(recomendado)</span></span>
                      </label>
                      <label className={styles.radioLabel}>
                        <input type="radio" name="authMethod" value="password" checked={form.sshAuthMethod === 'password'}
                          onChange={() => setForm(p => ({ ...p, sshAuthMethod: 'password' }))} />
                        <span>Senha</span>
                      </label>
                    </div>
                  </Row>

                  {form.sshAuthMethod === 'key' ? (
                    <Row label="Chave privada SSH *" hint="Conteúdo do arquivo id_rsa ou id_ed25519">
                      <textarea
                        className={`${styles.input} ${styles.textarea}`}
                        rows={5}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                        value={form.sshPrivateKey}
                        onChange={set('sshPrivateKey')}
                      />
                    </Row>
                  ) : (
                    <Row label="Senha *">
                      <input className={styles.input} type="password" value={form.sshPassword} onChange={set('sshPassword')} />
                    </Row>
                  )}

                  <Row label="Caminho remoto *" hint="Diretório no servidor SSH onde os backups serão salvos">
                    <input className={styles.input} type="text" placeholder="/volume1/backups" value={form.sshRemotePath} onChange={set('sshRemotePath')} />
                  </Row>
                </>
              )}

              {/* ── Amazon S3 ──────────────────────────── */}
              {selectedType === 's3' && (
                <>
                  <Row label="Endpoint" hint="Altere para usar Wasabi, DigitalOcean Spaces, ou outro compatível">
                    <input className={styles.input} type="text" value={form.s3Endpoint} onChange={set('s3Endpoint')} />
                  </Row>

                  <div className={styles.grid2}>
                    <Row label="Bucket *">
                      <input className={styles.input} type="text" placeholder="meu-bucket-backups" value={form.s3Bucket} onChange={set('s3Bucket')} />
                    </Row>
                    <Row label="Região">
                      <input className={styles.input} type="text" placeholder="us-east-1" value={form.s3Region} onChange={set('s3Region')} />
                    </Row>
                  </div>

                  <Row label="Storage Class" hint="Define custo e tempo de recuperação dos arquivos">
                    <select className={styles.select} value={form.s3StorageClass} onChange={set('s3StorageClass')}>
                      {S3_STORAGE_CLASSES.map(sc => (
                        <option key={sc.value} value={sc.value}>{sc.label}</option>
                      ))}
                    </select>
                  </Row>

                  <Row label="Access Key ID *">
                    <input className={styles.input} type="text" placeholder="AKIAXXXXXXXXXXX" value={form.s3AccessKeyId} onChange={set('s3AccessKeyId')} />
                  </Row>
                  <Row label="Secret Access Key *">
                    <input className={styles.input} type="password" value={form.s3SecretKey} onChange={set('s3SecretKey')} />
                  </Row>
                </>
              )}

              {/* ── MinIO ──────────────────────────────── */}
              {selectedType === 'minio' && (
                <>
                  <Row label="Endpoint *" hint="URL do servidor MinIO, incluindo porta">
                    <input className={styles.input} type="text" placeholder="http://minio.internal:9000" value={form.minioEndpoint} onChange={set('minioEndpoint')} />
                  </Row>
                  <Row label="Bucket *">
                    <input className={styles.input} type="text" placeholder="dataguardian" value={form.minioBucket} onChange={set('minioBucket')} />
                  </Row>
                  <Row label="Access Key *">
                    <input className={styles.input} type="text" placeholder="minioadmin" value={form.minioAccessKey} onChange={set('minioAccessKey')} />
                  </Row>
                  <Row label="Secret Key *">
                    <input className={styles.input} type="password" value={form.minioSecret} onChange={set('minioSecret')} />
                  </Row>
                  <label className={styles.checkLabel}>
                    <input type="checkbox" checked={form.minioUseSsl} onChange={setCheck('minioUseSsl')} />
                    <span>Usar SSL / TLS</span>
                  </label>
                </>
              )}

              {/* ── Backblaze B2 ───────────────────────── */}
              {selectedType === 'backblaze' && (
                <>
                  <div className={styles.grid2}>
                    <Row label="Bucket Name *">
                      <input className={styles.input} type="text" placeholder="dg-backups-offsite" value={form.b2BucketName} onChange={set('b2BucketName')} />
                    </Row>
                    <Row label="Bucket ID *">
                      <input className={styles.input} type="text" placeholder="e73ede9969c64427a54" value={form.b2BucketId} onChange={set('b2BucketId')} />
                    </Row>
                  </div>
                  <Row label="Application Key ID *">
                    <input className={styles.input} type="text" placeholder="004axxxxxxxxxxxx" value={form.b2AppKeyId} onChange={set('b2AppKeyId')} />
                  </Row>
                  <Row label="Application Key *">
                    <input className={styles.input} type="password" value={form.b2AppKey} onChange={set('b2AppKey')} />
                  </Row>
                </>
              )}

              {/* Resultado do teste de conexão */}
              {testResult === 'ok' && (
                <div className={styles.testOk}>
                  <CheckIcon /> Conexão estabelecida com sucesso!
                </div>
              )}
              {testResult === 'error' && (
                <div className={styles.testError}>
                  <AlertIcon /> Não foi possível conectar. Verifique as credenciais.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div className={styles.footer}>
          {step === 2 && (
            <button className={styles.backBtn} onClick={() => { setStep(1); setTestResult(null); }}>
              ← Voltar
            </button>
          )}

          <div className={styles.footerRight}>
            <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>

            {step === 1 ? (
              <button
                className={styles.primaryBtn}
                disabled={!selectedType}
                onClick={() => setStep(2)}
              >
                Próximo →
              </button>
            ) : (
              <>
                <button
                  className={styles.testBtn}
                  onClick={handleTest}
                  disabled={testing}
                >
                  {testing ? <SpinnerIcon /> : <PlugIcon />}
                  {testing ? 'Testando...' : 'Testar Conexão'}
                </button>
                <button className={styles.primaryBtn} onClick={handleSave}>
                  Salvar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helper: campo de formulário ─────────────────────────────────── */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={styles.formRow}>
      <label className={styles.label}>{label}</label>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

/* ── Ícone de tipo de storage ─────────────────────────────────────── */
function TypeIcon({ type }: { type: StorageType }) {
  switch (type) {
    case 'local':
      return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>;
    case 'ssh':
      return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
    case 's3':
      return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case 'minio':
      return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>;
    case 'backblaze':
      return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-4V4H4v16h16V10z"/><path d="M18 10l-4-6"/></svg>;
  }
}

/* ── Ícones utilitários ──────────────────────────────────────────── */
function CloseIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function CheckIcon()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function AlertIcon()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }
function PlugIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M7 7l10 10"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/></svg>; }
function SpinnerIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>; }
