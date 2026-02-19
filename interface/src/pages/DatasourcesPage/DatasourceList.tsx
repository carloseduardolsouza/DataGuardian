import { useState } from 'react';
import type { MockDatasource } from './mockData';
import { PlusIcon, SearchIcon, ClockIcon, TableIcon } from '../../components/Icons';
import { DS_ABBR } from '../../constants';
import styles from './DatasourceList.module.css';

interface Props {
  datasources: MockDatasource[];
  selectedId:  string | null;
  onSelect:    (ds: MockDatasource) => void;
  onAddNew?:   () => void;
}

export default function DatasourceList({ datasources, selectedId, onSelect, onAddNew }: Props) {
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
          <button className={styles.addBtn} title="Adicionar datasource" onClick={onAddNew}>
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
                  {DS_ABBR[ds.type]}
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
                    <ClockIcon width={10} height={10} />
                    {ds.lastCheckAt}
                  </span>
                  {ds.schemas.length > 0 && (
                    <span className={styles.cardStat}>
                      <TableIcon width={10} height={10} />
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
