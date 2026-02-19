import { useState, useEffect, useCallback } from 'react';
import { datasourceApi } from '../../services/api';
import type { ApiDatasource, ApiDatasourceDetail, ApiSchema, ApiSchemaTable } from '../../services/api';
import DatasourceList     from './DatasourceList';
import AddDatasourceModal from './AddDatasourceModal';
import ObjectExplorer     from './ObjectExplorer';
import {
  FolderIcon, DatabaseIcon, EditIcon, TrashIcon,
  PlugIcon, SpinnerIcon,
} from '../../components/Icons';
import { DS_ABBR } from '../../constants';
import styles from './DatasourcesPage.module.css';

// ── Status helpers ─────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  healthy:  'Saudável',
  warning:  'Atenção',
  critical: 'Crítico',
  unknown:  'Desconhecido',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Detail panel ──────────────────────────────────────────────────

interface DetailProps {
  datasource: ApiDatasource;
  detail: ApiDatasourceDetail | null;
  loadingDetail: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  testing: boolean;
  testResult: { status: string; latency_ms: number | null } | null;
}

function DatasourceDetail({
  datasource, detail, loadingDetail,
  onEdit, onDelete, onTest, testing, testResult,
}: DetailProps) {
  return (
    <div className={styles.detailPanel}>
      {/* Header */}
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
            {!datasource.enabled && (
              <span className={styles.disabledBadge}>Desabilitado</span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.detailActions}>
        <button className={styles.actionBtnTest} onClick={onTest} disabled={testing}>
          {testing ? <SpinnerIcon width={14} height={14} /> : <PlugIcon width={14} height={14} />}
          {testing ? 'Testando...' : 'Testar Conexão'}
        </button>
        <button className={styles.actionBtnEdit} onClick={onEdit}>
          <EditIcon width={14} height={14} /> Editar
        </button>
        <button className={styles.actionBtnDelete} onClick={onDelete}>
          <TrashIcon width={14} height={14} /> Remover
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`${styles.testResult} ${testResult.status === 'ok' ? styles.testOk : styles.testError}`}>
          {testResult.status === 'ok'
            ? `✓ Conexão OK${testResult.latency_ms !== null ? ` — ${testResult.latency_ms}ms` : ''}`
            : '✗ Falha na conexão'}
        </div>
      )}

      {/* Connection Config */}
      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Configuração de Conexão</p>
        {loadingDetail ? (
          <div className={styles.detailLoading}><SpinnerIcon width={14} height={14} /> Carregando...</div>
        ) : detail ? (
          <div className={styles.configGrid}>
            {Object.entries(detail.connection_config).map(([key, value]) => (
              <div key={key} className={styles.configRow}>
                <span className={styles.configKey}>{key}</span>
                <span className={styles.configValue}>{String(value ?? '—')}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.detailEmpty}>Configuração não disponível</p>
        )}
      </div>

      {/* Tags */}
      {datasource.tags.length > 0 && (
        <div className={styles.detailSection}>
          <p className={styles.detailSectionTitle}>Tags</p>
          <div className={styles.detailTags}>
            {datasource.tags.map(tag => (
              <span key={tag} className={styles.detailTag}>{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Dates */}
      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Histórico</p>
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
            <span className={styles.configKey}>Último health check</span>
            <span className={styles.configValue}>
              {datasource.last_health_check_at ? formatDate(datasource.last_health_check_at) : 'Nunca'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function DatasourcesPage() {
  const [datasources, setDatasources]     = useState<ApiDatasource[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [selectedDs, setSelectedDs]       = useState<ApiDatasource | null>(null);
  const [detail, setDetail]               = useState<ApiDatasourceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showModal, setShowModal]         = useState(false);
  const [editData, setEditData]           = useState<ApiDatasourceDetail | null>(null);
  const [testing, setTesting]             = useState(false);
  const [testResult, setTestResult]       = useState<{ status: string; latency_ms: number | null } | null>(null);

  // Schema explorer state
  const [schemas, setSchemas]             = useState<ApiSchema[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [schemaError, setSchemaError]     = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<ApiSchemaTable | null>(null);

  // ── Load list ───────────────────────────────────────────────────

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

  useEffect(() => { loadDatasources(); }, [loadDatasources]);

  // ── Load schema ─────────────────────────────────────────────────

  const loadSchema = useCallback(async (ds: ApiDatasource) => {
    setSchemas([]);
    setSchemaError(null);
    setSelectedTable(null);
    try {
      setLoadingSchema(true);
      const data = await datasourceApi.schema(ds.id);
      setSchemas(data);
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : 'Erro ao carregar schema');
    } finally {
      setLoadingSchema(false);
    }
  }, []);

  // ── Select → fetch detail + schema ──────────────────────────────

  const handleSelect = useCallback(async (ds: ApiDatasource) => {
    setSelectedDs(ds);
    setDetail(null);
    setTestResult(null);

    // Fetch detail and schema in parallel
    setLoadingDetail(true);
    datasourceApi.getById(ds.id)
      .then((d) => setDetail(d))
      .catch(() => { /* silent */ })
      .finally(() => setLoadingDetail(false));

    loadSchema(ds);
  }, [loadSchema]);

  // ── Add new ─────────────────────────────────────────────────────

  const handleAddNew = () => { setEditData(null); setShowModal(true); };

  // ── Edit ────────────────────────────────────────────────────────

  const handleEdit = useCallback(async (ds: ApiDatasource) => {
    try {
      const d = (detail?.id === ds.id) ? detail! : await datasourceApi.getById(ds.id);
      setEditData(d);
      setShowModal(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar datasource');
    }
  }, [detail]);

  // ── Delete ──────────────────────────────────────────────────────

  const handleDelete = useCallback(async (ds: ApiDatasource) => {
    if (!confirm(`Remover datasource "${ds.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await datasourceApi.remove(ds.id);
      setDatasources(prev => prev.filter(d => d.id !== ds.id));
      if (selectedDs?.id === ds.id) {
        setSelectedDs(null); setDetail(null);
        setSchemas([]); setSchemaError(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao remover datasource');
    }
  }, [selectedDs]);

  // ── Save (create / update) ──────────────────────────────────────

  const handleSave = async (data: unknown, editId?: string) => {
    if (editId) {
      const updated = await datasourceApi.update(editId, data as Parameters<typeof datasourceApi.update>[1]);
      setDatasources(prev => prev.map(d => d.id === editId ? updated : d));
      if (selectedDs?.id === editId) setSelectedDs(updated);
    } else {
      const created = await datasourceApi.create(data as Parameters<typeof datasourceApi.create>[0]);
      setDatasources(prev => [...prev, created]);
    }
    setShowModal(false);
    setEditData(null);
  };

  // ── Test connection ─────────────────────────────────────────────

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

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className={styles.layout}>
      {/* ── Painel esquerdo: lista ── */}
      <div className={styles.leftPanel}>
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

      {/* ── Painel central: detalhe ── */}
      <div className={styles.middlePanel}>
        {selectedDs ? (
          <DatasourceDetail
            datasource={selectedDs}
            detail={detail}
            loadingDetail={loadingDetail}
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

      {/* ── Painel direito: schema explorer ── */}
      <div className={styles.rightPanel}>
        {selectedDs ? (
          <ObjectExplorer
            datasource={selectedDs}
            schemas={schemas}
            loading={loadingSchema}
            error={schemaError}
            selectedTable={selectedTable}
            onSelectTable={setSelectedTable}
            onRefresh={() => loadSchema(selectedDs)}
          />
        ) : (
          <div className={styles.rightPlaceholder}>
            <DatabaseIcon width={56} height={56} />
            <h3>Gerenciador de Datasources</h3>
            <p>
              Selecione um datasource para visualizar detalhes de conexão e explorar a estrutura do banco de dados.
            </p>
          </div>
        )}
      </div>

      {/* Modal de criação / edição */}
      {showModal && (
        <AddDatasourceModal
          editData={editData}
          onClose={() => { setShowModal(false); setEditData(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
