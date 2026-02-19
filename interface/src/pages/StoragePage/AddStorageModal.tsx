import { useState } from 'react';
import type { StorageType } from './mockData';
import styles from './AddStorageModal.module.css';
import { CheckIcon, AlertIcon, PlugIcon, SpinnerIcon, LocalStorageIcon, SshIcon, S3Icon, MinioIcon, BackblazeIcon } from '../../components/Icons';
import FormField, { formStyles } from '../../components/FormField/FormField';
import Modal from '../../components/Modal/Modal';
import { STORAGE_TYPES } from '../../constants';

interface Props {
  onClose: () => void;
  onSave:  (data: unknown) => void;
}

// ── S3 storage classes (specific to this modal) ─────────────────
const S3_STORAGE_CLASSES = [
  { value: 'STANDARD',     label: 'STANDARD — Acesso frequente' },
  { value: 'STANDARD_IA',  label: 'STANDARD_IA — Acesso infrequente (recomendado)' },
  { value: 'GLACIER',      label: 'GLACIER — Arquivamento (minutos para restaurar)' },
  { value: 'DEEP_ARCHIVE', label: 'DEEP_ARCHIVE — Arquivamento profundo (horas)' },
];

// ── Type icon mapping ───────────────────────────────────────────
const TYPE_ICON: Record<StorageType, React.ReactNode> = {
  local:     <LocalStorageIcon />,
  ssh:       <SshIcon />,
  s3:        <S3Icon />,
  minio:     <MinioIcon />,
  backblaze: <BackblazeIcon />,
};

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

  /* ── Footer content ─────────────────────────────────────────── */
  const footerContent = (
    <>
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
    </>
  );

  return (
    <Modal
      title="Adicionar Storage"
      subtitle={step === 1 ? 'Escolha o tipo de armazenamento' : 'Configure a conexão'}
      onClose={onClose}
      footer={footerContent}
      size="lg"
    >
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
                {TYPE_ICON[opt.type]}
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
          <FormField label="Nome *">
            <input
              className={formStyles.input}
              type="text"
              placeholder={`Ex: ${selectedType === 'ssh' ? 'NAS do escritório' : selectedType === 's3' ? 'S3 Produção' : 'Storage principal'}`}
              value={form.name}
              onChange={set('name')}
            />
          </FormField>

          <label className={formStyles.checkLabel}>
            <input type="checkbox" checked={form.isDefault} onChange={setCheck('isDefault')} />
            <span>Definir como local de armazenamento padrão</span>
          </label>

          <div className={formStyles.divider} />

          {/* ── Local ──────────────────────────────── */}
          {selectedType === 'local' && (
            <>
              <FormField label="Caminho absoluto *" hint="Diretório no servidor onde os backups serão salvos">
                <input className={formStyles.input} type="text" placeholder="/backups" value={form.localPath} onChange={set('localPath')} />
              </FormField>
              <FormField label="Tamanho máximo (GB)" hint="0 = sem limite">
                <input className={formStyles.input} type="number" min="0" value={form.localMaxSizeGb} onChange={set('localMaxSizeGb')} />
              </FormField>
            </>
          )}

          {/* ── SSH / SFTP ─────────────────────────── */}
          {selectedType === 'ssh' && (
            <>
              <div className={formStyles.grid2}>
                <FormField label="Host *">
                  <input className={formStyles.input} type="text" placeholder="192.168.1.100 ou nas.local" value={form.sshHost} onChange={set('sshHost')} />
                </FormField>
                <FormField label="Porta">
                  <input className={formStyles.input} type="number" value={form.sshPort} onChange={set('sshPort')} />
                </FormField>
              </div>

              <FormField label="Usuário *">
                <input className={formStyles.input} type="text" placeholder="backup-user" value={form.sshUsername} onChange={set('sshUsername')} />
              </FormField>

              <FormField label="Autenticação">
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
              </FormField>

              {form.sshAuthMethod === 'key' ? (
                <FormField label="Chave privada SSH *" hint="Conteúdo do arquivo id_rsa ou id_ed25519">
                  <textarea
                    className={`${formStyles.input} ${formStyles.textarea}`}
                    rows={5}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                    value={form.sshPrivateKey}
                    onChange={set('sshPrivateKey')}
                  />
                </FormField>
              ) : (
                <FormField label="Senha *">
                  <input className={formStyles.input} type="password" value={form.sshPassword} onChange={set('sshPassword')} />
                </FormField>
              )}

              <FormField label="Caminho remoto *" hint="Diretório no servidor SSH onde os backups serão salvos">
                <input className={formStyles.input} type="text" placeholder="/volume1/backups" value={form.sshRemotePath} onChange={set('sshRemotePath')} />
              </FormField>
            </>
          )}

          {/* ── Amazon S3 ──────────────────────────── */}
          {selectedType === 's3' && (
            <>
              <FormField label="Endpoint" hint="Altere para usar Wasabi, DigitalOcean Spaces, ou outro compatível">
                <input className={formStyles.input} type="text" value={form.s3Endpoint} onChange={set('s3Endpoint')} />
              </FormField>

              <div className={formStyles.grid2}>
                <FormField label="Bucket *">
                  <input className={formStyles.input} type="text" placeholder="meu-bucket-backups" value={form.s3Bucket} onChange={set('s3Bucket')} />
                </FormField>
                <FormField label="Região">
                  <input className={formStyles.input} type="text" placeholder="us-east-1" value={form.s3Region} onChange={set('s3Region')} />
                </FormField>
              </div>

              <FormField label="Storage Class" hint="Define custo e tempo de recuperação dos arquivos">
                <select className={formStyles.select} value={form.s3StorageClass} onChange={set('s3StorageClass')}>
                  {S3_STORAGE_CLASSES.map(sc => (
                    <option key={sc.value} value={sc.value}>{sc.label}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Access Key ID *">
                <input className={formStyles.input} type="text" placeholder="AKIAXXXXXXXXXXX" value={form.s3AccessKeyId} onChange={set('s3AccessKeyId')} />
              </FormField>
              <FormField label="Secret Access Key *">
                <input className={formStyles.input} type="password" value={form.s3SecretKey} onChange={set('s3SecretKey')} />
              </FormField>
            </>
          )}

          {/* ── MinIO ──────────────────────────────── */}
          {selectedType === 'minio' && (
            <>
              <FormField label="Endpoint *" hint="URL do servidor MinIO, incluindo porta">
                <input className={formStyles.input} type="text" placeholder="http://minio.internal:9000" value={form.minioEndpoint} onChange={set('minioEndpoint')} />
              </FormField>
              <FormField label="Bucket *">
                <input className={formStyles.input} type="text" placeholder="dataguardian" value={form.minioBucket} onChange={set('minioBucket')} />
              </FormField>
              <FormField label="Access Key *">
                <input className={formStyles.input} type="text" placeholder="minioadmin" value={form.minioAccessKey} onChange={set('minioAccessKey')} />
              </FormField>
              <FormField label="Secret Key *">
                <input className={formStyles.input} type="password" value={form.minioSecret} onChange={set('minioSecret')} />
              </FormField>
              <label className={formStyles.checkLabel}>
                <input type="checkbox" checked={form.minioUseSsl} onChange={setCheck('minioUseSsl')} />
                <span>Usar SSL / TLS</span>
              </label>
            </>
          )}

          {/* ── Backblaze B2 ───────────────────────── */}
          {selectedType === 'backblaze' && (
            <>
              <div className={formStyles.grid2}>
                <FormField label="Bucket Name *">
                  <input className={formStyles.input} type="text" placeholder="dg-backups-offsite" value={form.b2BucketName} onChange={set('b2BucketName')} />
                </FormField>
                <FormField label="Bucket ID *">
                  <input className={formStyles.input} type="text" placeholder="e73ede9969c64427a54" value={form.b2BucketId} onChange={set('b2BucketId')} />
                </FormField>
              </div>
              <FormField label="Application Key ID *">
                <input className={formStyles.input} type="text" placeholder="004axxxxxxxxxxxx" value={form.b2AppKeyId} onChange={set('b2AppKeyId')} />
              </FormField>
              <FormField label="Application Key *">
                <input className={formStyles.input} type="password" value={form.b2AppKey} onChange={set('b2AppKey')} />
              </FormField>
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
    </Modal>
  );
}
