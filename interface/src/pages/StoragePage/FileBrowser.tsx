import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiStorageBrowserEntry } from '../../services/api';
import { storageApi } from '../../services/api';
import { CopyIcon, ExportIcon, TrashIcon } from '../../ui/icons/Icons';
import ConfirmDialog from '../../ui/dialogs/ConfirmDialog/ConfirmDialog';
import styles from './FileBrowser.module.css';

interface Props {
  locationId: string;
  locationName: string;
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FileBrowser({ locationId, locationName }: Props) {
  const [cwd, setCwd] = useState('');
  const [rootLabel, setRootLabel] = useState(locationName);
  const [entries, setEntries] = useState<ApiStorageBrowserEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [refreshTick, setRefreshTick] = useState(0);
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await storageApi.browseFiles(locationId, cwd);
      setEntries(response.entries);
      setRootLabel(response.root_label);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar arquivos');
    } finally {
      setLoading(false);
    }
  }, [cwd, locationId]);

  useEffect(() => {
    setCwd('');
    setSelected(new Set());
  }, [locationId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries, refreshTick]);

  const breadcrumbs = useMemo(() => {
    const parts = cwd ? cwd.split('/') : [];
    const acc: Array<{ label: string; path: string }> = [{ label: rootLabel, path: '' }];
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      acc.push({ label: part, path: current });
    }
    return acc;
  }, [cwd, rootLabel]);

  const sorted = useMemo(() => {
    const list = [...entries];
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;

      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'size') cmp = (a.size_bytes ?? 0) - (b.size_bytes ?? 0);
      else cmp = new Date(a.modified_at ?? 0).getTime() - new Date(b.modified_at ?? 0).getTime();

      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [entries, sortBy, sortDir]);

  const filesOnly = sorted.filter((entry) => entry.kind === 'file');
  const allSelected = filesOnly.length > 0 && filesOnly.every((entry) => selected.has(entry.path));
  const someSelected = filesOnly.some((entry) => selected.has(entry.path));

  const toggleSort = (col: 'name' | 'size' | 'modified') => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const sortIndicator = (col: 'name' | 'size' | 'modified') =>
    sortBy === col ? (sortDir === 'asc' ? ' ?' : ' ?') : '';

  const toggleOne = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filesOnly.map((entry) => entry.path)));
  };

  const deletePaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    setPendingDeletePaths(paths);
  };

  const confirmDeletePaths = async () => {
    if (pendingDeletePaths.length === 0) return;
    try {
      setDeleting(true);
      await Promise.all(pendingDeletePaths.map((targetPath) => storageApi.deletePath(locationId, targetPath)));
      setSelected(new Set());
      setRefreshTick((v) => v + 1);
      setPendingDeletePaths([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir itens');
    } finally {
      setDeleting(false);
    }
  };

  const copyPath = async (sourcePath: string) => {
    const suggestedName = sourcePath.split('/').pop() ?? 'copy';
    const destinationInput = prompt('Novo caminho de destino (relativo ao storage):', `${cwd ? `${cwd}/` : ''}${suggestedName}_copy`);
    if (!destinationInput) return;

    try {
      await storageApi.copyPath(locationId, sourcePath, destinationInput);
      setRefreshTick((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao copiar arquivo');
    }
  };
  const downloadPath = async (targetPath: string) => {
    try {
      await storageApi.downloadPath(locationId, targetPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao baixar arquivo');
    }
  };

  return (
    <div className={styles.browser}>
      <div className={styles.toolbar}>
        <nav className={styles.breadcrumb}>
          {breadcrumbs.map((crumb, idx) => (
            <span key={crumb.path || 'root'} className={styles.crumbPart}>
              {idx > 0 && <ChevronIcon />}
              <button
                className={`${styles.crumbBtn}${idx === breadcrumbs.length - 1 ? ` ${styles.crumbActive}` : ''}`}
                onClick={() => setCwd(crumb.path)}
              >
                {idx === 0 ? <HomeIcon /> : null}
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>

        <div className={styles.toolbarRight}>
          {selected.size > 0 && (
            <button className={styles.deleteSelectedBtn} onClick={() => void deletePaths([...selected])}>
              <TrashIcon /> Excluir {selected.size}
            </button>
          )}
          <button className={styles.refreshBtn} title="Atualizar" onClick={() => setRefreshTick((v) => v + 1)}>
            <RefreshIcon />
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        {loading && <div className={styles.emptyDir}><p>Carregando arquivos...</p></div>}
        {!loading && error && <div className={styles.emptyDir}><p>{error}</p></div>}

        {!loading && !error && sorted.length === 0 && (
          <div className={styles.emptyDir}>
            <FolderEmptyIcon />
            <p>Pasta vazia</p>
          </div>
        )}

        {!loading && !error && sorted.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={toggleAll}
                  />
                </th>
                <th className={styles.nameCol} onClick={() => toggleSort('name')}>Nome{sortIndicator('name')}</th>
                <th className={styles.sortable} onClick={() => toggleSort('size')}>Tamanho{sortIndicator('size')}</th>
                <th className={styles.sortable} onClick={() => toggleSort('modified')}>Modificado{sortIndicator('modified')}</th>
                <th className={styles.actionsCol} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <tr key={entry.path} className={selected.has(entry.path) ? styles.selectedRow : ''}>
                  <td className={styles.checkCol}>
                    {entry.kind === 'file' && (
                      <input type="checkbox" checked={selected.has(entry.path)} onChange={() => toggleOne(entry.path)} />
                    )}
                  </td>
                  <td>
                    {entry.kind === 'folder' ? (
                      <button className={styles.folderBtn} onClick={() => setCwd(entry.path)}>
                        <FolderIcon />
                        <span>{entry.name}</span>
                      </button>
                    ) : (
                      <span className={styles.fileRow}>
                        <ArchiveIcon />
                        <span className={styles.fileName}>{entry.name}</span>
                      </span>
                    )}
                  </td>
                  <td className={styles.muted}>{entry.kind === 'folder' ? '-' : formatBytes(entry.size_bytes)}</td>
                  <td className={styles.muted}>{formatDate(entry.modified_at)}</td>
                  <td className={styles.actionsCol}>
                    {entry.kind === 'file' && (
                      <>
                        <button className={styles.downloadBtn} title="Baixar" onClick={() => void downloadPath(entry.path)}>
                          <ExportIcon width={12} height={12} />
                        </button>
                        <button className={styles.copyBtn} title="Copiar" onClick={() => void copyPath(entry.path)}>
                          <CopyIcon width={12} height={12} />
                        </button>
                        <button className={styles.deleteBtn} title="Excluir" onClick={() => void deletePaths([entry.path])}>
                          <TrashIcon />
                        </button>
                      </>
                    )}
                    {entry.kind === 'folder' && (
                      <button className={styles.deleteBtn} title="Excluir pasta" onClick={() => void deletePaths([entry.path])}>
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

      <div className={styles.statusBar}>
        <span>{sorted.filter((e) => e.kind === 'folder').length} pasta(s) · {sorted.filter((e) => e.kind === 'file').length} arquivo(s)</span>
      </div>

      <ConfirmDialog
        open={pendingDeletePaths.length > 0}
        title="Confirmar exclusao no storage"
        message={pendingDeletePaths.length === 1
          ? 'Deseja excluir este item?'
          : `Deseja excluir ${pendingDeletePaths.length} itens selecionados?`}
        confirmLabel={pendingDeletePaths.length === 1 ? 'Excluir item' : 'Excluir itens'}
        loading={deleting}
        onClose={() => {
          if (!deleting) setPendingDeletePaths([]);
        }}
        onConfirm={() => void confirmDeletePaths()}
      />
    </div>
  );
}

function FolderIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none" opacity="0.85"><path d="M20 6h-8l-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2z" /></svg>;
}
function ArchiveIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>;
}
function ChevronIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>;
}
function HomeIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>;
}
function RefreshIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg>;
}
function FolderEmptyIcon() {
  return <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>;
}





