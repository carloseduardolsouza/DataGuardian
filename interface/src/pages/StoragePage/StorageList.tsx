import { useState } from 'react';
import type { MockStorageLocation } from './mockData';
import { formatBytes, getLocationPath } from './mockData';
import styles from './StorageList.module.css';

interface Props {
  locations:  MockStorageLocation[];
  selectedId: string | null;
  onSelect:   (loc: MockStorageLocation) => void;
  onAddNew:   () => void;
}

const TYPE_LABEL: Record<string, string> = {
  local:     'LOCAL',
  ssh:       'SSH',
  s3:        'S3',
  minio:     'MINIO',
  backblaze: 'B2',
};

function formatLastCheck(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)  return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

export default function StorageList({ locations, selectedId, onSelect, onAddNew }: Props) {
  const [search, setSearch] = useState('');

  const filtered = locations.filter(loc =>
    loc.name.toLowerCase().includes(search.toLowerCase()) ||
    getLocationPath(loc).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className={styles.panel}>
      {/* Cabeçalho */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.title}>Storage</span>
          <button className={styles.addBtn} onClick={onAddNew} title="Adicionar storage">
            <PlusIcon />
          </button>
        </div>
        <div className={styles.searchWrap}>
          <SearchIcon />
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Lista */}
      <div className={styles.list}>
        {filtered.length === 0 && (
          <p className={styles.empty}>Nenhum resultado</p>
        )}

        {filtered.map(loc => {
          const pct       = loc.totalBytes > 0 ? (loc.usedBytes / loc.totalBytes) * 100 : 0;
          const fillClass = pct > 90 ? 'danger' : pct > 70 ? 'warning' : 'ok';
          const isCloud   = loc.totalBytes === 0;

          return (
            <div
              key={loc.id}
              className={`${styles.card}${selectedId === loc.id ? ` ${styles.selected}` : ''}`}
              onClick={() => onSelect(loc)}
            >
              {/* Topo: ícone de tipo + nome + status */}
              <div className={styles.cardTop}>
                <span className={`${styles.typeIcon} ${styles[loc.type]}`}>
                  {TYPE_LABEL[loc.type]}
                </span>
                <div className={styles.cardMeta}>
                  <div className={styles.cardNameRow}>
                    <span className={styles.cardName}>{loc.name}</span>
                    {loc.isDefault && <span className={styles.defaultBadge}>Padrão</span>}
                  </div>
                  <span className={styles.cardPath}>{getLocationPath(loc)}</span>
                </div>
                <span className={`${styles.statusDot} ${styles[loc.status]}`} />
              </div>

              {/* Barra de disco */}
              <div className={styles.diskWrap}>
                <div className={styles.diskBar}>
                  {!isCloud && (
                    <div
                      className={`${styles.diskFill} ${styles[fillClass]}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  )}
                </div>
                <div className={styles.diskText}>
                  <span>{formatBytes(loc.usedBytes)} usados</span>
                  <span className={styles.diskTotal}>
                    {isCloud ? '∞ ilimitado' : formatBytes(loc.totalBytes)}
                  </span>
                </div>
                {!isCloud && (
                  <div className={`${styles.pctBadge} ${styles[fillClass]}`}>
                    {pct.toFixed(0)}%
                  </div>
                )}
              </div>

              {/* Rodapé: latência + last check */}
              <div className={styles.cardFooter}>
                <span className={styles.footerMeta}>
                  {loc.latencyMs !== null
                    ? <><PingIcon /> {loc.latencyMs}ms</>
                    : <span className={styles.offlineText}>offline</span>
                  }
                </span>
                <span className={styles.footerMeta}>{formatLastCheck(loc.lastCheck)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Ícones ──────────────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PingIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M2 12h4l3 9 4-18 3 9h4" />
    </svg>
  );
}
