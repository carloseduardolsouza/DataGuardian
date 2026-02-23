import { useState } from 'react';
import type { ApiDatasource } from '../../services/api';
import { PlusIcon, SearchIcon, EditIcon, TrashIcon, SpinnerIcon } from '../../ui/icons/Icons';
import { DS_ABBR } from '../../constants';
import styles from './DatasourceList.module.css';

interface Props {
  datasources: ApiDatasource[];
  selectedId:  string | null;
  onSelect:    (ds: ApiDatasource) => void;
  onContextMenu?: (ds: ApiDatasource, x: number, y: number) => void;
  onAddNew?:   () => void;
  onEdit?:     (ds: ApiDatasource) => void;
  onDelete?:   (ds: ApiDatasource) => void;
  loading?:    boolean;
  error?:      string | null;
}

const STATUS_LABELS: Record<string, string> = {
  healthy:  'Saudável',
  warning:  'Atenção',
  critical: 'Crítico',
  unknown:  'Desconhecido',
};

export default function DatasourceList({
  datasources, selectedId, onSelect, onContextMenu, onAddNew, onEdit, onDelete, loading, error,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = datasources.filter((ds) =>
    ds.name.toLowerCase().includes(search.toLowerCase()) ||
    ds.tags.some(t => t.toLowerCase().includes(search.toLowerCase())),
  );

  const statusCounts = filtered.reduce<Record<'healthy' | 'warning' | 'critical' | 'unknown', number>>(
    (acc, ds) => {
      acc[ds.status] += 1;
      return acc;
    },
    { healthy: 0, warning: 0, critical: 0, unknown: 0 },
  );

  return (
    <div className={styles.panel}>
      {/* Cabeçalho */}
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
        <div className={styles.statusSummary}>
          <span className={`${styles.summaryBadge} ${styles.status_healthy}`}>
            Saudavel: {statusCounts.healthy}
          </span>
          <span className={`${styles.summaryBadge} ${styles.status_warning}`}>
            Atencao: {statusCounts.warning}
          </span>
          <span className={`${styles.summaryBadge} ${styles.status_critical}`}>
            Critico: {statusCounts.critical}
          </span>
          <span className={`${styles.summaryBadge} ${styles.status_unknown}`}>
            Desconhecido: {statusCounts.unknown}
          </span>
        </div>
      </div>

      {/* Lista */}
      <div className={styles.list}>
        {loading && (
          <div className={styles.loadingState}>
            <SpinnerIcon width={16} height={16} /> Carregando...
          </div>
        )}

        {error && !loading && (
          <p className={styles.errorState}>{error}</p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className={styles.emptyState}>
            {datasources.length === 0 ? 'Nenhum datasource cadastrado' : 'Nenhum resultado'}
          </p>
        )}

        {!loading && filtered.map((ds) => (
          <div
            key={ds.id}
            className={`${styles.card}${selectedId === ds.id ? ` ${styles.selected}` : ''}`}
            onClick={() => onSelect(ds)}
            onContextMenu={(event) => {
              if (!onContextMenu) return;
              event.preventDefault();
              event.stopPropagation();
              onContextMenu(ds, event.clientX, event.clientY);
            }}
          >
            {/* Topo */}
            <div className={styles.cardTop}>
              <div className={`${styles.typeIcon} ${styles[ds.type]}`}>
                {DS_ABBR[ds.type]}
              </div>
              <div className={styles.cardMeta}>
                <p className={styles.cardName}>{ds.name}</p>
                <p className={styles.cardHost}>{ds.type.toUpperCase()}</p>
              </div>
              <span className={`${styles.statusDot} ${styles[ds.status]}`} title={STATUS_LABELS[ds.status]} />
            </div>

            {/* Tags */}
            {ds.tags.length > 0 && (
              <div className={styles.tags}>
                {ds.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
              </div>
            )}

            {/* Rodapé */}
            <div className={styles.cardFooter}>
              <span className={`${styles.statusLabel} ${styles[`status_${ds.status}`]}`}>
                {STATUS_LABELS[ds.status]}
              </span>
              <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                {onEdit && (
                  <button className={styles.actionBtn} title="Editar" onClick={() => onEdit(ds)}>
                    <EditIcon width={12} height={12} />
                  </button>
                )}
                {onDelete && (
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    title="Remover"
                    onClick={() => onDelete(ds)}
                  >
                    <TrashIcon width={12} height={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


