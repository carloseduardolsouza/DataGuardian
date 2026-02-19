import { useState } from 'react';
import type { MockFile, MockStorageLocation } from './mockData';
import { formatBytes, formatDate, getRootLabel } from './mockData';
import { TrashIcon } from '../../components/Icons';
import styles from './FileBrowser.module.css';

interface Crumb {
  label: string;
  files: MockFile[];
}

interface Props {
  location: MockStorageLocation;
}

export default function FileBrowser({ location }: Props) {
  const rootLabel = getRootLabel(location);

  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([
    { label: rootLabel, files: location.files },
  ]);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<MockFile | null>(null);
  const [sortBy, setSortBy]           = useState<'name' | 'size' | 'modified'>('name');
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc');

  const currentFiles = breadcrumbs[breadcrumbs.length - 1].files;

  // ── Sorted files ──────────────────────────────────────────────
  const sorted = [...currentFiles].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name')     cmp = a.name.localeCompare(b.name);
    else if (sortBy === 'size') {
      const sa = a.sizeBytes ?? 0;
      const sb = b.sizeBytes ?? 0;
      cmp = sa - sb;
    } else {
      cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime();
    }
    // Pastas sempre primeiro
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // ── Sort toggle ───────────────────────────────────────────────
  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const sortIndicator = (col: typeof sortBy) =>
    sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // ── Navigation ────────────────────────────────────────────────
  const openFolder = (folder: MockFile) => {
    if (!folder.children) return;
    setBreadcrumbs(prev => [...prev, { label: folder.name, files: folder.children! }]);
    setSelected(new Set());
  };

  const goToCrumb = (idx: number) => {
    setBreadcrumbs(prev => prev.slice(0, idx + 1));
    setSelected(new Set());
  };

  // ── Selection ─────────────────────────────────────────────────
  const allFiles     = sorted.filter(f => f.kind === 'file');
  const allSelected  = allFiles.length > 0 && allFiles.every(f => selected.has(f.id));
  const someSelected = allFiles.some(f => selected.has(f.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allFiles.map(f => f.id)));
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Delete ────────────────────────────────────────────────────
  const doDelete = (ids: string[]) => {
    const idSet = new Set(ids);
    setBreadcrumbs(prev => {
      const crumbs = [...prev];
      crumbs[crumbs.length - 1] = {
        ...crumbs[crumbs.length - 1],
        files: crumbs[crumbs.length - 1].files.filter(f => !idSet.has(f.id)),
      };
      return crumbs;
    });
    setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    setDeleteTarget(null);
  };

  const selectedCount = selected.size;

  return (
    <div className={styles.browser}>
      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        {/* Breadcrumb */}
        <nav className={styles.breadcrumb}>
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className={styles.crumbPart}>
              {idx > 0 && <ChevronIcon />}
              <button
                className={`${styles.crumbBtn}${idx === breadcrumbs.length - 1 ? ` ${styles.crumbActive}` : ''}`}
                onClick={() => goToCrumb(idx)}
              >
                {idx === 0 ? <HomeIcon /> : null}
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>

        {/* Ações */}
        <div className={styles.toolbarRight}>
          {selectedCount > 0 && (
            <button
              className={styles.deleteSelectedBtn}
              onClick={() => setDeleteTarget({ id: '__batch__', name: `${selectedCount} arquivo(s)`, kind: 'file', sizeBytes: null, created: '', modified: '', path: '' })}
            >
              <TrashIcon />
              Excluir {selectedCount} arquivo{selectedCount !== 1 ? 's' : ''}
            </button>
          )}
          <button className={styles.refreshBtn} title="Atualizar listagem">
            <RefreshIcon />
          </button>
        </div>
      </div>

      {/* ── Tabela de arquivos ─────────────────────────────────── */}
      <div className={styles.tableWrap}>
        {sorted.length === 0 ? (
          <div className={styles.emptyDir}>
            <FolderEmptyIcon />
            <p>Pasta vazia</p>
            {breadcrumbs.length > 1 && (
              <button className={styles.backLink} onClick={() => goToCrumb(breadcrumbs.length - 2)}>
                ← Voltar
              </button>
            )}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll}
                  />
                </th>
                <th className={styles.nameCol} onClick={() => toggleSort('name')}>
                  Nome{sortIndicator('name')}
                </th>
                <th>Datasource</th>
                <th className={styles.sortable} onClick={() => toggleSort('size')}>
                  Tamanho{sortIndicator('size')}
                </th>
                <th className={styles.sortable} onClick={() => toggleSort('modified')}>
                  Modificado{sortIndicator('modified')}
                </th>
                <th className={styles.actionsCol} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(file => (
                <tr
                  key={file.id}
                  className={`${selected.has(file.id) ? styles.selectedRow : ''}`}
                >
                  <td className={styles.checkCol}>
                    {file.kind === 'file' && (
                      <input
                        type="checkbox"
                        checked={selected.has(file.id)}
                        onChange={() => toggleOne(file.id)}
                      />
                    )}
                  </td>

                  <td>
                    <div className={styles.fileCell}>
                      {file.kind === 'folder' ? (
                        <button className={styles.folderBtn} onClick={() => openFolder(file)}>
                          <FolderIcon />
                          <span>{file.name}</span>
                          {file.children && (
                            <span className={styles.folderCount}>{file.children.length}</span>
                          )}
                        </button>
                      ) : (
                        <span className={styles.fileRow}>
                          <ArchiveIcon />
                          <span className={styles.fileName}>{file.name}</span>
                        </span>
                      )}
                    </div>
                  </td>

                  <td className={styles.muted}>{file.datasource ?? '—'}</td>

                  <td className={styles.muted}>
                    {file.kind === 'folder'
                      ? `${file.children?.length ?? 0} item${file.children?.length !== 1 ? 's' : ''}`
                      : formatBytes(file.sizeBytes ?? 0)
                    }
                  </td>

                  <td className={styles.muted}>{formatDate(file.modified)}</td>

                  <td className={styles.actionsCol}>
                    {file.kind === 'file' && (
                      <button
                        className={styles.deleteBtn}
                        title="Excluir backup"
                        onClick={() => setDeleteTarget(file)}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Rodapé com resumo ─────────────────────────────────── */}
      <div className={styles.statusBar}>
        <span>
          {sorted.filter(f => f.kind === 'folder').length} pasta(s) ·{' '}
          {sorted.filter(f => f.kind === 'file').length} arquivo(s)
        </span>
        {selectedCount > 0 && (
          <span className={styles.selectionInfo}>
            {selectedCount} selecionado{selectedCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Modal de confirmação de exclusão ──────────────────── */}
      {deleteTarget && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <div className={styles.dialogIconWrap}>
              <TrashIcon />
            </div>
            <h3 className={styles.dialogTitle}>Excluir permanentemente?</h3>
            <p className={styles.dialogText}>
              {deleteTarget.id === '__batch__' ? (
                <>
                  Os <strong>{selectedCount} arquivos</strong> selecionados serão excluídos do armazenamento.
                  Esta ação não pode ser desfeita.
                </>
              ) : (
                <>
                  O arquivo <strong>{deleteTarget.name}</strong> será excluído do armazenamento.
                  Esta ação não pode ser desfeita.
                </>
              )}
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                className={styles.confirmDeleteBtn}
                onClick={() =>
                  deleteTarget.id === '__batch__'
                    ? doDelete([...selected])
                    : doDelete([deleteTarget.id])
                }
              >
                <TrashIcon /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Ícones específicos do FileBrowser ──────────────────────────── */
function FolderIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none" opacity="0.85"><path d="M20 6h-8l-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2z"/></svg>;
}
function ArchiveIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>;
}
function ChevronIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>;
}
function HomeIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>;
}
function RefreshIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>;
}
function FolderEmptyIcon() {
  return <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>;
}
