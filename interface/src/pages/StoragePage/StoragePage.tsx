import { useState, useEffect, useCallback } from 'react';
import { storageApi } from '../../services/api';
import type { ApiStorageLocation, ApiStorageLocationDetail } from '../../services/api';
import StorageList     from './StorageList';
import AddStorageModal from './AddStorageModal';
import styles          from './StoragePage.module.css';
import {
  DatabaseIcon, CheckCircleIcon, AlertTriangleIcon,
  FolderIcon, DiskIcon, TrashIcon, PlugIcon, PlusIcon,
  EditIcon, SpinnerIcon,
} from '../../components/Icons';
import { SL_ABBR } from '../../constants';

// ── Status helpers ─────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  healthy:     'Saudável',
  full:        'Cheio',
  unreachable: 'Inacessível',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Detail panel ──────────────────────────────────────────────────

interface DetailProps {
  location:      ApiStorageLocation;
  detail:        ApiStorageLocationDetail | null;
  loadingDetail: boolean;
  onEdit:        () => void;
  onDelete:      () => void;
  onTest:        () => void;
  testing:       boolean;
  testResult:    { status: string; available_space_gb?: number; latency_ms: number | null } | null;
}

function StorageDetail({
  location, detail, loadingDetail,
  onEdit, onDelete, onTest, testing, testResult,
}: DetailProps) {
  return (
    <div className={styles.detailPanel}>
      {/* Header */}
      <div className={styles.detailHeader}>
        <div className={`${styles.detailTypeIcon} ${styles[location.type]}`}>
          {SL_ABBR[location.type] ?? location.type.toUpperCase().substring(0, 3)}
        </div>
        <div className={styles.detailHeaderInfo}>
          <h2 className={styles.detailTitle}>{location.name}</h2>
          <div className={styles.detailMeta}>
            <span className={`${styles.statusBadge} ${styles[`status_${location.status}`]}`}>
              {STATUS_LABELS[location.status]}
            </span>
            {location.is_default && (
              <span className={styles.defaultBadge}>Padrão</span>
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
            ? `✓ Conexão OK${testResult.latency_ms !== null ? ` — ${testResult.latency_ms}ms` : ''}${testResult.available_space_gb ? ` — ${testResult.available_space_gb} GB livres` : ''}`
            : '✗ Falha na conexão'}
        </div>
      )}

      {/* Config */}
      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Configuração</p>
        {loadingDetail ? (
          <div className={styles.detailLoading}><SpinnerIcon width={14} height={14} /> Carregando...</div>
        ) : detail ? (
          <div className={styles.configGrid}>
            {Object.entries(detail.config).map(([key, value]) => (
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

      {/* Available space */}
      {location.available_space_gb !== null && (
        <div className={styles.detailSection}>
          <p className={styles.detailSectionTitle}>Espaço disponível</p>
          <p className={styles.configValue}>{location.available_space_gb} GB</p>
        </div>
      )}

      {/* Dates */}
      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Histórico</p>
        <div className={styles.configGrid}>
          <div className={styles.configRow}>
            <span className={styles.configKey}>Criado em</span>
            <span className={styles.configValue}>{formatDate(location.created_at)}</span>
          </div>
          <div className={styles.configRow}>
            <span className={styles.configKey}>Atualizado em</span>
            <span className={styles.configValue}>{formatDate(location.updated_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function StoragePage() {
  const [locations, setLocations]         = useState<ApiStorageLocation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [selectedLoc, setSelectedLoc]     = useState<ApiStorageLocation | null>(null);
  const [detail, setDetail]               = useState<ApiStorageLocationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showModal, setShowModal]         = useState(false);
  const [editData, setEditData]           = useState<ApiStorageLocationDetail | null>(null);
  const [testing, setTesting]             = useState(false);
  const [testResult, setTestResult]       = useState<{
    status: string; available_space_gb?: number; latency_ms: number | null;
  } | null>(null);

  // ── Load list ───────────────────────────────────────────────────

  const loadLocations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await storageApi.list();
      setLocations(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar storages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  // ── Select → fetch detail ────────────────────────────────────────

  const handleSelect = useCallback(async (loc: ApiStorageLocation) => {
    setSelectedLoc(loc);
    setDetail(null);
    setTestResult(null);
    try {
      setLoadingDetail(true);
      const d = await storageApi.getById(loc.id);
      setDetail(d);
    } catch {
      // silent — config section will show empty state
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // ── Add new ─────────────────────────────────────────────────────

  const handleAddNew = () => { setEditData(null); setShowModal(true); };

  // ── Edit ────────────────────────────────────────────────────────

  const handleEdit = useCallback(async (loc: ApiStorageLocation) => {
    try {
      const d = (detail?.id === loc.id) ? detail! : await storageApi.getById(loc.id);
      setEditData(d);
      setShowModal(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar storage');
    }
  }, [detail]);

  // ── Delete ──────────────────────────────────────────────────────

  const handleDelete = useCallback(async (loc: ApiStorageLocation) => {
    if (!confirm(`Remover storage "${loc.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await storageApi.remove(loc.id);
      setLocations(prev => prev.filter(l => l.id !== loc.id));
      if (selectedLoc?.id === loc.id) { setSelectedLoc(null); setDetail(null); }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao remover storage');
    }
  }, [selectedLoc]);

  // ── Save (create / update) ──────────────────────────────────────

  const handleSave = async (data: unknown, editId?: string) => {
    if (editId) {
      const updated = await storageApi.update(editId, data as Parameters<typeof storageApi.update>[1]);
      setLocations(prev => prev.map(l => l.id === editId ? updated : l));
      if (selectedLoc?.id === editId) setSelectedLoc(updated);
    } else {
      const created = await storageApi.create(data as Parameters<typeof storageApi.create>[0]);
      setLocations(prev => [...prev, created]);
    }
    setShowModal(false);
    setEditData(null);
  };

  // ── Test connection ─────────────────────────────────────────────

  const handleTest = useCallback(async () => {
    if (!selectedLoc) return;
    try {
      setTesting(true);
      setTestResult(null);
      const r = await storageApi.test(selectedLoc.id);
      setTestResult({ status: r.status, available_space_gb: r.available_space_gb, latency_ms: r.latency_ms });
    } catch {
      setTestResult({ status: 'error', latency_ms: null });
    } finally {
      setTesting(false);
    }
  }, [selectedLoc]);

  // ── Summary ─────────────────────────────────────────────────────

  const healthyCount = locations.filter(l => l.status === 'healthy').length;
  const issueCount   = locations.filter(l => l.status !== 'healthy').length;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Faixa de sumário ──────────────────────────────────────── */}
      <div className={styles.summaryBar}>
        <SummaryItem
          label="Locais cadastrados"
          value={loading ? '—' : String(locations.length)}
          icon={<DatabaseIcon />}
          variant="neutral"
        />
        <SummaryItem
          label="Online / saudáveis"
          value={loading ? '—' : String(healthyCount)}
          icon={<CheckCircleIcon />}
          variant="success"
        />
        {issueCount > 0 && (
          <SummaryItem
            label="Com problemas"
            value={String(issueCount)}
            icon={<AlertTriangleIcon />}
            variant="warning"
          />
        )}
      </div>

      {/* ── Layout 2 painéis ─────────────────────────────────────── */}
      <div className={styles.layout}>
        {/* Painel esquerdo */}
        <div className={styles.leftPanel}>
          <StorageList
            locations={locations}
            selectedId={selectedLoc?.id ?? null}
            onSelect={handleSelect}
            onAddNew={handleAddNew}
            onEdit={handleEdit}
            onDelete={handleDelete}
            loading={loading}
            error={error}
          />
        </div>

        {/* Painel direito */}
        <div className={styles.rightPanel}>
          {selectedLoc ? (
            <StorageDetail
              location={selectedLoc}
              detail={detail}
              loadingDetail={loadingDetail}
              onEdit={() => handleEdit(selectedLoc)}
              onDelete={() => handleDelete(selectedLoc)}
              onTest={handleTest}
              testing={testing}
              testResult={testResult}
            />
          ) : (
            <Placeholder onAddNew={handleAddNew} />
          )}
        </div>
      </div>

      {/* Modal de criação / edição */}
      {showModal && (
        <AddStorageModal
          editData={editData}
          onClose={() => { setShowModal(false); setEditData(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ── Summary item ──────────────────────────────────────────────────

function SummaryItem({
  label, value, icon, variant,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className={`${styles.summaryItem} ${styles[variant]}`}>
      <span className={styles.summaryIcon}>{icon}</span>
      <div>
        <p className={styles.summaryValue}>{value}</p>
        <p className={styles.summaryLabel}>{label}</p>
      </div>
    </div>
  );
}

// ── Placeholder ───────────────────────────────────────────────────

function Placeholder({ onAddNew }: { onAddNew: () => void }) {
  return (
    <div className={styles.placeholder}>
      <div className={styles.placeholderIcon}>
        <DatabaseIcon />
      </div>
      <h3 className={styles.placeholderTitle}>Gerenciador de Storage</h3>
      <p className={styles.placeholderSub}>
        Selecione um local de armazenamento para visualizar os detalhes ou adicione um novo.
      </p>

      <div className={styles.featureGrid}>
        <div className={styles.featureItem}>
          <FolderIcon /> Navegar arquivos
        </div>
        <div className={styles.featureItem}>
          <DiskIcon /> Monitorar disco
        </div>
        <div className={styles.featureItem}>
          <TrashIcon /> Excluir backups
        </div>
        <div className={styles.featureItem}>
          <PlugIcon /> Testar conexão
        </div>
      </div>

      <button className={styles.addBtn} onClick={onAddNew}>
        <PlusIcon /> Adicionar Storage
      </button>
    </div>
  );
}
