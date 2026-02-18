import { useState } from 'react';
import type { MockDatasource } from './mockData';
import styles from './DatasourceList.module.css';

interface Props {
  datasources: MockDatasource[];
  selectedId:  string | null;
  onSelect:    (ds: MockDatasource) => void;
}

const TYPE_ABBR: Record<string, string> = {
  postgres:  'PG',
  mysql:     'MY',
  mongodb:   'MG',
  sqlserver: 'MS',
  sqlite:    'SL',
};

export default function DatasourceList({ datasources, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState('');

  const filtered = datasources.filter((ds) =>
    ds.name.toLowerCase().includes(search.toLowerCase()) ||
    ds.host.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.title}>Datasources</span>
          <button className={styles.addBtn} title="Adicionar datasource">
            <PlusIcon />
          </button>
        </div>
        <div className={styles.searchWrap}>
          <SearchIcon className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.list}>
        {filtered.map((ds) => {
          const latencyClass = ds.latencyMs === null ? 'offline'
            : ds.latencyMs < 30  ? 'fast'
            : ds.latencyMs < 100 ? 'medium'
            : 'slow';

          return (
            <div
              key={ds.id}
              className={`${styles.card}${selectedId === ds.id ? ` ${styles.selected}` : ''}`}
              onClick={() => onSelect(ds)}
            >
              <div className={styles.cardTop}>
                <div className={`${styles.typeIcon} ${styles[ds.type]}`}>
                  {TYPE_ABBR[ds.type]}
                </div>
                <div className={styles.cardMeta}>
                  <p className={styles.cardName}>{ds.name}</p>
                  <p className={styles.cardHost}>
                    {ds.host}{ds.port ? `:${ds.port}` : ''} / {ds.database}
                  </p>
                </div>
                <span className={`${styles.statusDot} ${styles[ds.status]}`} title={ds.status} />
              </div>

              <div className={styles.cardFooter}>
                <div className={styles.cardStats}>
                  <span className={styles.cardStat}>
                    <ClockIcon />
                    {ds.lastCheckAt}
                  </span>
                  {ds.schemas.length > 0 && (
                    <span className={styles.cardStat}>
                      <TableIcon />
                      {ds.schemas.reduce((acc, s) => acc + s.tables.length, 0)} tabelas
                    </span>
                  )}
                </div>
                <span className={`${styles.latencyBadge} ${styles[latencyClass]}`}>
                  {ds.latencyMs !== null ? `${ds.latencyMs}ms` : 'offline'}
                </span>
              </div>

              {ds.tags.length > 0 && (
                <div className={styles.tags}>
                  {ds.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Ícones ─────────────────────────────────────────────────── */
function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function ClockIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function TableIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>;
}
