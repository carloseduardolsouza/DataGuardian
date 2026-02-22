import { useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import type { StorageType } from '../../constants';
import type { ApiStorageLocationDetail } from '../../services/api';
import { storageApi } from '../../services/api';
import styles from './AddStorageModal.module.css';
import {
  CheckIcon, AlertIcon, PlugIcon, SpinnerIcon,
  LocalStorageIcon, SshIcon, S3Icon, MinioIcon, BackblazeIcon,
} from '../../ui/icons/Icons';
import FormField, { formStyles } from '../../ui/forms/FormField/FormField';
import Modal from '../../ui/overlay/Modal/Modal';
import { STORAGE_TYPES } from '../../constants';

interface Props {
  onClose: () => void;
  onSave: (data: unknown, editId?: string) => Promise<void>;
  editData?: ApiStorageLocationDetail | null;
}

const S3_STORAGE_CLASSES = [
  { value: 'STANDARD', label: 'STANDARD - Acesso frequente' },
  { value: 'STANDARD_IA', label: 'STANDARD_IA - Acesso infrequente (recomendado)' },
  { value: 'GLACIER', label: 'GLACIER - Arquivamento (minutos para restaurar)' },
  { value: 'DEEP_ARCHIVE', label: 'DEEP_ARCHIVE - Arquivamento profundo (horas)' },
];

const TYPE_ICON: Record<StorageType, ReactNode> = {
  local: <LocalStorageIcon />,
  ssh: <SshIcon />,
  s3: <S3Icon />,
  minio: <MinioIcon />,
  backblaze: <BackblazeIcon />,
};

type AuthMethod = 'key' | 'password';

interface FormState {
  name: string;
  isDefault: boolean;
  localPath: string;
  localMaxSizeGb: string;
  sshHost: string;
  sshPort: string;
  sshUsername: string;
  sshAuthMethod: AuthMethod;
  sshPrivateKey: string;
  sshPassword: string;
  sshRemotePath: string;
  s3Endpoint: string;
  s3Bucket: string;
  s3Region: string;
  s3StorageClass: string;
  s3AccessKeyId: string;
  s3SecretKey: string;
  minioEndpoint: string;
  minioBucket: string;
  minioAccessKey: string;
  minioSecret: string;
  minioUseSsl: boolean;
  b2BucketName: string;
  b2BucketId: string;
  b2AppKeyId: string;
  b2AppKey: string;
}

const INITIAL_FORM: FormState = {
  name: '', isDefault: false,
  localPath: '', localMaxSizeGb: '100',
  sshHost: '', sshPort: '22', sshUsername: '', sshAuthMethod: 'key',
  sshPrivateKey: '', sshPassword: '', sshRemotePath: '',
  s3Endpoint: '', s3Bucket: '', s3Region: 'us-east-1',
  s3StorageClass: 'STANDARD_IA', s3AccessKeyId: '', s3SecretKey: '',
  minioEndpoint: '', minioBucket: '', minioAccessKey: '', minioSecret: '', minioUseSsl: false,
  b2BucketName: '', b2BucketId: '', b2AppKeyId: '', b2AppKey: '',
};

function initFormFromEdit(loc: ApiStorageLocationDetail): FormState {
  const cfg = loc.config;
  return {
    name: loc.name,
    isDefault: loc.is_default,
    localPath: String(cfg.path ?? ''),
    localMaxSizeGb: String(cfg.max_size_gb ?? '100'),
    sshHost: String(cfg.host ?? ''),
    sshPort: String(cfg.port ?? '22'),
    sshUsername: String(cfg.username ?? ''),
    sshAuthMethod: (cfg.auth_method as AuthMethod) ?? 'key',
    sshPrivateKey: '',
    sshPassword: '',
    sshRemotePath: String(cfg.remote_path ?? ''),
    s3Endpoint: String(cfg.endpoint ?? ''),
    s3Bucket: String(cfg.bucket ?? ''),
    s3Region: String(cfg.region ?? 'us-east-1'),
    s3StorageClass: String(cfg.storage_class ?? 'STANDARD_IA'),
    s3AccessKeyId: String(cfg.access_key_id ?? ''),
    s3SecretKey: '',
    minioEndpoint: String(cfg.endpoint ?? ''),
    minioBucket: String(cfg.bucket ?? ''),
    minioAccessKey: String(cfg.access_key ?? ''),
    minioSecret: '',
    minioUseSsl: Boolean(cfg.use_ssl ?? false),
    b2BucketName: String(cfg.bucket_name ?? ''),
    b2BucketId: String(cfg.bucket_id ?? ''),
    b2AppKeyId: String(cfg.application_key_id ?? ''),
    b2AppKey: '',
  };
}

export default function AddStorageModal({ onClose, onSave, editData }: Props) {
  const isEdit = !!editData;

  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
  const [selectedType, setSelectedType] = useState<StorageType | null>(
    isEdit ? editData.type as StorageType : null,
  );
  const [form, setForm] = useState<FormState>(isEdit ? initFormFromEdit(editData) : INITIAL_FORM);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(prev => ({ ...prev, [key]: e.target.value }));
      setFormError(null);
      setTestResult(null);
    };

  const setCheck = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [key]: e.target.checked }));
    setFormError(null);
    setTestResult(null);
  };

  const buildConfig = () => {
    if (!selectedType) return {};

    if (selectedType === 'local') {
      return {
        path: form.localPath,
        ...(form.localMaxSizeGb.trim() ? { max_size_gb: Number(form.localMaxSizeGb) } : {}),
      };
    }

    if (selectedType === 'ssh') {
      return {
        host: form.sshHost,
        port: Number(form.sshPort) || 22,
        username: form.sshUsername,
        remote_path: form.sshRemotePath,
        ...(form.sshAuthMethod === 'key' && form.sshPrivateKey ? { private_key: form.sshPrivateKey } : {}),
        ...(form.sshAuthMethod === 'password' && form.sshPassword ? { password: form.sshPassword } : {}),
      };
    }

    if (selectedType === 's3') {
      return {
        endpoint: form.s3Endpoint.trim() ? form.s3Endpoint : null,
        bucket: form.s3Bucket,
        region: form.s3Region,
        storage_class: form.s3StorageClass,
        access_key_id: form.s3AccessKeyId,
        ...(form.s3SecretKey ? { secret_access_key: form.s3SecretKey } : {}),
      };
    }

    if (selectedType === 'minio') {
      return {
        endpoint: form.minioEndpoint,
        bucket: form.minioBucket,
        access_key: form.minioAccessKey,
        ...(form.minioSecret ? { secret_key: form.minioSecret } : {}),
        use_ssl: form.minioUseSsl,
      };
    }

    return {
      bucket_name: form.b2BucketName,
      bucket_id: form.b2BucketId,
      application_key_id: form.b2AppKeyId,
      ...(form.b2AppKey ? { application_key: form.b2AppKey } : {}),
    };
  };

  const validate = (): string | null => {
    if (!selectedType) return 'Selecione o tipo de storage.';
    if (!form.name.trim()) return 'Informe o nome do storage.';

    if (selectedType === 'local') {
      if (!form.localPath.trim()) return 'Informe o caminho absoluto do storage local.';
      return null;
    }

    if (selectedType === 'ssh') {
      if (!form.sshHost.trim()) return 'Informe o host do servidor SSH.';
      if (!form.sshUsername.trim()) return 'Informe o usuário SSH.';
      if (!form.sshRemotePath.trim()) return 'Informe o caminho remoto.';
      if (!isEdit && form.sshAuthMethod === 'key' && !form.sshPrivateKey.trim()) return 'Informe a chave privada SSH.';
      if (!isEdit && form.sshAuthMethod === 'password' && !form.sshPassword.trim()) return 'Informe a senha SSH.';
      return null;
    }

    if (selectedType === 's3') {
      if (!form.s3Bucket.trim()) return 'Informe o bucket S3.';
      if (!form.s3Region.trim()) return 'Informe a região S3.';
      if (!form.s3AccessKeyId.trim()) return 'Informe o Access Key ID.';
      if (!isEdit && !form.s3SecretKey.trim()) return 'Informe o Secret Access Key.';
      return null;
    }

    if (selectedType === 'minio') {
      if (!form.minioEndpoint.trim()) return 'Informe o endpoint do MinIO.';
      if (!form.minioBucket.trim()) return 'Informe o bucket do MinIO.';
      if (!form.minioAccessKey.trim()) return 'Informe o Access Key do MinIO.';
      if (!isEdit && !form.minioSecret.trim()) return 'Informe o Secret Key do MinIO.';
      return null;
    }

    if (!form.b2BucketName.trim()) return 'Informe o Bucket Name da Backblaze.';
    if (!form.b2BucketId.trim()) return 'Informe o Bucket ID da Backblaze.';
    if (!form.b2AppKeyId.trim()) return 'Informe o Application Key ID.';
    if (!isEdit && !form.b2AppKey.trim()) return 'Informe a Application Key.';

    return null;
  };

  const handleTest = async () => {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!selectedType) return;

    try {
      setTesting(true);
      setFormError(null);
      setTestResult(null);

      const result = await storageApi.testConfig({
        type: selectedType,
        config: buildConfig(),
      });

      setTestResult({
        kind: 'ok',
        message: `Conexão OK${result.latency_ms !== null ? ` - ${result.latency_ms}ms` : ''}`,
      });
    } catch (err) {
      setTestResult({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível validar a conexão.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!selectedType) return;

    const config = buildConfig();

    try {
      setSaving(true);
      setFormError(null);

      if (isEdit) {
        await onSave({
          name: form.name.trim(),
          config,
          is_default: form.isDefault,
        }, editData.id);
      } else {
        await onSave({
          name: form.name.trim(),
          type: selectedType,
          config,
          is_default: form.isDefault,
        });
      }

      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar storage.');
    } finally {
      setSaving(false);
    }
  };

  const footerContent = (
    <>
      {step === 2 && !isEdit && (
        <button className={styles.backBtn} onClick={() => { setStep(1); setTestResult(null); }} disabled={saving || testing}>
          {'<- Voltar'}
        </button>
      )}

      <div className={styles.footerRight}>
        <button className={styles.cancelBtn} onClick={onClose} disabled={saving || testing}>Cancelar</button>

        {step === 1 ? (
          <button
            className={styles.primaryBtn}
            disabled={!selectedType || saving || testing}
            onClick={() => setStep(2)}
          >
            {'Próximo ->'}
          </button>
        ) : (
          <>
            <button
              className={styles.testBtn}
              onClick={handleTest}
              disabled={testing || saving}
            >
              {testing ? <SpinnerIcon /> : <PlugIcon />}
              {testing ? 'Testando...' : 'Testar Conexão'}
            </button>
            <button className={styles.primaryBtn} onClick={handleSave} disabled={saving || testing}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Salvar'}
            </button>
          </>
        )}
      </div>
    </>
  );

  return (
    <Modal
      title={isEdit ? 'Editar Storage' : 'Adicionar Storage'}
      subtitle={step === 1 ? 'Escolha o tipo de armazenamento' : 'Configure a conexão'}
      onClose={onClose}
      footer={footerContent}
      size="lg"
    >
      {!isEdit && (
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
      )}

      {step === 1 && !isEdit && (
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

      {step === 2 && selectedType && (
        <div className={styles.formArea}>
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

          {selectedType === 'local' && (
            <>
              <FormField label="Caminho absoluto *" hint="Diretório no servidor onde os backups serão salvos">
                <input className={formStyles.input} type="text" placeholder="/backups" value={form.localPath} onChange={set('localPath')} />
              </FormField>
              <FormField label="Tamanho máximo (GB)" hint="Opcional. Ex: 500">
                <input className={formStyles.input} type="number" min="1" value={form.localMaxSizeGb} onChange={set('localMaxSizeGb')} />
              </FormField>
            </>
          )}

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
                <FormField
                  label={isEdit ? 'Nova chave privada SSH' : 'Chave privada SSH *'}
                  hint={isEdit ? 'Deixe em branco para manter a chave atual' : 'Conteúdo do arquivo id_rsa ou id_ed25519'}
                >
                  <textarea
                    className={`${formStyles.input} ${formStyles.textarea}`}
                    rows={5}
                    placeholder={isEdit ? 'Manter chave atual' : '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
                    value={form.sshPrivateKey}
                    onChange={set('sshPrivateKey')}
                  />
                </FormField>
              ) : (
                <FormField
                  label={isEdit ? 'Nova senha' : 'Senha *'}
                  hint={isEdit ? 'Deixe em branco para manter a senha atual' : undefined}
                >
                  <input
                    className={formStyles.input}
                    type="password"
                    placeholder={isEdit ? 'Manter senha atual' : ''}
                    value={form.sshPassword}
                    onChange={set('sshPassword')}
                  />
                </FormField>
              )}

              <FormField label="Caminho remoto *" hint="Diretório no servidor SSH onde os backups serão salvos">
                <input className={formStyles.input} type="text" placeholder="/volume1/backups" value={form.sshRemotePath} onChange={set('sshRemotePath')} />
              </FormField>
            </>
          )}

          {selectedType === 's3' && (
            <>
              <FormField label="Endpoint" hint="Deixe vazio para usar endpoint padrão AWS S3">
                <input className={formStyles.input} type="text" value={form.s3Endpoint} onChange={set('s3Endpoint')} />
              </FormField>

              <div className={formStyles.grid2}>
                <FormField label="Bucket *">
                  <input className={formStyles.input} type="text" placeholder="meu-bucket-backups" value={form.s3Bucket} onChange={set('s3Bucket')} />
                </FormField>
                <FormField label="Região *">
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
              <FormField
                label={isEdit ? 'Nova Secret Access Key' : 'Secret Access Key *'}
                hint={isEdit ? 'Deixe em branco para manter a chave atual' : undefined}
              >
                <input
                  className={formStyles.input}
                  type="password"
                  placeholder={isEdit ? 'Manter chave atual' : ''}
                  value={form.s3SecretKey}
                  onChange={set('s3SecretKey')}
                />
              </FormField>
            </>
          )}

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
              <FormField
                label={isEdit ? 'Nova Secret Key' : 'Secret Key *'}
                hint={isEdit ? 'Deixe em branco para manter a chave atual' : undefined}
              >
                <input
                  className={formStyles.input}
                  type="password"
                  placeholder={isEdit ? 'Manter chave atual' : ''}
                  value={form.minioSecret}
                  onChange={set('minioSecret')}
                />
              </FormField>
              <label className={formStyles.checkLabel}>
                <input type="checkbox" checked={form.minioUseSsl} onChange={setCheck('minioUseSsl')} />
                <span>Usar SSL / TLS</span>
              </label>
            </>
          )}

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
              <FormField
                label={isEdit ? 'Nova Application Key' : 'Application Key *'}
                hint={isEdit ? 'Deixe em branco para manter a chave atual' : undefined}
              >
                <input
                  className={formStyles.input}
                  type="password"
                  placeholder={isEdit ? 'Manter chave atual' : ''}
                  value={form.b2AppKey}
                  onChange={set('b2AppKey')}
                />
              </FormField>
            </>
          )}

          {formError && (
            <div className={styles.testError}>
              <AlertIcon /> {formError}
            </div>
          )}

          {testResult?.kind === 'ok' && (
            <div className={styles.testOk}>
              <CheckIcon /> {testResult.message}
            </div>
          )}
          {testResult?.kind === 'error' && (
            <div className={styles.testError}>
              <AlertIcon /> {testResult.message}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}


