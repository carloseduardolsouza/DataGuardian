import { useMemo, useState } from 'react';
import type { ApiDatasource, ApiDatasourceFolder } from '../../services/api';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EditIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  SpinnerIcon,
  TrashIcon,
} from '../../ui/icons/Icons';
import { DS_ABBR } from '../../constants';
import styles from './DatasourceList.module.css';

interface Props {
  datasources: ApiDatasource[];
  folders: ApiDatasourceFolder[];
  selectedId: string | null;
  onSelect: (ds: ApiDatasource) => void;
  onContextMenu?: (ds: ApiDatasource, x: number, y: number) => void;
  onAddNew?: () => void;
  onAddFolder?: () => void;
  onEdit?: (ds: ApiDatasource) => void;
  onDelete?: (ds: ApiDatasource) => void;
  onEditFolder?: (folder: ApiDatasourceFolder) => void;
  onDeleteFolder?: (folder: ApiDatasourceFolder) => void;
  onMoveDatasource?: (datasourceId: string, folderId: string | null) => void | Promise<void>;
  onReorderFolder?: (folderId: string, direction: 'up' | 'down') => void | Promise<void>;
  onReorderDatasource?: (datasourceId: string, folderId: string | null, direction: 'up' | 'down') => void | Promise<void>;
  loading?: boolean;
  error?: string | null;
}

type DatasourceStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

const STATUS_LABELS: Record<string, string> = {
  healthy: 'Saudavel',
  warning: 'Atencao',
  critical: 'Critico',
  unknown: 'Desconhecido',
};

const STATUS_ORDER: DatasourceStatus[] = ['healthy', 'warning', 'critical', 'unknown'];

const STATUS_EXPLANATIONS: Record<DatasourceStatus, string> = {
  healthy: 'Aparece quando o ultimo health check foi bem-sucedido e a conexao esta estavel.',
  warning: 'Aparece quando ha degradacao parcial: latencia alta, falhas intermitentes ou limitacoes nao criticas.',
  critical: 'Aparece quando a conexao falhou ou o datasource esta indisponivel para operacoes.',
  unknown: 'Aparece quando ainda nao houve health check recente ou nao foi possivel determinar o estado.',
};

function matchesDatasource(ds: ApiDatasource, search: string) {
  if (!search) return true;
  const term = search.toLowerCase();
  return ds.name.toLowerCase().includes(term)
    || ds.tags.some((t) => t.toLowerCase().includes(term))
    || (ds.folder_name?.toLowerCase().includes(term) ?? false);
}

export default function DatasourceList({
  datasources,
  folders,
  selectedId,
  onSelect,
  onContextMenu,
  onAddNew,
  onAddFolder,
  onEdit,
  onDelete,
  onEditFolder,
  onDeleteFolder,
  onMoveDatasource,
  onReorderFolder,
  onReorderDatasource,
  loading,
  error,
}: Props) {
  const [search, setSearch] = useState('');
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [draggedDatasourceId, setDraggedDatasourceId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);

  const filteredDatasources = useMemo(
    () => datasources.filter((ds) => matchesDatasource(ds, search)),
    [datasources, search],
  );

  const filteredDatasourceIds = new Set(filteredDatasources.map((ds) => ds.id));
  const visibleFolders = folders.filter((folder) => {
    const nameMatches = !search || folder.name.toLowerCase().includes(search.toLowerCase());
    const hasMatchingChildren = datasources.some((ds) => ds.folder_id === folder.id && filteredDatasourceIds.has(ds.id));
    return nameMatches || hasMatchingChildren;
  });

  const rootDatasources = filteredDatasources.filter((ds) => ds.folder_id === null);

  const groupedDatasources = new Map<string, ApiDatasource[]>();
  for (const folder of folders) {
    groupedDatasources.set(folder.id, filteredDatasources.filter((ds) => ds.folder_id === folder.id));
  }

  const statusCounts = filteredDatasources.reduce<Record<DatasourceStatus, number>>(
    (acc, ds) => {
      acc[ds.status] += 1;
      return acc;
    },
    { healthy: 0, warning: 0, critical: 0, unknown: 0 },
  );

  const handleDrop = async (folderId: string | null) => {
    if (!draggedDatasourceId || !onMoveDatasource) return;
    const datasource = datasources.find((item) => item.id === draggedDatasourceId);
    if (!datasource || datasource.folder_id === folderId) {
      setDragTarget(null);
      setDraggedDatasourceId(null);
      return;
    }
    await onMoveDatasource(draggedDatasourceId, folderId);
    setDragTarget(null);
    setDraggedDatasourceId(null);
  };

  const emptyMessage = datasources.length === 0 ? 'Nenhum datasource cadastrado' : 'Nenhum resultado';

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.title}>Datasources</span>
          <div className={styles.headerActions}>
            <button className={styles.addBtnSecondary} title="Adicionar pasta" onClick={onAddFolder}>
              <FolderIcon width={14} height={14} />
            </button>
            <button className={styles.addBtn} title="Adicionar datasource" onClick={onAddNew}>
              <PlusIcon />
            </button>
          </div>
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
          {STATUS_ORDER.map((status) => (
            <span key={status} className={styles.summaryBadgeWrap} tabIndex={0}>
              <span className={`${styles.summaryBadge} ${styles[`status_${status}`]}`}>
                {STATUS_LABELS[status]}: {statusCounts[status]}
              </span>
              <span className={styles.summaryTooltip} role="tooltip">
                {STATUS_EXPLANATIONS[status]}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className={styles.list}>
        {loading && <div className={styles.loadingState}><SpinnerIcon width={16} height={16} /> Carregando...</div>}
        {error && !loading && <p className={styles.errorState}>{error}</p>}
        {!loading && !error && filteredDatasources.length === 0 && visibleFolders.length === 0 && <p className={styles.emptyState}>{emptyMessage}</p>}

        {!loading && !error && (filteredDatasources.length > 0 || visibleFolders.length > 0) && (
          <div className={styles.tree}>
            <div
              className={`${styles.rootItems}${dragTarget === 'root' ? ` ${styles.rootDropActive}` : ''}`}
              onDragOver={(event) => {
                if (!draggedDatasourceId) return;
                event.preventDefault();
                setDragTarget('root');
              }}
              onDragLeave={() => {
                if (dragTarget === 'root') setDragTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                void handleDrop(null);
              }}
            >
              {rootDatasources.map((ds, index) => (
                <DatasourceCard
                  key={ds.id}
                  datasource={ds}
                  selected={selectedId === ds.id}
                  draggable={Boolean(onMoveDatasource)}
                  canMoveUp={index > 0}
                  canMoveDown={index < rootDatasources.length - 1}
                  onMoveUp={onReorderDatasource ? () => onReorderDatasource(ds.id, null, 'up') : undefined}
                  onMoveDown={onReorderDatasource ? () => onReorderDatasource(ds.id, null, 'down') : undefined}
                  onSelect={onSelect}
                  onContextMenu={onContextMenu}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onDragStart={() => setDraggedDatasourceId(ds.id)}
                  onDragEnd={() => {
                    setDraggedDatasourceId(null);
                    setDragTarget(null);
                  }}
                />
              ))}
            </div>

            {visibleFolders.map((folder, folderIndex) => {
              const folderDatasources = groupedDatasources.get(folder.id) ?? [];
              const isOpen = openFolders[folder.id] ?? true;
              return (
                <div
                  key={folder.id}
                  className={`${styles.folderSection}${dragTarget === folder.id ? ` ${styles.folderDropActive}` : ''}`}
                  onDragOver={(event) => {
                    if (!draggedDatasourceId) return;
                    event.preventDefault();
                    setDragTarget(folder.id);
                  }}
                  onDragLeave={() => {
                    if (dragTarget === folder.id) setDragTarget(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleDrop(folder.id);
                  }}
                >
                  <button
                    className={styles.folderHeaderBtn}
                    onClick={() => setOpenFolders((prev) => ({ ...prev, [folder.id]: !isOpen }))}
                    type="button"
                  >
                    <div className={styles.folderTitleWrap}>
                      <ChevronDownIcon width={12} height={12} className={`${styles.folderChevron}${isOpen ? ` ${styles.folderChevronOpen}` : ''}`} />
                      <FolderIcon width={14} height={14} />
                      <span className={styles.folderTitle}>{folder.name}</span>
                    </div>
                    <div className={styles.folderHeaderActions} onClick={(event) => event.stopPropagation()}>
                      <span className={styles.folderCount}>{folderDatasources.length}</span>
                      {onEditFolder && (
                        <button
                          className={styles.actionBtn}
                          onClick={() => onEditFolder(folder)}
                          type="button"
                          title="Editar nome da pasta"
                        >
                          <EditIcon width={12} height={12} />
                        </button>
                      )}
                      {onDeleteFolder && (
                        <button
                          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                          onClick={() => onDeleteFolder(folder)}
                          type="button"
                          title="Excluir pasta"
                        >
                          <TrashIcon width={12} height={12} />
                        </button>
                      )}
                      <button
                        className={styles.orderBtn}
                        disabled={!onReorderFolder || folderIndex === 0}
                        onClick={() => onReorderFolder?.(folder.id, 'up')}
                        type="button"
                        title="Mover pasta para cima"
                      >
                        <ChevronUpIcon width={12} height={12} />
                      </button>
                      <button
                        className={styles.orderBtn}
                        disabled={!onReorderFolder || folderIndex === visibleFolders.length - 1}
                        onClick={() => onReorderFolder?.(folder.id, 'down')}
                        type="button"
                        title="Mover pasta para baixo"
                      >
                        <ChevronDownIcon width={12} height={12} />
                      </button>
                    </div>
                  </button>

                  {isOpen && (
                    <div className={styles.folderItems}>
                      {folderDatasources.length === 0 ? (
                        <div className={styles.folderEmpty}>Arraste um datasource para dentro desta pasta.</div>
                      ) : (
                        folderDatasources.map((ds, index) => (
                          <DatasourceCard
                            key={ds.id}
                            datasource={ds}
                            selected={selectedId === ds.id}
                            draggable={Boolean(onMoveDatasource)}
                            canMoveUp={index > 0}
                            canMoveDown={index < folderDatasources.length - 1}
                            onMoveUp={onReorderDatasource ? () => onReorderDatasource(ds.id, folder.id, 'up') : undefined}
                            onMoveDown={onReorderDatasource ? () => onReorderDatasource(ds.id, folder.id, 'down') : undefined}
                            onSelect={onSelect}
                            onContextMenu={onContextMenu}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onDragStart={() => setDraggedDatasourceId(ds.id)}
                            onDragEnd={() => {
                              setDraggedDatasourceId(null);
                              setDragTarget(null);
                            }}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DatasourceCard({
  datasource,
  selected,
  draggable,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onSelect,
  onContextMenu,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  datasource: ApiDatasource;
  selected: boolean;
  draggable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onSelect: (ds: ApiDatasource) => void;
  onContextMenu?: (ds: ApiDatasource, x: number, y: number) => void;
  onEdit?: (ds: ApiDatasource) => void;
  onDelete?: (ds: ApiDatasource) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={`${styles.card}${selected ? ` ${styles.selected}` : ''}`}
      onClick={() => onSelect(datasource)}
      onContextMenu={(event) => {
        if (!onContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(datasource, event.clientX, event.clientY);
      }}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', datasource.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className={styles.cardTop}>
        <div className={`${styles.typeIcon} ${styles[datasource.type]}`}>{DS_ABBR[datasource.type]}</div>
        <div className={styles.cardMeta}>
          <p className={styles.cardName}>{datasource.name}</p>
          <p className={styles.cardHost}>{datasource.type.toUpperCase()}</p>
        </div>
        <span className={`${styles.statusDot} ${styles[datasource.status]}`} title={STATUS_LABELS[datasource.status]} />
      </div>

      {datasource.tags.length > 0 && (
        <div className={styles.tags}>
          {datasource.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
        </div>
      )}

      <div className={styles.cardFooter}>
        <span className={`${styles.statusLabel} ${styles[`status_${datasource.status}`]}`}>{STATUS_LABELS[datasource.status]}</span>
        <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
          <button className={styles.orderBtn} title="Mover para cima" onClick={onMoveUp} disabled={!canMoveUp || !onMoveUp}>
            <ChevronUpIcon width={12} height={12} />
          </button>
          <button className={styles.orderBtn} title="Mover para baixo" onClick={onMoveDown} disabled={!canMoveDown || !onMoveDown}>
            <ChevronDownIcon width={12} height={12} />
          </button>
          {onEdit && <button className={styles.actionBtn} title="Editar" onClick={() => onEdit(datasource)}><EditIcon width={12} height={12} /></button>}
          {onDelete && <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} title="Remover" onClick={() => onDelete(datasource)}><TrashIcon width={12} height={12} /></button>}
        </div>
      </div>
    </div>
  );
}
