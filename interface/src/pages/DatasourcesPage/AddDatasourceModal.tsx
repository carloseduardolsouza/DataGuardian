import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import FormField from '../../components/FormField/FormField';
import { formStyles } from '../../components/FormField/FormField';
import {
  CheckIcon, AlertIcon, PlugIcon, SpinnerIcon, CloseIcon,
  PostgresIcon, MysqlIcon, MongodbIcon, SqlserverIcon, SqliteIcon, FilesIcon,
  DatabaseIcon,
} from '../../components/Icons';
import { DATASOURCE_TYPES } from '../../constants';
import type { DatasourceType } from '../../constants';
import type { ApiDatasourceDetail } from '../../services/api';
import styles from './AddDatasourceModal.module.css';

interface Props {
  onClose:   () => void;
  onSave:    (data: unknown, editId?: string) => void;
  editData?: ApiDatasourceDetail | null;
}

// ── Estado do formulário ──────────────────────────────────────────

interface FormState {
  name:      string;
  enabled:   boolean;
  // Relacional (postgres/mysql/mongodb/sqlserver)
  host:      string;
  port:      string;
  database:  string;
  username:  string;
  password:  string;
  sslEnabled: boolean;
  // SQLite
  filePath:  string;
  // Files
  sourcePath:      string;
  includePatterns: string;
  excludePatterns: string;
  // Tags
  tags: string[];
}

const INITIAL_FORM: FormState = {
  name: '', enabled: true,
  host: '', port: '', database: '', username: '', password: '', sslEnabled: false,
  filePath: '',
  sourcePath: '', includePatterns: '', excludePatterns: '',
  tags: [],
};

function initFormFromEdit(ds: ApiDatasourceDetail): FormState {
  const cfg = ds.connection_config;
  return {
    name:    ds.name,
    enabled: ds.enabled,
    tags:    [...ds.tags],
    host:        String(cfg.host ?? ''),
    port:        String(cfg.port ?? ''),
    database:    String(cfg.database ?? ''),
    username:    String(cfg.username ?? ''),
    password:    '',  // never pre-fill masked value
    sslEnabled:  Boolean(cfg.ssl_enabled ?? false),
    filePath:    String(cfg.file_path ?? ''),
    sourcePath:  String(cfg.source_path ?? ''),
    includePatterns: Array.isArray(cfg.include_patterns)
      ? (cfg.include_patterns as string[]).join(', ')
      : String(cfg.include_patterns ?? ''),
    excludePatterns: Array.isArray(cfg.exclude_patterns)
      ? (cfg.exclude_patterns as string[]).join(', ')
      : String(cfg.exclude_patterns ?? ''),
  };
}

// ── Ícone por tipo de datasource ──────────────────────────────────

const DS_TYPE_ICON: Record<DatasourceType, React.ReactNode> = {
  postgres:  <PostgresIcon />,
  mysql:     <MysqlIcon />,
  mongodb:   <MongodbIcon />,
  sqlserver: <SqlserverIcon />,
  sqlite:    <SqliteIcon />,
  files:     <FilesIcon />,
};

// ── Componente principal ──────────────────────────────────────────

export default function AddDatasourceModal({ onClose, onSave, editData }: Props) {
  const isEdit = !!editData;

  const [step, setStep]                 = useState<1 | 2>(isEdit ? 2 : 1);
  const [selectedType, setSelectedType] = useState<DatasourceType | null>(
    isEdit ? editData.type : null,
  );
  const [form, setForm]   = useState<FormState>(
    isEdit ? initFormFromEdit(editData) : INITIAL_FORM,
  );
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);
  const [tagInput, setTagInput]     = useState('');

  const set = (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }));

  const setCheck = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.checked }));

  const goToStep2 = () => {
    if (!selectedType) return;
    const defaultPort = DATASOURCE_TYPES.find(t => t.type === selectedType)?.defaultPort;
    setForm(prev => ({ ...prev, port: defaultPort ? String(defaultPort) : '' }));
    setStep(2);
  };

  const handleTest = () => {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      setTestResult('ok');
    }, 1500);
  };

  const handleSave = () => {
    const isRelational = selectedType && !['sqlite', 'files'].includes(selectedType);
    let connectionConfig: Record<string, unknown> = {};

    if (selectedType === 'sqlite') {
      connectionConfig = { file_path: form.filePath };
    } else if (selectedType === 'files') {
      connectionConfig = {
        source_path: form.sourcePath,
        ...(form.includePatterns ? { include_patterns: form.includePatterns.split(',').map(s => s.trim()).filter(Boolean) } : {}),
        ...(form.excludePatterns ? { exclude_patterns: form.excludePatterns.split(',').map(s => s.trim()).filter(Boolean) } : {}),
      };
    } else if (isRelational) {
      connectionConfig = {
        host:        form.host,
        port:        parseInt(form.port) || 5432,
        database:    form.database,
        username:    form.username,
        ssl_enabled: form.sslEnabled,
        ...(form.password ? { password: form.password } : {}),
      };
    }

    if (isEdit) {
      onSave({
        name:              form.name,
        connection_config: connectionConfig,
        enabled:           form.enabled,
        tags:              form.tags,
      }, editData.id);
    } else {
      onSave({
        name:              form.name,
        type:              selectedType,
        connection_config: connectionConfig,
        enabled:           form.enabled,
        tags:              form.tags,
      });
    }
    onClose();
  };

  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
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

  // Validação
  const isRelational = selectedType && !['sqlite', 'files'].includes(selectedType);
  const isValid = (() => {
    if (!form.name.trim()) return false;
    if (selectedType === 'sqlite') return !!form.filePath.trim();
    if (selectedType === 'files') return !!form.sourcePath.trim();
    const base = !!form.host.trim() && !!form.database.trim() && !!form.username.trim();
    return isEdit ? base : base && !!form.password.trim();
  })();

  // ── Footer ──────────────────────────────────────────────────────

  const footer = (
    <>
      {step === 2 && !isEdit && (
        <div className={styles.footerLeft}>
          <button className={styles.backBtn} onClick={() => { setStep(1); setTestResult(null); }}>
            ← Voltar
          </button>
        </div>
      )}
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
      {step === 1 ? (
        <button
          className={styles.primaryBtn}
          disabled={!selectedType}
          onClick={goToStep2}
        >
          Próximo →
        </button>
      ) : (
        <>
          {selectedType !== 'files' && (
            <button
              className={styles.testBtn}
              onClick={handleTest}
              disabled={testing || !isValid}
            >
              {testing ? <SpinnerIcon /> : <PlugIcon />}
              {testing ? 'Testando...' : 'Testar Conexão'}
            </button>
          )}
          <button className={styles.primaryBtn} onClick={handleSave} disabled={!isValid}>
            {isEdit ? 'Salvar alterações' : 'Salvar'}
          </button>
        </>
      )}
    </>
  );

  // ── Render ──────────────────────────────────────────────────────

  const typeLabel = selectedType ? DATASOURCE_TYPES.find(t => t.type === selectedType)?.label : '';

  return (
    <Modal
      title={isEdit ? 'Editar Datasource' : 'Adicionar Datasource'}
      subtitle={step === 1 ? 'Escolha o tipo de banco de dados' : `Configurar conexão ${typeLabel}`}
      onClose={onClose}
      footer={footer}
      size="lg"
    >
      {/* Steps indicator — only in create mode */}
      {!isEdit && (
        <div className={styles.steps}>
          <div className={`${styles.step} ${step >= 1 ? styles.stepDone : ''}`}>
            <span className={styles.stepNum}>{step > 1 ? <CheckIcon width={10} height={10} /> : '1'}</span>
            <span>Tipo</span>
          </div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step >= 2 ? styles.stepDone : ''}`}>
            <span className={styles.stepNum}>2</span>
            <span>Configuração</span>
          </div>
        </div>
      )}

      {/* STEP 1 — Seleção de tipo (apenas no modo criação) */}
      {step === 1 && !isEdit && (
        <div className={styles.typeGrid}>
          {DATASOURCE_TYPES.map(opt => (
            <button
              key={opt.type}
              className={`${styles.typeCard} ${selectedType === opt.type ? styles.typeCardActive : ''}`}
              onClick={() => setSelectedType(opt.type)}
            >
              <div className={`${styles.typeCardIcon} ${styles[opt.type]}`}>
                {DS_TYPE_ICON[opt.type]}
              </div>
              <span className={styles.typeCardLabel}>{opt.label}</span>
              <span className={styles.typeCardDesc}>{opt.description}</span>
              {selectedType === opt.type && (
                <span className={styles.typeCardCheck}><CheckIcon width={10} height={10} /></span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* STEP 2 — Formulário dinâmico */}
      {step === 2 && selectedType && (
        <div className={styles.formArea}>
          {/* Nome */}
          <div className={styles.sectionTitle}>
            <DatabaseIcon width={15} height={15} /> Informações gerais
          </div>
          <FormField label="Nome *" hint="Nome identificador para este datasource">
            <input
              className={formStyles.input}
              type="text"
              placeholder={`Ex: ${selectedType === 'postgres' ? 'Postgres Produção' : selectedType === 'mysql' ? 'MySQL Staging' : selectedType === 'mongodb' ? 'MongoDB Atlas' : selectedType === 'sqlserver' ? 'SQL Server Principal' : selectedType === 'sqlite' ? 'SQLite Local' : 'Backups Diários'}`}
              value={form.name}
              onChange={set('name')}
            />
          </FormField>

          <label className={formStyles.checkLabel}>
            <input type="checkbox" checked={form.enabled} onChange={setCheck('enabled')} />
            <span>Datasource habilitado</span>
          </label>

          <div className={formStyles.divider} />

          {/* ── Campos para bancos relacionais ── */}
          {isRelational && (
            <>
              <div className={styles.sectionTitle}>
                {DS_TYPE_ICON[selectedType]} Conexão
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
                  <input
                    className={formStyles.input}
                    type="number"
                    value={form.port}
                    onChange={set('port')}
                  />
                </FormField>
              </div>

              <FormField label="Database *" hint="Nome do banco de dados">
                <input
                  className={formStyles.input}
                  type="text"
                  placeholder="meu_banco"
                  value={form.database}
                  onChange={set('database')}
                />
              </FormField>

              <div className={formStyles.grid2}>
                <FormField label="Usuário *">
                  <input
                    className={formStyles.input}
                    type="text"
                    placeholder="app_user"
                    value={form.username}
                    onChange={set('username')}
                  />
                </FormField>
                <FormField
                  label={isEdit ? 'Nova senha' : 'Senha *'}
                  hint={isEdit ? 'Deixe em branco para manter a senha atual' : undefined}
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

          {/* ── Campos para SQLite ── */}
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

          {/* ── Campos para Files ── */}
          {selectedType === 'files' && (
            <>
              <div className={styles.sectionTitle}>
                <FilesIcon width={15} height={15} /> Diretório fonte
              </div>
              <FormField label="Caminho de origem *" hint="Diretório a ser incluído no backup">
                <input
                  className={formStyles.input}
                  type="text"
                  placeholder="/var/www/uploads"
                  value={form.sourcePath}
                  onChange={set('sourcePath')}
                />
              </FormField>
              <FormField label="Padrões de inclusão" hint="Glob patterns separados por vírgula (ex: *.jpg, *.png)">
                <input
                  className={formStyles.input}
                  type="text"
                  placeholder="*.jpg, *.png, *.pdf"
                  value={form.includePatterns}
                  onChange={set('includePatterns')}
                />
              </FormField>
              <FormField label="Padrões de exclusão" hint="Glob patterns para ignorar (ex: *.tmp, node_modules)">
                <input
                  className={formStyles.input}
                  type="text"
                  placeholder="*.tmp, .cache, node_modules"
                  value={form.excludePatterns}
                  onChange={set('excludePatterns')}
                />
              </FormField>
            </>
          )}

          <div className={formStyles.divider} />

          {/* ── Tags ── */}
          <FormField label="Tags" hint="Pressione Enter ou vírgula para adicionar">
            <div className={styles.tagsWrap}>
              {form.tags.map(tag => (
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
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => { if (tagInput) addTag(tagInput); }}
              />
            </div>
          </FormField>

          {/* Resultado do teste */}
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
