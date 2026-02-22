import { useState } from 'react';
import Modal from '../../ui/overlay/Modal/Modal';
import FormField from '../../ui/forms/FormField/FormField';
import { formStyles } from '../../ui/forms/FormField/FormField';
import {
  CheckIcon,
  AlertIcon,
  PlugIcon,
  SpinnerIcon,
  CloseIcon,
  PostgresIcon,
  MysqlIcon,
  MariadbIcon,
  MongodbIcon,
  SqlserverIcon,
  SqliteIcon,
  FilesIcon,
  DatabaseIcon,
} from '../../ui/icons/Icons';
import { DATASOURCE_TYPES } from '../../constants';
import type { DatasourceType } from '../../constants';
import { datasourceApi } from '../../services/api';
import type { ApiDatasourceDetail } from '../../services/api';
import styles from './AddDatasourceModal.module.css';

interface Props {
  onClose: () => void;
  onSave: (data: unknown, editId?: string) => Promise<void>;
  editData?: ApiDatasourceDetail | null;
}

interface FormState {
  name: string;
  enabled: boolean;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  sslEnabled: boolean;
  filePath: string;
  sourcePath: string;
  includePatterns: string;
  excludePatterns: string;
  tags: string[];
}

const INITIAL_FORM: FormState = {
  name: '',
  enabled: true,
  host: '',
  port: '',
  database: '',
  username: '',
  password: '',
  sslEnabled: false,
  filePath: '',
  sourcePath: '',
  includePatterns: '',
  excludePatterns: '',
  tags: [],
};

function initFormFromEdit(ds: ApiDatasourceDetail): FormState {
  const cfg = ds.connection_config;

  return {
    name: ds.name,
    enabled: ds.enabled,
    tags: [...ds.tags],
    host: String(cfg.host ?? ''),
    port: String(cfg.port ?? ''),
    database: String(cfg.database ?? ''),
    username: String(cfg.username ?? ''),
    password: '',
    sslEnabled: Boolean(cfg.ssl_enabled ?? false),
    filePath: String(cfg.file_path ?? ''),
    sourcePath: String(cfg.source_path ?? ''),
    includePatterns: Array.isArray(cfg.include_patterns)
      ? (cfg.include_patterns as string[]).join(', ')
      : String(cfg.include_patterns ?? ''),
    excludePatterns: Array.isArray(cfg.exclude_patterns)
      ? (cfg.exclude_patterns as string[]).join(', ')
      : String(cfg.exclude_patterns ?? ''),
  };
}

const DS_TYPE_ICON: Record<DatasourceType, React.ReactNode> = {
  postgres: <PostgresIcon />,
  mysql: <MysqlIcon />,
  mariadb: <MariadbIcon />,
  mongodb: <MongodbIcon />,
  sqlserver: <SqlserverIcon />,
  sqlite: <SqliteIcon />,
  files: <FilesIcon />,
};

export default function AddDatasourceModal({ onClose, onSave, editData }: Props) {
  const isEdit = !!editData;

  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
  const [selectedType, setSelectedType] = useState<DatasourceType | null>(isEdit ? editData.type : null);
  const [form, setForm] = useState<FormState>(isEdit ? initFormFromEdit(editData) : INITIAL_FORM);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const setCheck =
    (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.checked }));

  const goToStep2 = () => {
    if (!selectedType) return;

    const defaultPort = DATASOURCE_TYPES.find((t) => t.type === selectedType)?.defaultPort;
    setForm((prev) => ({ ...prev, port: defaultPort ? String(defaultPort) : '' }));
    setStep(2);
  };

  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    }
    if (e.key === 'Backspace' && !tagInput && form.tags.length > 0) {
      removeTag(form.tags[form.tags.length - 1]);
    }
  };

  const isRelational = selectedType && !['sqlite', 'files'].includes(selectedType);
  const missingPasswordOnEdit =
    !!isEdit &&
    !!isRelational &&
    (!editData || typeof editData.connection_config.password !== 'string' || editData.connection_config.password.length === 0);

  const isValid = (() => {
    if (!form.name.trim()) return false;
    if (selectedType === 'sqlite') return !!form.filePath.trim();
    if (selectedType === 'files') return !!form.sourcePath.trim();

    const base = !!form.host.trim() && !!form.database.trim() && !!form.username.trim();
    if (missingPasswordOnEdit) return base && !!form.password.trim();
    return isEdit ? base : base && !!form.password.trim();
  })();

  const handleTest = async () => {
    if (!selectedType) return;

    setTestResult(null);
    setTestMessage(null);

    if (!isEdit || !editData) {
      setTestResult('error');
      setTestMessage('Salve o datasource antes de executar o teste de conexao.');
      return;
    }

    try {
      setTesting(true);
      const response = await datasourceApi.test(editData.id);

      if (response.status === 'ok') {
        setTestResult('ok');
        setTestMessage(
          response.latency_ms != null
            ? `Conexao estabelecida (${response.latency_ms}ms).`
            : 'Conexao estabelecida.',
        );
      } else {
        setTestResult('error');
        setTestMessage(response.message ?? 'Nao foi possivel conectar com esse datasource.');
      }
    } catch (err) {
      setTestResult('error');
      setTestMessage(err instanceof Error ? err.message : 'Falha ao testar conexao.');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedType || !isValid) return;

    let connectionConfig: Record<string, unknown> = {};

    if (selectedType === 'sqlite') {
      connectionConfig = { file_path: form.filePath };
    } else if (selectedType === 'files') {
      connectionConfig = {
        source_path: form.sourcePath,
        ...(form.includePatterns
          ? {
              include_patterns: form.includePatterns
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : {}),
        ...(form.excludePatterns
          ? {
              exclude_patterns: form.excludePatterns
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : {}),
      };
    } else if (isRelational) {
      const defaultPort = selectedType === 'postgres' ? 5432 : 3306;
      connectionConfig = {
        host: form.host,
        port: parseInt(form.port, 10) || defaultPort,
        database: form.database,
        username: form.username,
        ssl_enabled: form.sslEnabled,
        ...(form.password ? { password: form.password } : {}),
      };
    }

    const payload = isEdit
      ? {
          name: form.name,
          connection_config: connectionConfig,
          enabled: form.enabled,
          tags: form.tags,
        }
      : {
          name: form.name,
          type: selectedType,
          connection_config: connectionConfig,
          enabled: form.enabled,
          tags: form.tags,
        };

    try {
      setSaving(true);
      setSaveError(null);
      await onSave(payload, editData?.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Falha ao salvar datasource.');
    } finally {
      setSaving(false);
    }
  };

  const typeLabel = selectedType ? DATASOURCE_TYPES.find((t) => t.type === selectedType)?.label : '';

  const footer = (
    <>
      {step === 2 && !isEdit && (
        <div className={styles.footerLeft}>
          <button
            className={styles.backBtn}
            onClick={() => {
              setStep(1);
              setTestResult(null);
              setTestMessage(null);
              setSaveError(null);
            }}
            disabled={saving || testing}
          >
            Voltar
          </button>
        </div>
      )}
      <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>
        Cancelar
      </button>
      {step === 1 ? (
        <button className={styles.primaryBtn} disabled={!selectedType || saving} onClick={goToStep2}>
          Proximo
        </button>
      ) : (
        <>
          {selectedType !== 'files' && (
            <button className={styles.testBtn} onClick={handleTest} disabled={testing || saving || !isValid}>
              {testing ? <SpinnerIcon /> : <PlugIcon />}
              {testing ? 'Testando...' : 'Testar Conexao'}
            </button>
          )}
          <button className={styles.primaryBtn} onClick={handleSave} disabled={!isValid || saving || testing}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar alteracoes' : 'Salvar'}
          </button>
        </>
      )}
    </>
  );

  return (
    <Modal
      title={isEdit ? 'Editar Datasource' : 'Adicionar Datasource'}
      subtitle={step === 1 ? 'Escolha o tipo de banco de dados' : `Configurar conexao ${typeLabel}`}
      onClose={onClose}
      footer={footer}
      size="lg"
    >
      {!isEdit && (
        <div className={styles.steps}>
          <div className={`${styles.step} ${step >= 1 ? styles.stepDone : ''}`}>
            <span className={styles.stepNum}>{step > 1 ? <CheckIcon width={10} height={10} /> : '1'}</span>
            <span>Tipo</span>
          </div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step >= 2 ? styles.stepDone : ''}`}>
            <span className={styles.stepNum}>2</span>
            <span>Configuracao</span>
          </div>
        </div>
      )}

      {step === 1 && !isEdit && (
        <div className={styles.typeGrid}>
          {DATASOURCE_TYPES.map((opt) => (
            <button
              key={opt.type}
              className={`${styles.typeCard} ${selectedType === opt.type ? styles.typeCardActive : ''}`}
              onClick={() => setSelectedType(opt.type)}
            >
              <div className={`${styles.typeCardIcon} ${styles[opt.type]}`}>{DS_TYPE_ICON[opt.type]}</div>
              <span className={styles.typeCardLabel}>{opt.label}</span>
              <span className={styles.typeCardDesc}>{opt.description}</span>
              {selectedType === opt.type && (
                <span className={styles.typeCardCheck}>
                  <CheckIcon width={10} height={10} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {step === 2 && selectedType && (
        <div className={styles.formArea}>
          <div className={styles.sectionTitle}>
            <DatabaseIcon width={15} height={15} /> Informacoes gerais
          </div>
          <FormField label="Nome *" hint="Nome identificador para este datasource">
            <input
              className={formStyles.input}
              type="text"
              placeholder="Ex: Postgres Producao"
              value={form.name}
              onChange={set('name')}
            />
          </FormField>

          <label className={formStyles.checkLabel}>
            <input type="checkbox" checked={form.enabled} onChange={setCheck('enabled')} />
            <span>Datasource habilitado</span>
          </label>

          <div className={formStyles.divider} />

          {isRelational && (
            <>
              <div className={styles.sectionTitle}>
                {DS_TYPE_ICON[selectedType]} Conexao
              </div>
              <div className={formStyles.grid2}>
                <FormField label="Host *">
                  <input
                    className={formStyles.input}
                    type="text"
                    placeholder="localhost ou db.empresa.com"
                    value={form.host}
                    onChange={set('host')}
                  />
                </FormField>
                <FormField label="Porta">
                  <input className={formStyles.input} type="number" value={form.port} onChange={set('port')} />
                </FormField>
              </div>

              <FormField label="Database *">
                <input
                  className={formStyles.input}
                  type="text"
                  placeholder="meu_banco"
                  value={form.database}
                  onChange={set('database')}
                />
              </FormField>

              <div className={formStyles.grid2}>
                <FormField label="Usuario *">
                  <input
                    className={formStyles.input}
                    type="text"
                    placeholder="app_user"
                    value={form.username}
                    onChange={set('username')}
                  />
                </FormField>
                <FormField
                  label={isEdit ? (missingPasswordOnEdit ? 'Senha *' : 'Nova senha') : 'Senha *'}
                  hint={isEdit ? (missingPasswordOnEdit ? 'Este datasource esta sem senha salva. Informe a senha para habilitar schema/query.' : 'Deixe em branco para manter a senha atual') : undefined}
                >
                  <input
                    className={formStyles.input}
                    type="password"
                    placeholder={isEdit ? 'Manter senha atual' : ''}
                    value={form.password}
                    onChange={set('password')}
                  />
                </FormField>
              </div>

              <label className={formStyles.checkLabel}>
                <input type="checkbox" checked={form.sslEnabled} onChange={setCheck('sslEnabled')} />
                <span>Usar SSL / TLS</span>
              </label>
            </>
          )}

          {selectedType === 'sqlite' && (
            <>
              <div className={styles.sectionTitle}>
                <SqliteIcon width={15} height={15} /> Arquivo do banco
              </div>
              <FormField label="Caminho do arquivo *" hint="Caminho absoluto para o arquivo .db no servidor">
                <input
                  className={formStyles.input}
                  type="text"
                  placeholder="/data/database.db"
                  value={form.filePath}
                  onChange={set('filePath')}
                />
              </FormField>
            </>
          )}

          {selectedType === 'files' && (
            <>
              <div className={styles.sectionTitle}>
                <FilesIcon width={15} height={15} /> Diretorio fonte
              </div>
              <FormField label="Caminho de origem *" hint="Diretorio a ser incluido no backup">
                <input
                  className={formStyles.input}
                  type="text"
                  placeholder="/var/www/uploads"
                  value={form.sourcePath}
                  onChange={set('sourcePath')}
                />
              </FormField>
              <FormField label="Padroes de inclusao" hint="Glob patterns separados por virgula">
                <input
                  className={formStyles.input}
                  type="text"
                  placeholder="*.jpg, *.png"
                  value={form.includePatterns}
                  onChange={set('includePatterns')}
                />
              </FormField>
              <FormField label="Padroes de exclusao" hint="Glob patterns para ignorar">
                <input
                  className={formStyles.input}
                  type="text"
                  placeholder="*.tmp, node_modules"
                  value={form.excludePatterns}
                  onChange={set('excludePatterns')}
                />
              </FormField>
            </>
          )}

          <div className={formStyles.divider} />

          <FormField label="Tags" hint="Pressione Enter ou virgula para adicionar">
            <div className={styles.tagsWrap}>
              {form.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                  <button className={styles.tagRemove} onClick={() => removeTag(tag)}>
                    <CloseIcon width={8} height={8} />
                  </button>
                </span>
              ))}
              <input
                className={styles.tagInput}
                type="text"
                placeholder={form.tags.length === 0 ? 'Ex: prod, principal' : ''}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => {
                  if (tagInput) addTag(tagInput);
                }}
              />
            </div>
          </FormField>

          {testResult === 'ok' && (
            <div className={styles.testOk}>
              <CheckIcon /> {testMessage ?? 'Conexao estabelecida com sucesso!'}
            </div>
          )}
          {testResult === 'error' && (
            <div className={styles.testError}>
              <AlertIcon /> {testMessage ?? 'Nao foi possivel conectar. Verifique os dados.'}
            </div>
          )}
          {saveError && (
            <div className={styles.testError}>
              <AlertIcon /> {saveError}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}


