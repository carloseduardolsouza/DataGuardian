import { useState } from 'react';
import { MOCK_STORAGE_LOCATIONS, formatBytes } from './mockData';
import type { MockStorageLocation } from './mockData';
import StorageList      from './StorageList';
import FileBrowser      from './FileBrowser';
import AddStorageModal  from './AddStorageModal';
import styles           from './StoragePage.module.css';

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
          icon={<StorageIcon />}
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
            icon={<AlertIcon />}
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
        <StorageIcon />
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

/* ── Ícones ──────────────────────────────────────────────────────── */
function StorageIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v4c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 9v4c0 1.66 4.03 3 9 3s9-1.34 9-3V9"/><path d="M3 13v4c0 1.66 4.03 3 9 3s9-1.34 9-3v-4"/></svg>; }
function DiskIcon()      { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/><circle cx="12" cy="10" r="2"/></svg>; }
function CapacityIcon()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>; }
function CheckCircleIcon(){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>; }
function AlertIcon()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function FolderIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>; }
function TrashIcon()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>; }
function PlugIcon()      { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M7 7l10 10"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/></svg>; }
function PlusIcon()      { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
