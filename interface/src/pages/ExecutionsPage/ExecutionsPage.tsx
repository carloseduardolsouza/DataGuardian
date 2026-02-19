import { useEffect, useMemo, useState } from 'react';
import { datasourceApi, executionsApi } from '../../services/api';
import type { ApiDatasource, ApiExecution } from '../../services/api';
import { DS_ABBR } from '../../constants';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import { LogIcon, TrashIcon, ErrorIcon, CloseIcon, EmptyExecIcon, SpinnerIcon } from '../../components/Icons';
import LogModal from './LogModal';
import styles from './ExecutionsPage.module.css';

type ExecStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'queued';
type StatusFilter = 'all' | ExecStatus;
const PAGE_SIZES = [10, 25, 50] as const;

interface PaginationState {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function formatBytes(value: number | string | null) {
  if (value === null) return '—';
  const bytes = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const amount = bytes / 1024 ** index;
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(secs: number | null) {
  if (secs === null) return '—';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function toIsoStart(date: string) {
  if (!date) return undefined;
  return `${date}T00:00:00.000Z`;
}

function toIsoEnd(date: string) {
  if (!date) return undefined;
  return `${date}T23:59:59.999Z`;
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<ApiExecution[]>([]);
  const [datasources, setDatasources] = useState<ApiDatasource[]>([]);
  const [counts, setCounts] = useState<Record<StatusFilter, number>>({
    all: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    queued: 0,
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dsFilter, setDsFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<typeof PAGE_SIZES[number]>(10);

  const [pagination, setPagination] = useState<PaginationState>({ total: 0, page: 1, limit: pageSize, totalPages: 1 });
  const [logTargetId, setLogTargetId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDatasources() {
    try {
      const response = await datasourceApi.list();
      setDatasources(response.data);
    } catch {
      setDatasources([]);
    }
  }

  async function loadCounts() {
    try {
      const baseFilters = {
        limit: 1,
        page: 1,
        datasource_id: dsFilter || undefined,
        from: toIsoStart(dateFrom),
        to: toIsoEnd(dateTo),
      };

      const [all, running, completed, failed, cancelled, queued] = await Promise.all([
        executionsApi.list(baseFilters),
        executionsApi.list({ ...baseFilters, status: 'running' }),
        executionsApi.list({ ...baseFilters, status: 'completed' }),
        executionsApi.list({ ...baseFilters, status: 'failed' }),
        executionsApi.list({ ...baseFilters, status: 'cancelled' }),
        executionsApi.list({ ...baseFilters, status: 'queued' }),
      ]);

      setCounts({
        all: all.pagination.total,
        running: running.pagination.total,
        completed: completed.pagination.total,
        failed: failed.pagination.total,
        cancelled: cancelled.pagination.total,
        queued: queued.pagination.total,
      });
    } catch {
      setCounts({ all: 0, running: 0, completed: 0, failed: 0, cancelled: 0, queued: 0 });
    }
  }

  async function loadExecutions() {
    try {
      setLoading(true);
      setError(null);

      const response = await executionsApi.list({
        page,
        limit: pageSize,
        datasource_id: dsFilter || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        from: toIsoStart(dateFrom),
        to: toIsoEnd(dateTo),
      });

      setExecutions(response.data);
      setPagination(response.pagination);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar execuções');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDatasources();
  }, []);

  useEffect(() => {
    void Promise.all([loadExecutions(), loadCounts()]);
  }, [statusFilter, dsFilter, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    const hasLive = executions.some((item) => item.status === 'running' || item.status === 'queued');
    if (!hasLive) return;

    const timer = setInterval(() => {
      void Promise.all([loadExecutions(), loadCounts()]);
    }, 3000);

    return () => clearInterval(timer);
  }, [executions, statusFilter, dsFilter, dateFrom, dateTo, page, pageSize]);

  const pagedIds = useMemo(() => executions.map((item) => item.id), [executions]);
  const allSelected = pagedIds.length > 0 && pagedIds.every((id) => selected.has(id));
  const anySelected = pagedIds.some((id) => selected.has(id));

  const totalSize = useMemo(() => executions.reduce((acc, item) => {
    const value = item.compressed_size_bytes ?? item.size_bytes;
    const bytes = typeof value === 'string' ? Number(value) : value;
    return acc + (Number.isFinite(bytes) ? Number(bytes) : 0);
  }, 0), [executions]);

  function resetPage() {
    setPage(1);
  }

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        pagedIds.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);
      pagedIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function removeExecution(id: string) {
    try {
      await executionsApi.remove(id);
      await Promise.all([loadExecutions(), loadCounts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover execução');
    }
  }

  async function cancelExecution(id: string) {
    try {
      await executionsApi.cancel(id);
      await Promise.all([loadExecutions(), loadCounts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar execução');
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const ids = [...selected];
    const settled = await Promise.allSettled(ids.map((id) => executionsApi.remove(id)));
    const failed = settled.filter((result) => result.status === 'rejected').length;

    if (failed > 0) {
      setError(`${failed} execução(ões) não puderam ser removidas.`);
    }

    await Promise.all([loadExecutions(), loadCounts()]);
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Execuções</h2>
          <p className={styles.pageSub}>
            {counts.all} execuções · {formatBytes(totalSize)} nesta página
          </p>
        </div>
        {selected.size > 0 && (
          <button className={styles.deleteSelectedBtn} onClick={() => void deleteSelected()}>
            <TrashIcon /> Excluir {selected.size} selecionada{selected.size !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div className={styles.filterBar}>
        <div className={styles.statusTabs}>
          {([
            ['all', 'Todas', counts.all],
            ['running', 'Executando', counts.running],
            ['queued', 'Na fila', counts.queued],
            ['completed', 'Concluídas', counts.completed],
            ['failed', 'Com erro', counts.failed],
            ['cancelled', 'Canceladas', counts.cancelled],
          ] as [StatusFilter, string, number][]).map(([status, label, count]) => (
            <button
              key={status}
              className={`${styles.tab} ${statusFilter === status ? styles.tabActive : ''} ${status !== 'all' ? styles[`tab_${status}`] : ''}`}
              onClick={() => { setStatusFilter(status); resetPage(); }}
            >
              {label}
              {count > 0 && <span className={styles.tabCount}>{count}</span>}
            </button>
          ))}
        </div>

        <div className={styles.filterRight}>
          <select
            className={styles.filterSelect}
            value={dsFilter}
            onChange={(event) => { setDsFilter(event.target.value); resetPage(); }}
          >
            <option value="">Todos os bancos</option>
            {datasources.map((datasource) => (
              <option key={datasource.id} value={datasource.id}>{datasource.name}</option>
            ))}
          </select>

          <div className={styles.dateRange}>
            <input
              className={styles.dateInput}
              type="date"
              value={dateFrom}
              onChange={(event) => { setDateFrom(event.target.value); resetPage(); }}
              title="Data inicial"
            />
            <span className={styles.dateSep}>→</span>
            <input
              className={styles.dateInput}
              type="date"
              value={dateTo}
              onChange={(event) => { setDateTo(event.target.value); resetPage(); }}
              title="Data final"
            />
          </div>

          {(dsFilter || dateFrom || dateTo) && (
            <button
              className={styles.clearBtn}
              onClick={() => { setDsFilter(''); setDateFrom(''); setDateTo(''); resetPage(); }}
            >
              <CloseIcon /> Limpar
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 24px', color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>
          {error}
        </div>
      )}

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}><SpinnerIcon /><p>Carregando execuções...</p></div>
        ) : executions.length === 0 ? (
          <div className={styles.empty}>
            <EmptyExecIcon />
            <p>Nenhuma execução encontrada</p>
            <span>Tente ajustar os filtros aplicados</span>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = anySelected && !allSelected; }}
                    onChange={toggleAll}
                  />
                </th>
                <th>Job</th>
                <th>Banco de dados</th>
                <th>Storage</th>
                <th>Início</th>
                <th>Duração</th>
                <th>Tamanho</th>
                <th>Status</th>
                <th className={styles.actionsCol} />
              </tr>
            </thead>
            <tbody>
              {executions.map((execution) => (
                <ExecRow
                  key={execution.id}
                  execution={execution}
                  isSelected={selected.has(execution.id)}
                  onToggle={() => toggleOne(execution.id)}
                  onViewLog={() => setLogTargetId(execution.id)}
                  onDelete={() => void removeExecution(execution.id)}
                  onCancel={() => void cancelExecution(execution.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.pagination}>
        <div className={styles.pagLeft}>
          <span className={styles.pagInfo}>
            {pagination.total === 0
              ? '0 resultados'
              : `${(pagination.page - 1) * pagination.limit + 1}–${Math.min(pagination.page * pagination.limit, pagination.total)} de ${pagination.total}`}
          </span>
          <select
            className={styles.pagSelect}
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as typeof PAGE_SIZES[number]);
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} por página</option>)}
          </select>
        </div>

        <div className={styles.pagButtons}>
          <button className={styles.pagBtn} onClick={() => setPage(1)} disabled={pagination.page === 1}>«</button>
          <button className={styles.pagBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.page === 1}>‹</button>

          {Array.from({ length: pagination.totalPages }, (_, index) => index + 1)
            .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - pagination.page) <= 1)
            .reduce<(number | '...')[]>((acc, p, index, arr) => {
              if (index > 0 && p - (arr[index - 1] as number) > 1) acc.push('...');
              acc.push(p);
              return acc;
            }, [])
            .map((p, index) => p === '...'
              ? <span key={`ellipsis-${index}`} className={styles.pagEllipsis}>…</span>
              : (
                <button
                  key={p}
                  className={`${styles.pagBtn} ${p === pagination.page ? styles.pagBtnActive : ''}`}
                  onClick={() => setPage(p as number)}
                >
                  {p}
                </button>
              ))}

          <button className={styles.pagBtn} onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={pagination.page === pagination.totalPages}>›</button>
          <button className={styles.pagBtn} onClick={() => setPage(pagination.totalPages)} disabled={pagination.page === pagination.totalPages}>»</button>
        </div>
      </div>

      {logTargetId && (
        <LogModal
          executionId={logTargetId}
          onClose={() => setLogTargetId(null)}
          onChanged={async () => {
            await Promise.all([loadExecutions(), loadCounts()]);
          }}
        />
      )}
    </div>
  );
}

function ExecRow({
  execution,
  isSelected,
  onToggle,
  onViewLog,
  onDelete,
  onCancel,
}: {
  execution: ApiExecution;
  isSelected: boolean;
  onToggle: () => void;
  onViewLog: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const isRunning = execution.status === 'running';
  const isQueued = execution.status === 'queued';

  return (
    <>
      <tr className={`${isSelected ? styles.selectedRow : ''} ${isRunning ? styles.runningRow : ''}`}>
        <td className={styles.checkCol}>
          <input type="checkbox" checked={isSelected} onChange={onToggle} />
        </td>

        <td>
          <div className={styles.jobCell}>
            <span className={styles.jobName}>{execution.job?.name ?? execution.job_id}</span>
            <span className={styles.jobId}>{execution.id}</span>
          </div>
        </td>

        <td>
          <div className={styles.dsCell}>
            <span className={`${styles.dsIcon} ${styles[execution.datasource?.type ?? 'postgres']}`}>
              {DS_ABBR[execution.datasource?.type ?? 'postgres'] ?? 'DB'}
            </span>
            <span className={styles.dsName}>{execution.datasource?.name ?? execution.datasource_id}</span>
          </div>
        </td>

        <td>
          <div className={styles.storageList}>
            <span className={styles.storageChip}>{execution.storage_location?.name ?? execution.storage_location_id}</span>
          </div>
        </td>

        <td className={styles.dateCell}>{formatDateTime(execution.started_at)}</td>
        <td className={styles.monoCell}>{isRunning ? 'em andamento...' : formatDuration(execution.duration_seconds)}</td>
        <td className={styles.monoCell}>{formatBytes(execution.compressed_size_bytes ?? execution.size_bytes)}</td>
        <td><StatusBadge status={execution.status === 'completed' ? 'success' : execution.status} /></td>

        <td className={styles.actionsCol}>
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={onViewLog} title="Ver logs"><LogIcon /></button>
            {(isRunning || isQueued) && (
              <button className={styles.actionBtn} onClick={onCancel} title="Cancelar execução"><CloseIcon /></button>
            )}
            <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={onDelete} disabled={isRunning || isQueued} title="Excluir execução">
              <TrashIcon />
            </button>
          </div>
        </td>
      </tr>

      {execution.status === 'failed' && execution.error_message && (
        <tr className={styles.errorRow}>
          <td />
          <td colSpan={8}>
            <div className={styles.errorInline}>
              <ErrorIcon />
              <span>{execution.error_message}</span>
              <button className={styles.logsLink} onClick={onViewLog}>Ver logs completos →</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
