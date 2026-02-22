import { useState } from 'react';
import type { ApiStorageLocation } from '../../services/api';
import { EditIcon, PlusIcon, SearchIcon, SpinnerIcon, TrashIcon } from '../../ui/icons/Icons';
import { SL_ABBR } from '../../constants';
import styles from './StorageList.module.css';

interface Props {
  locations:  ApiStorageLocation[];
  selectedId: string | null;
  onSelect:   (loc: ApiStorageLocation) => void;
  onAddNew:   () => void;
  onEdit?:    (loc: ApiStorageLocation) => void;
  onDelete?:  (loc: ApiStorageLocation) => void;
  loading?:   boolean;
  error?:     string | null;
}

const STATUS_LABELS: Record<string, string> = {
  healthy:     'Saudável',
  full:        'Cheio',
  unreachable: 'Inacessível',
};

export default function StorageList({
  locations, selectedId, onSelect, onAddNew, onEdit, onDelete, loading, error,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = locations.filter(loc =>
    loc.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className={styles.panel}>
      {/* Cabeçalho */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.title}>Storage</span>
          <button className={styles.addBtn} onClick={onAddNew} title="Adicionar storage">
            <PlusIcon width={14} height={14} />
          </button>
        </div>
        <div className={styles.searchWrap}>
          <SearchIcon className={styles.searchIcon} />
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
            {locations.length === 0 ? 'Nenhum storage cadastrado' : 'Nenhum resultado'}
          </p>
        )}

        {!loading && filtered.map(loc => (
          <div
            key={loc.id}
            className={`${styles.card}${selectedId === loc.id ? ` ${styles.selected}` : ''}`}
            onClick={() => onSelect(loc)}
          >
            {/* Topo */}
            <div className={styles.cardTop}>
              <span className={`${styles.typeIcon} ${styles[loc.type]}`}>
                {SL_ABBR[loc.type]}
              </span>
              <div className={styles.cardMeta}>
                <div className={styles.cardNameRow}>
                  <span className={styles.cardName}>{loc.name}</span>
                  {loc.is_default && <span className={styles.defaultBadge}>Padrão</span>}
                </div>
                <span className={styles.cardPath}>{loc.type.toUpperCase()}</span>
              </div>
              <span className={`${styles.statusDot} ${styles[loc.status]}`} />
            </div>

            {/* Espaço disponível */}
            {loc.available_space_gb !== null && (
              <p className={styles.spaceInfo}>{loc.available_space_gb} GB disponíveis</p>
            )}

            {/* Rodapé */}
            <div className={styles.cardFooter}>
              <span className={`${styles.statusLabel} ${styles[`status_${loc.status}`]}`}>
                {STATUS_LABELS[loc.status]}
              </span>
              <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                {onEdit && (
                  <button className={styles.actionBtn} title="Editar" onClick={() => onEdit(loc)}>
                    <EditIcon width={12} height={12} />
                  </button>
                )}
                {onDelete && (
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    title="Remover"
                    onClick={() => onDelete(loc)}
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


