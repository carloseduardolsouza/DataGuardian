import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { backupsApi, datasourceApi } from '../../services/api';
import type {
  ApiBackupDatasourceSummary,
  ApiBackupEntry,
  ApiDatasource,
  ApiDatasourceDetail,
  ApiSchema,
  ApiSchemaTable,
} from '../../services/api';
import { useResizableWidth } from '../../hooks/useResizableWidth';
import { useCriticalAction } from '../../hooks/useCriticalAction';
import DatasourceList from './DatasourceList';
import AddDatasourceModal from './AddDatasourceModal';
import CreateTableModal from './CreateTableModal';
import ObjectExplorer from './ObjectExplorer';
import MainPanel from './MainPanel';
import ConfirmDialog from '../../ui/dialogs/ConfirmDialog/ConfirmDialog';
import Modal from '../../ui/overlay/Modal/Modal';
import {
  FolderIcon,
  DatabaseIcon,
  EditIcon,
  TrashIcon,
  PlugIcon,
  SpinnerIcon,
  PlayFilledIcon,
  ExportIcon,
} from '../../ui/icons/Icons';
import { DS_ABBR } from '../../constants';
import { ROUTE_PATHS } from '../../ui/navigation/Sidebar/Sidebar';
import styles from './DatasourcesPage.module.css';

const STATUS_LABELS: Record<string, string> = {
  healthy: 'Saudavel',
  warning: 'Atencao',
  critical: 'Critico',
  unknown: 'Desconhecido',
};

function formatDate(iso: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';

  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(value: number | string | null) {
  if (value === null) return '-';
  const bytes = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const amount = bytes / 1024 ** index;
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function storageStatusLabel(status: 'available' | 'missing' | 'unreachable' | 'unknown') {
  if (status === 'available') return 'Disponivel';
  if (status === 'missing') return 'Arquivo ausente';
  if (status === 'unreachable') return 'Inacessivel';
  return 'Desconhecido';
}

function storageStatusClass(status: 'available' | 'missing' | 'unreachable' | 'unknown') {
  if (status === 'available') return styles.storageStatusSuccess;
  if (status === 'missing') return styles.storageStatusWarning;
  if (status === 'unreachable') return styles.storageStatusDanger;
  return styles.storageStatusMuted;
}

function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getSchemaPrerequisiteError(
  datasource: ApiDatasource,
  detail: ApiDatasourceDetail | null,
): string | null {
  if (!detail) return null;
  if (
    datasource.type !== 'postgres'
    && datasource.type !== 'mysql'
    && datasource.type !== 'mariadb'
  ) return null;

  const cfg = detail.connection_config;
  if (!isFilledString(cfg.host)) return 'Host da conexao nao configurado.';
  if (!isFilledString(cfg.database)) return 'Database da conexao nao configurado.';
  if (!isFilledString(cfg.username)) return 'Usuario da conexao nao configurado.';
  if (!isFilledString(cfg.password)) {
    return 'Senha nao configurada para este datasource. Edite e informe a senha para carregar schema e executar queries.';
  }

  return null;
}

const SCHEMA_CACHE_PREFIX = 'dg-schema-cache:v1:';

function getSchemaCacheKey(datasourceId: string) {
  return `${SCHEMA_CACHE_PREFIX}${datasourceId}`;
}

function readSchemaCache(datasourceId: string): ApiSchema[] | null {
  try {
    const raw = localStorage.getItem(getSchemaCacheKey(datasourceId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as ApiSchema[];
  } catch {
    return null;
  }
}

function writeSchemaCache(datasourceId: string, schemas: ApiSchema[]) {
  try {
    localStorage.setItem(getSchemaCacheKey(datasourceId), JSON.stringify(schemas));
  } catch {
    /* sem acesso ao localStorage */
  }
}

interface DetailProps {
  datasource: ApiDatasource;
  detail: ApiDatasourceDetail | null;
  loadingDetail: boolean;
  loadingSchema: boolean;
  schemaError: string | null;
  schemaCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  testing: boolean;
  testResult: { status: string; latency_ms: number | null } | null;
}

function DatasourceDetail({
  datasource,
  detail,
  loadingDetail,
  loadingSchema,
  schemaError,
  schemaCount,
  onEdit,
  onDelete,
  onTest,
  testing,
  testResult,
}: DetailProps) {
  const connectionStatusLabel = STATUS_LABELS[datasource.status] ?? 'Desconhecido';
  const connectionStatusClass = styles[`status_${datasource.status}`];

  const schemaStatus = loadingSchema
    ? { label: 'Atualizando...', cls: styles.status_warning }
    : schemaError
      ? { label: 'Erro', cls: styles.status_critical }
      : { label: `${schemaCount} schema(s)`, cls: styles.status_healthy };

  const canRunQuery =
    !loadingDetail
    && !schemaError
    && (
      datasource.type === 'postgres'
      || datasource.type === 'mysql'
      || datasource.type === 'mariadb'
    );

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <div className={`${styles.detailTypeIcon} ${styles[datasource.type]}`}>
          {DS_ABBR[datasource.type]}
        </div>
        <div className={styles.detailHeaderInfo}>
          <h2 className={styles.detailTitle}>{datasource.name}</h2>
          <div className={styles.detailMeta}>
            <span className={`${styles.statusBadge} ${styles[`status_${datasource.status}`]}`}>
              {STATUS_LABELS[datasource.status]}
            </span>
            {datasource.classification && (
              <span className={styles.disabledBadge}>
                {`Classificacao: ${datasource.classification}`}
              </span>
            )}
            {!datasource.enabled && <span className={styles.disabledBadge}>Desabilitado</span>}
          </div>
        </div>
      </div>

      <div className={styles.detailActions}>
        <button className={styles.actionBtnTest} onClick={onTest} disabled={testing}>
          {testing ? <SpinnerIcon width={14} height={14} /> : <PlugIcon width={14} height={14} />}
          {testing ? 'Testando...' : 'Testar Conexao'}
        </button>
        <button className={styles.actionBtnEdit} onClick={onEdit}>
          <EditIcon width={14} height={14} /> Editar
        </button>
        <button className={styles.actionBtnDelete} onClick={onDelete}>
          <TrashIcon width={14} height={14} /> Remover
        </button>
      </div>

      {testResult && (
        <div className={`${styles.testResult} ${testResult.status === 'ok' ? styles.testOk : styles.testError}`}>
          {testResult.status === 'ok'
            ? `Conexao OK${testResult.latency_ms !== null ? ` - ${testResult.latency_ms}ms` : ''}`
            : 'Falha na conexao'}
        </div>
      )}

      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Status do Banco</p>
        <div className={styles.statusGrid}>
          <div className={styles.statusItem}>
            <span className={styles.statusItemLabel}>Conexao</span>
            <span className={`${styles.statusItemValue} ${connectionStatusClass}`}>
              {connectionStatusLabel}
            </span>
          </div>
          <div className={styles.statusItem}>
            <span className={styles.statusItemLabel}>Schema</span>
            <span className={`${styles.statusItemValue} ${schemaStatus.cls}`}>
              {schemaStatus.label}
            </span>
          </div>
          <div className={styles.statusItem}>
            <span className={styles.statusItemLabel}>Query SQL</span>
            <span className={`${styles.statusItemValue} ${canRunQuery ? styles.status_healthy : styles.status_warning}`}>
              {canRunQuery ? 'Disponivel' : 'Indisponivel'}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Configuracao de Conexao</p>
        {loadingDetail ? (
          <div className={styles.detailLoading}>
            <SpinnerIcon width={14} height={14} /> Carregando...
          </div>
        ) : detail ? (
          <div className={styles.configGrid}>
            {Object.entries(detail.connection_config).map(([key, value]) => (
              <div key={key} className={styles.configRow}>
                <span className={styles.configKey}>{key}</span>
                <span className={styles.configValue}>{String(value ?? '-')}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.detailEmpty}>Configuracao nao disponivel</p>
        )}
      </div>

      {datasource.tags.length > 0 && (
        <div className={styles.detailSection}>
          <p className={styles.detailSectionTitle}>Tags</p>
          <div className={styles.detailTags}>
            {datasource.tags.map((tag) => (
              <span key={tag} className={styles.detailTag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Historico</p>
        <div className={styles.configGrid}>
          <div className={styles.configRow}>
            <span className={styles.configKey}>Criado em</span>
            <span className={styles.configValue}>{formatDate(datasource.created_at)}</span>
          </div>
          <div className={styles.configRow}>
            <span className={styles.configKey}>Atualizado em</span>
            <span className={styles.configValue}>{formatDate(datasource.updated_at)}</span>
          </div>
          <div className={styles.configRow}>
            <span className={styles.configKey}>Ultimo health check</span>
            <span className={styles.configValue}>
              {datasource.last_health_check_at ? formatDate(datasource.last_health_check_at) : 'Nunca'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DatasourcesPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const criticalAction = useCriticalAction({ isAdmin });
  const navigate = useNavigate();
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth > 1200);
  const [datasources, setDatasources] = useState<ApiDatasource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDs, setSelectedDs] = useState<ApiDatasource | null>(null);
  const [detail, setDetail] = useState<ApiDatasourceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState<ApiDatasourceDetail | null>(null);
  const [tableModalDs, setTableModalDs] = useState<ApiDatasource | null>(null);
  const [tableModalSchema, setTableModalSchema] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiDatasource | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; latency_ms: number | null } | null>(null);

  const [schemas, setSchemas] = useState<ApiSchema[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<ApiSchemaTable | null>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; datasource: ApiDatasource } | null>(null);
  const [restoreTargetDatasource, setRestoreTargetDatasource] = useState<ApiDatasource | null>(null);
  const [importTargetDatasource, setImportTargetDatasource] = useState<ApiDatasource | null>(null);
  const [backupSources, setBackupSources] = useState<ApiBackupDatasourceSummary[]>([]);
  const [selectedBackupSourceId, setSelectedBackupSourceId] = useState<string | null>(null);
  const [availableBackups, setAvailableBackups] = useState<ApiBackupEntry[]>([]);
  const [loadingBackupSources, setLoadingBackupSources] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [selectedBackupExecutionId, setSelectedBackupExecutionId] = useState<string | null>(null);
  const [selectedStorageByExecution, setSelectedStorageByExecution] = useState<Record<string, string>>({});
  const [restoreVerificationMode, setRestoreVerificationMode] = useState(false);
  const [restoreKeepVerificationDatabase, setRestoreKeepVerificationDatabase] = useState(false);
  const [restoreDropExisting, setRestoreDropExisting] = useState(true);
  const [restoreConfirmationPhrase, setRestoreConfirmationPhrase] = useState('');
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importVerificationMode, setImportVerificationMode] = useState(false);
  const [importKeepVerificationDatabase, setImportKeepVerificationDatabase] = useState(false);
  const [importDropExisting, setImportDropExisting] = useState(true);
  const [importConfirmationPhrase, setImportConfirmationPhrase] = useState('');
  const [importSubmitting, setImportSubmitting] = useState(false);
  const listPane = useResizableWidth({
    storageKey: 'dg-ds-left-width',
    defaultWidth: 260,
    minWidth: 220,
    maxWidth: 420,
  });
  const detailPane = useResizableWidth({
    storageKey: 'dg-ds-middle-width',
    defaultWidth: 360,
    minWidth: 300,
    maxWidth: 560,
  });
  const explorerPane = useResizableWidth({
    storageKey: 'dg-ds-explorer-width',
    defaultWidth: 300,
    minWidth: 240,
    maxWidth: 440,
  });
  const restoreRequiredPhrase = restoreVerificationMode ? 'VERIFICAR RESTORE' : 'RESTAURAR';
  const importRequiredPhrase = importVerificationMode ? 'VERIFICAR RESTORE' : 'RESTAURAR';

  const filteredBackupSources = useMemo(() => {
    if (!restoreTargetDatasource) return [] as ApiBackupDatasourceSummary[];
    const sameType = backupSources.filter((item) => item.datasource_type === restoreTargetDatasource.type);
    return sameType;
  }, [backupSources, restoreTargetDatasource]);

  const loadDatasources = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await datasourceApi.list();
      setDatasources(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar datasources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDatasources();
  }, [loadDatasources]);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth > 1200);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!restoreTargetDatasource) return;
    const run = async () => {
      try {
        setLoadingBackupSources(true);
        const response = await backupsApi.listDatasources();
        setBackupSources(response.data);
        const typed = response.data.filter((item) => item.datasource_type === restoreTargetDatasource.type);
        const preferred = typed.find((item) => item.datasource_id !== restoreTargetDatasource.id) ?? typed[0] ?? null;
        setSelectedBackupSourceId(preferred?.datasource_id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar origens de backup');
        setBackupSources([]);
        setSelectedBackupSourceId(null);
      } finally {
        setLoadingBackupSources(false);
      }
    };
    void run();
  }, [restoreTargetDatasource]);

  useEffect(() => {
    if (!selectedBackupSourceId) {
      setAvailableBackups([]);
      setSelectedBackupExecutionId(null);
      setSelectedStorageByExecution({});
      return;
    }
    const run = async () => {
      try {
        setLoadingBackups(true);
        const response = await backupsApi.listByDatasource(selectedBackupSourceId);
        setAvailableBackups(response.backups);
        setSelectedBackupExecutionId(response.backups[0]?.execution_id ?? null);
        setSelectedStorageByExecution({});
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar backups da origem selecionada');
        setAvailableBackups([]);
        setSelectedBackupExecutionId(null);
        setSelectedStorageByExecution({});
      } finally {
        setLoadingBackups(false);
      }
    };
    void run();
  }, [selectedBackupSourceId]);

  const loadSchema = useCallback(async (
    ds: ApiDatasource,
    dsDetail: ApiDatasourceDetail | null,
    forceRefresh = false,
  ) => {
    setSchemaError(null);
    setSelectedTable(null);

    const configError = getSchemaPrerequisiteError(ds, dsDetail);
    if (configError) {
      setSchemas([]);
      setSchemaError(configError);
      return;
    }

    if (!forceRefresh) {
      const cachedSchemas = readSchemaCache(ds.id);
      if (cachedSchemas) {
        setSchemas(cachedSchemas);
        return;
      }
    }

    try {
      setLoadingSchema(true);
      const data = await datasourceApi.schema(ds.id);
      setSchemas(data);
      writeSchemaCache(ds.id, data);
    } catch (err) {
      setSchemas([]);
      setSchemaError(err instanceof Error ? err.message : 'Erro ao carregar schema');
    } finally {
      setLoadingSchema(false);
    }
  }, []);

  const handleSelect = useCallback(
    async (ds: ApiDatasource) => {
      setSelectedDs(ds);
      setDetail(null);
      setTestResult(null);

      setLoadingDetail(true);
      try {
        const [detailData] = await Promise.all([
          datasourceApi.getById(ds.id),
        ]);
        setDetail(detailData);
        await loadSchema(ds, detailData, false);
      } catch {
        setDetail(null);
        setSchemaError('Erro ao carregar detalhes da conexao.');
      } finally {
        setLoadingDetail(false);
      }
    },
    [loadSchema],
  );

  const handleAddNew = () => {
    setEditData(null);
    setShowModal(true);
  };

  const handleEdit = useCallback(
    async (ds: ApiDatasource) => {
      try {
        const d = detail?.id === ds.id ? detail : await datasourceApi.getById(ds.id);
        setEditData(d);
        setShowModal(true);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao carregar datasource');
      }
    },
    [detail],
  );

  const handleDelete = useCallback(
    async (ds: ApiDatasource) => {
      setDeleteTarget(ds);
    },
    [],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const done = await criticalAction.run({
        action: 'datasource.delete',
        actionLabel: 'Remover datasource',
        resourceType: 'datasource',
        resourceId: deleteTarget.id,
        execute: (auth) => datasourceApi.remove(deleteTarget.id, auth),
      });
      if (!done) return;

      setDatasources((prev) => {
        const next = prev.filter((d) => d.id !== deleteTarget.id);

        if (selectedDs?.id === deleteTarget.id) {
          if (next.length > 0) {
            void handleSelect(next[0]);
          } else {
            setSelectedDs(null);
            setDetail(null);
            setSchemas([]);
            setSchemaError(null);
          }
        }

        return next;
      });
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao remover datasource');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, handleSelect, selectedDs?.id, criticalAction]);

  const handleSave = useCallback(
    async (data: unknown, editId?: string) => {
      if (editId) {
        const updated = await datasourceApi.update(editId, data as Parameters<typeof datasourceApi.update>[1]);
        setDatasources((prev) => prev.map((d) => (d.id === editId ? updated : d)));
        await handleSelect(updated);
      } else {
        const created = await datasourceApi.create(data as Parameters<typeof datasourceApi.create>[0]);
        setDatasources((prev) => [created, ...prev]);
        await handleSelect(created);
      }

      setShowModal(false);
      setEditData(null);
    },
    [handleSelect],
  );

  const handleTest = useCallback(async () => {
    if (!selectedDs) return;

    try {
      setTesting(true);
      setTestResult(null);
      const r = await datasourceApi.test(selectedDs.id);
      setTestResult({ status: r.status, latency_ms: r.latency_ms });
    } catch {
      setTestResult({ status: 'error', latency_ms: null });
    } finally {
      setTesting(false);
    }
  }, [selectedDs]);

  const handleOpenCreateTable = useCallback((ds: ApiDatasource, schemaName?: string | null) => {
    if (ds.type !== 'postgres' && ds.type !== 'mysql' && ds.type !== 'mariadb') {
      alert(`Criacao de tabela nao suportada para datasource do tipo '${ds.type}'.`);
      return;
    }
    setTableModalDs(ds);
    setTableModalSchema(schemaName ?? null);
  }, []);

  const closeRestoreModal = () => {
    if (restoreSubmitting) return;
    setRestoreTargetDatasource(null);
    setBackupSources([]);
    setSelectedBackupSourceId(null);
    setAvailableBackups([]);
    setSelectedBackupExecutionId(null);
    setSelectedStorageByExecution({});
    setRestoreVerificationMode(false);
    setRestoreKeepVerificationDatabase(false);
    setRestoreDropExisting(true);
    setRestoreConfirmationPhrase('');
  };

  const closeImportModal = () => {
    if (importSubmitting) return;
    setImportTargetDatasource(null);
    setImportFile(null);
    setImportVerificationMode(false);
    setImportKeepVerificationDatabase(false);
    setImportDropExisting(true);
    setImportConfirmationPhrase('');
  };

  const handleOpenRestoreFromBackup = (datasource: ApiDatasource) => {
    setContextMenu(null);
    setError(null);
    setRestoreTargetDatasource(datasource);
    setRestoreVerificationMode(false);
    setRestoreKeepVerificationDatabase(false);
    setRestoreDropExisting(true);
    setRestoreConfirmationPhrase('');
  };

  const handleOpenImportRestore = (datasource: ApiDatasource) => {
    setContextMenu(null);
    setError(null);
    setImportTargetDatasource(datasource);
    setImportFile(null);
    setImportVerificationMode(false);
    setImportKeepVerificationDatabase(false);
    setImportDropExisting(true);
    setImportConfirmationPhrase('');
  };

  const selectedBackup = useMemo(
    () => availableBackups.find((item) => item.execution_id === selectedBackupExecutionId) ?? null,
    [availableBackups, selectedBackupExecutionId],
  );

  const handleRestoreFromBackup = async () => {
    if (!restoreTargetDatasource) return;
    if (!selectedBackupExecutionId) {
      setError('Selecione um backup para restaurar.');
      return;
    }

    if (restoreConfirmationPhrase.trim() !== restoreRequiredPhrase) {
      setError(`Confirmacao invalida. Digite '${restoreRequiredPhrase}' para continuar.`);
      return;
    }

    const storageLocationId = selectedStorageByExecution[selectedBackupExecutionId] || undefined;

    try {
      setRestoreSubmitting(true);
      setError(null);
      let executionId: string | null = null;
      const done = await criticalAction.run({
        action: 'backup.restore',
        actionLabel: 'Executar restore de backup',
        resourceType: 'backup_execution',
        resourceId: selectedBackupExecutionId,
        payload: {
          target_datasource_id: restoreTargetDatasource.id,
          verification_mode: restoreVerificationMode,
        },
        requestApprovalFirst: !isAdmin,
        execute: async (auth) => {
          const response = await backupsApi.restore(
            selectedBackupExecutionId,
            {
              storage_location_id: storageLocationId,
              target_datasource_id: restoreTargetDatasource.id,
              drop_existing: restoreDropExisting,
              verification_mode: restoreVerificationMode,
              keep_verification_database: restoreKeepVerificationDatabase,
              confirmation_phrase: restoreConfirmationPhrase.trim(),
            },
            auth,
          );
          executionId = response.execution_id;
        },
      });
      if (!done || !executionId) return;
      closeRestoreModal();
      navigate(ROUTE_PATHS.executions, {
        state: { openExecutionId: executionId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar restore');
    } finally {
      setRestoreSubmitting(false);
    }
  };

  const handleImportRestore = async () => {
    if (!importTargetDatasource) return;
    if (!importFile) {
      setError('Selecione um arquivo de backup para importar.');
      return;
    }

    if (importConfirmationPhrase.trim() !== importRequiredPhrase) {
      setError(`Confirmacao invalida. Digite '${importRequiredPhrase}' para continuar.`);
      return;
    }

    try {
      setImportSubmitting(true);
      setError(null);
      let executionId: string | null = null;
      const done = await criticalAction.run({
        action: 'backup.import_restore',
        actionLabel: 'Importar arquivo e restaurar backup',
        resourceType: 'datasource',
        resourceId: importTargetDatasource.id,
        payload: {
          file_name: importFile.name,
          verification_mode: importVerificationMode,
        },
        requestApprovalFirst: !isAdmin,
        execute: async (auth) => {
          const response = await backupsApi.importAndRestore({
            file: importFile,
            target_datasource_id: importTargetDatasource.id,
            drop_existing: importDropExisting,
            verification_mode: importVerificationMode,
            keep_verification_database: importKeepVerificationDatabase,
            confirmation_phrase: importConfirmationPhrase.trim(),
            auth,
          });
          executionId = response.execution_id;
        },
      });
      if (!done || !executionId) return;
      closeImportModal();
      navigate(ROUTE_PATHS.executions, {
        state: { openExecutionId: executionId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar arquivo e iniciar restore');
    } finally {
      setImportSubmitting(false);
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.leftPanel} style={isDesktop ? { width: listPane.width } : undefined}>
        <DatasourceList
          datasources={datasources}
          selectedId={selectedDs?.id ?? null}
          onSelect={handleSelect}
          onContextMenu={(datasource, x, y) => {
            setContextMenu({ datasource, x, y });
          }}
          onAddNew={handleAddNew}
          onEdit={handleEdit}
          onDelete={handleDelete}
          loading={loading}
          error={error}
        />
      </div>
      {isDesktop && (
        <div
          className={styles.resizeHandle}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar painel de lista"
          onPointerDown={listPane.startResize}
          onDoubleClick={listPane.resetWidth}
        />
      )}

      <div className={styles.middlePanel} style={isDesktop ? { width: detailPane.width } : undefined}>
        {selectedDs ? (
          <DatasourceDetail
            datasource={selectedDs}
            detail={detail}
            loadingDetail={loadingDetail}
            loadingSchema={loadingSchema}
            schemaError={schemaError}
            schemaCount={schemas.length}
            onEdit={() => handleEdit(selectedDs)}
            onDelete={() => handleDelete(selectedDs)}
            onTest={handleTest}
            testing={testing}
            testResult={testResult}
          />
        ) : (
          <div className={styles.explorerPlaceholder}>
            <FolderIcon width={40} height={40} />
            <p>Nenhum datasource selecionado</p>
            <span>Clique em um datasource para ver detalhes</span>
          </div>
        )}
      </div>
      {isDesktop && (
        <div
          className={styles.resizeHandle}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar painel de detalhes"
          onPointerDown={detailPane.startResize}
          onDoubleClick={detailPane.resetWidth}
        />
      )}

      <div className={styles.rightPanel}>
        {selectedDs ? (
          <div className={styles.rightWorkspace}>
            <div className={styles.explorerPane} style={isDesktop ? { width: explorerPane.width } : undefined}>
              <ObjectExplorer
                datasource={selectedDs}
                schemas={schemas}
                loading={loadingSchema}
                error={schemaError}
                selectedTable={selectedTable}
                onSelectTable={setSelectedTable}
                onRefresh={() => void loadSchema(selectedDs, detail, true)}
                onCreateTable={(schemaName) => handleOpenCreateTable(selectedDs, schemaName)}
              />
            </div>
            {isDesktop && (
              <div
                className={styles.resizeHandle}
                role="separator"
                aria-orientation="vertical"
                aria-label="Redimensionar explorador"
                onPointerDown={explorerPane.startResize}
                onDoubleClick={explorerPane.resetWidth}
              />
            )}
            <div className={styles.queryPane}>
              <MainPanel datasource={selectedDs} selectedTable={selectedTable} />
            </div>
          </div>
        ) : (
          <div className={styles.rightPlaceholder}>
            <DatabaseIcon width={56} height={56} />
            <h3>Gerenciador de Datasources</h3>
            <p>
              Selecione um datasource para visualizar detalhes de conexao e explorar a estrutura do banco de dados.
            </p>
          </div>
        )}
      </div>

      {showModal && (
        <AddDatasourceModal
          editData={editData}
          onClose={() => {
            setShowModal(false);
            setEditData(null);
          }}
          onSave={handleSave}
        />
      )}

      {tableModalDs && (
        <CreateTableModal
          datasource={tableModalDs}
          initialSchemaName={tableModalSchema}
          onClose={() => {
            setTableModalDs(null);
            setTableModalSchema(null);
          }}
          onCreated={async () => {
            if (selectedDs?.id === tableModalDs.id) {
              await loadSchema(selectedDs, detail, true);
            }
            if (selectedDs?.id !== tableModalDs.id) {
              await handleSelect(tableModalDs);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Confirmar exclusao de datasource"
        message={deleteTarget ? `Deseja remover o datasource "${deleteTarget.name}"?` : ''}
        confirmLabel="Excluir datasource"
        loading={deleting}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
      />

      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => handleOpenRestoreFromBackup(contextMenu.datasource)}
          >
            <PlayFilledIcon width={14} height={14} />
            Restaurar de backup
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => handleOpenImportRestore(contextMenu.datasource)}
          >
            <ExportIcon width={14} height={14} />
            Importar arquivo
          </button>
        </div>
      )}

      {restoreTargetDatasource && (
        <Modal
          title={`Restaurar no datasource: ${restoreTargetDatasource.name}`}
          subtitle="Selecione a origem do backup e confirme a operacao."
          onClose={closeRestoreModal}
          size="lg"
          footer={(
            <>
              <button className={styles.secondaryBtn} onClick={closeRestoreModal} disabled={restoreSubmitting}>
                Cancelar
              </button>
              <button
                className={styles.primaryBtn}
                onClick={() => void handleRestoreFromBackup()}
                disabled={restoreSubmitting || !selectedBackupExecutionId}
              >
                {restoreSubmitting ? (
                  <>
                    <SpinnerIcon width={14} height={14} />
                    Iniciando...
                  </>
                ) : (
                  <>
                    <PlayFilledIcon width={14} height={14} />
                    Iniciar restore
                  </>
                )}
              </button>
            </>
          )}
        >
          <div className={styles.modalContent}>
            {error && <p className={styles.errorInline}>{error}</p>}

            <label className={styles.field}>
              ORIGEM DOS BACKUPS
              <select
                className={styles.selectInput}
                value={selectedBackupSourceId ?? ''}
                onChange={(event) => setSelectedBackupSourceId(event.target.value || null)}
                disabled={loadingBackupSources || filteredBackupSources.length === 0}
              >
                {filteredBackupSources.length === 0 && (
                  <option value="">Nenhuma origem com backups disponivel</option>
                )}
                {filteredBackupSources.map((item) => (
                  <option key={item.datasource_id} value={item.datasource_id}>
                    {item.datasource_name} ({item.datasource_type}) - {item.backups_count} backup{item.backups_count !== 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.backupList}>
              {loadingBackups ? (
                <div className={styles.stateLine}>
                  <SpinnerIcon width={14} height={14} />
                  Carregando backups...
                </div>
              ) : availableBackups.length === 0 ? (
                <div className={styles.stateLine}>Nenhum backup encontrado para a origem selecionada.</div>
              ) : (
                availableBackups.map((backup) => {
                  const availableLocations = backup.storage_locations.filter((item) => item.status === 'available');
                  const selectedLocation = selectedStorageByExecution[backup.execution_id];
                  return (
                    <label
                      key={backup.execution_id}
                      className={`${styles.backupCard}${selectedBackupExecutionId === backup.execution_id ? ` ${styles.backupCardSelected}` : ''}`}
                    >
                      <div className={styles.backupCardTop}>
                        <input
                          type="radio"
                          name="backupExecution"
                          checked={selectedBackupExecutionId === backup.execution_id}
                          onChange={() => setSelectedBackupExecutionId(backup.execution_id)}
                        />
                        <div className={styles.backupCardMeta}>
                          <strong>{backup.job.name}</strong>
                          <span>
                            {formatDate(backup.finished_at ?? backup.created_at)} - {formatBytes(backup.compressed_size_bytes ?? backup.size_bytes)}
                          </span>
                        </div>
                      </div>
                      <div className={styles.backupCardStorageList}>
                        {backup.storage_locations.map((location) => (
                          <span key={`${backup.execution_id}:${location.storage_location_id}`} className={`${styles.storageChip} ${storageStatusClass(location.status)}`}>
                            {location.storage_name} - {storageStatusLabel(location.status)}
                          </span>
                        ))}
                      </div>
                      <label className={styles.field}>
                        STORAGE PARA RESTORE (OPCIONAL)
                        <select
                          className={styles.selectInput}
                          value={selectedLocation ?? ''}
                          onChange={(event) => {
                            const next = event.target.value;
                            setSelectedStorageByExecution((prev) => ({
                              ...prev,
                              [backup.execution_id]: next,
                            }));
                          }}
                        >
                          <option value="">Selecionar automaticamente</option>
                          {availableLocations.map((location) => (
                            <option key={location.storage_location_id} value={location.storage_location_id}>
                              {location.storage_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </label>
                  );
                })
              )}
            </div>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={restoreDropExisting}
                onChange={(event) => setRestoreDropExisting(event.target.checked)}
              />
              Limpar tabelas/objetos existentes antes do restore.
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={restoreVerificationMode}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setRestoreVerificationMode(checked);
                  if (!checked) setRestoreKeepVerificationDatabase(false);
                }}
              />
              Executar em modo de verificacao (nao sobrescreve banco real).
            </label>
            {restoreVerificationMode && (
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={restoreKeepVerificationDatabase}
                  onChange={(event) => setRestoreKeepVerificationDatabase(event.target.checked)}
                />
                Manter banco temporario de verificacao apos concluir.
              </label>
            )}
            <p className={styles.warningText}>
              Acao irreversivel. Confirme digitando <strong>{restoreRequiredPhrase}</strong>.
            </p>
            <label className={styles.field}>
              CONFIRMACAO
              <input
                className={styles.confirmInput}
                placeholder={restoreRequiredPhrase}
                value={restoreConfirmationPhrase}
                onChange={(event) => setRestoreConfirmationPhrase(event.target.value)}
              />
            </label>
            {selectedBackup && (
              <p className={styles.modalHint}>
                Backup selecionado: {selectedBackup.datasource.name} - {formatDate(selectedBackup.finished_at ?? selectedBackup.created_at)}
              </p>
            )}
          </div>
        </Modal>
      )}

      {importTargetDatasource && (
        <Modal
          title={`Importar arquivo para restore: ${importTargetDatasource.name}`}
          subtitle="Envie um arquivo de backup e inicie o restore diretamente neste datasource."
          onClose={closeImportModal}
          size="md"
          footer={(
            <>
              <button className={styles.secondaryBtn} onClick={closeImportModal} disabled={importSubmitting}>
                Cancelar
              </button>
              <button
                className={styles.primaryBtn}
                onClick={() => void handleImportRestore()}
                disabled={importSubmitting || !importFile}
              >
                {importSubmitting ? (
                  <>
                    <SpinnerIcon width={14} height={14} />
                    Enviando...
                  </>
                ) : (
                  <>
                    <ExportIcon width={14} height={14} />
                    Importar e restaurar
                  </>
                )}
              </button>
            </>
          )}
        >
          <div className={styles.modalContent}>
            {error && <p className={styles.errorInline}>{error}</p>}
            <label className={styles.field}>
              ARQUIVO DE BACKUP
              <input
                className={styles.fileInput}
                type="file"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {importFile && (
              <p className={styles.modalHint}>
                Arquivo selecionado: <strong>{importFile.name}</strong> ({formatBytes(importFile.size)})
              </p>
            )}
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={importDropExisting}
                onChange={(event) => setImportDropExisting(event.target.checked)}
              />
              Limpar tabelas/objetos existentes antes do restore.
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={importVerificationMode}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setImportVerificationMode(checked);
                  if (!checked) setImportKeepVerificationDatabase(false);
                }}
              />
              Executar em modo de verificacao (nao sobrescreve banco real).
            </label>
            {importVerificationMode && (
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={importKeepVerificationDatabase}
                  onChange={(event) => setImportKeepVerificationDatabase(event.target.checked)}
                />
                Manter banco temporario de verificacao apos concluir.
              </label>
            )}
            <p className={styles.warningText}>
              Acao irreversivel. Confirme digitando <strong>{importRequiredPhrase}</strong>.
            </p>
            <label className={styles.field}>
              CONFIRMACAO
              <input
                className={styles.confirmInput}
                placeholder={importRequiredPhrase}
                value={importConfirmationPhrase}
                onChange={(event) => setImportConfirmationPhrase(event.target.value)}
              />
            </label>
          </div>
        </Modal>
      )}
      {criticalAction.modal}
    </div>
  );
}


