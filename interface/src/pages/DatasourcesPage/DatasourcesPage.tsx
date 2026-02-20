import { useState, useEffect, useCallback } from 'react';
import { datasourceApi } from '../../services/api';
import type { ApiDatasource, ApiDatasourceDetail, ApiSchema, ApiSchemaTable } from '../../services/api';
import { useResizableWidth } from '../../hooks/useResizableWidth';
import DatasourceList from './DatasourceList';
import AddDatasourceModal from './AddDatasourceModal';
import CreateTableModal from './CreateTableModal';
import ObjectExplorer from './ObjectExplorer';
import MainPanel from './MainPanel';
import {
  FolderIcon,
  DatabaseIcon,
  EditIcon,
  TrashIcon,
  PlugIcon,
  SpinnerIcon,
} from '../../components/Icons';
import { DS_ABBR } from '../../constants';
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

export default function DatasourcesPage() {
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

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; latency_ms: number | null } | null>(null);

  const [schemas, setSchemas] = useState<ApiSchema[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<ApiSchemaTable | null>(null);
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
      if (!confirm(`Remover datasource "${ds.name}"? Esta acao nao pode ser desfeita.`)) return;

      try {
        await datasourceApi.remove(ds.id);

        setDatasources((prev) => {
          const next = prev.filter((d) => d.id !== ds.id);

          if (selectedDs?.id === ds.id) {
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
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao remover datasource');
      }
    },
    [selectedDs, handleSelect],
  );

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

  return (
    <div className={styles.layout}>
      <div className={styles.leftPanel} style={isDesktop ? { width: listPane.width } : undefined}>
        <DatasourceList
          datasources={datasources}
          selectedId={selectedDs?.id ?? null}
          onSelect={handleSelect}
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
    </div>
  );
}
