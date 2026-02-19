import { useState } from 'react';
import { MOCK_STORAGE_LOCATIONS, formatBytes } from './mockData';
import type { MockStorageLocation } from './mockData';
import StorageList      from './StorageList';
import FileBrowser      from './FileBrowser';
import AddStorageModal  from './AddStorageModal';
import styles           from './StoragePage.module.css';
import {
  DatabaseIcon,
  DiskIcon,
  CapacityIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  FolderIcon,
  TrashIcon,
  PlugIcon,
  PlusIcon,
} from '../../components/Icons';

export default function StoragePage() {
  const [locations, setLocations]     = useState(MOCK_STORAGE_LOCATIONS);
  const [selectedLoc, setSelectedLoc] = useState<MockStorageLocation | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const handleSave = (data: unknown) => {
    // Em produção aqui chamaria a API; por ora apenas fecha
    console.log('Novo storage:', data);
  };

  // Totais globais para o banner de sumário
  const totalUsed  = locations.reduce((acc, l) => acc + l.usedBytes, 0);
  const totalSpace = locations.filter(l => l.totalBytes > 0).reduce((acc, l) => acc + l.totalBytes, 0);
  const healthyCount = locations.filter(l => l.status === 'healthy').length;
  const issueCount   = locations.filter(l => l.status === 'warning' || l.status === 'critical').length;

  return (
    <div className={styles.page}>
      {/* ── Faixa de sumário global ──────────────────────────────── */}
      <div className={styles.summaryBar}>
        <SummaryItem
          label="Locais cadastrados"
          value={String(locations.length)}
          icon={<DatabaseIcon />}
          variant="neutral"
        />
        <SummaryItem
          label="Total utilizado"
          value={formatBytes(totalUsed)}
          icon={<DiskIcon />}
          variant="neutral"
        />
        <SummaryItem
          label="Capacidade total"
          value={totalSpace > 0 ? formatBytes(totalSpace) : '∞'}
          icon={<CapacityIcon />}
          variant="neutral"
        />
        <SummaryItem
          label="Online / saudáveis"
          value={String(healthyCount)}
          icon={<CheckCircleIcon />}
          variant="success"
        />
        {issueCount > 0 && (
          <SummaryItem
            label="Com alertas"
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
            onSelect={setSelectedLoc}
            onAddNew={() => setShowAddModal(true)}
          />
        </div>

        {/* Painel direito */}
        <div className={styles.rightPanel}>
          {selectedLoc ? (
            <FileBrowser key={selectedLoc.id} location={selectedLoc} />
          ) : (
            <Placeholder onAddNew={() => setShowAddModal(true)} />
          )}
        </div>
      </div>

      {/* Modal de adição */}
      {showAddModal && (
        <AddStorageModal
          onClose={() => setShowAddModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

/* ── Summary item ────────────────────────────────────────────────── */
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

/* ── Placeholder (nenhum storage selecionado) ─────────────────────── */
function Placeholder({ onAddNew }: { onAddNew: () => void }) {
  return (
    <div className={styles.placeholder}>
      <div className={styles.placeholderIcon}>
        <DatabaseIcon />
      </div>
      <h3 className={styles.placeholderTitle}>Gerenciador de Storage</h3>
      <p className={styles.placeholderSub}>
        Selecione um local de armazenamento para explorar os arquivos de backup ou adicione um novo.
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
