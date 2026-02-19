import { useState, useMemo } from 'react';
import {
  MOCK_EXECUTIONS, DS_FILTER_OPTIONS,
  formatBytes, formatDuration, formatDateTime,
} from './mockData';
import type { MockExecution, ExecStatus } from './mockData';
import { DS_ABBR } from '../../constants';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import { LogIcon, TrashIcon, ErrorIcon, CloseIcon, EmptyExecIcon } from '../../components/Icons';
import LogModal from './LogModal';
import styles from './ExecutionsPage.module.css';

type StatusFilter = 'all' | ExecStatus;
const PAGE_SIZES = [10, 25, 50] as const;

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState(MOCK_EXECUTIONS);

  // ── Filtros ───────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dsFilter,     setDsFilter]     = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');

  // ── Seleção e paginação ───────────────────────────────────────
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState<typeof PAGE_SIZES[number]>(10);

  // ── Modal de logs ─────────────────────────────────────────────
  const [logTarget, setLogTarget] = useState<MockExecution | null>(null);

  // ── Filtrar + ordenar ─────────────────────────────────────────
  const filtered = useMemo(() => {
    return executions
      .filter(e => {
        if (statusFilter !== 'all' && e.status !== statusFilter) return false;
        if (dsFilter && e.datasourceId !== dsFilter) return false;
        if (dateFrom && e.startedAt < dateFrom) return false;
        if (dateTo) {
          const end = dateTo + 'T23:59:59Z';
          if (e.startedAt > end) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [executions, statusFilter, dsFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const resetPage  = () => setPage(1);

  // ── Contadores para os tabs ───────────────────────────────────
  const counts = useMemo(() => ({
    all:       executions.length,
    running:   executions.filter(e => e.status === 'running').length,
    completed: executions.filter(e => e.status === 'completed').length,
    failed:    executions.filter(e => e.status === 'failed').length,
    cancelled: executions.filter(e => e.status === 'cancelled').length,
  }), [executions]);

  // ── Seleção ───────────────────────────────────────────────────
  const pagedIds    = paged.map(e => e.id);
  const allSelected = pagedIds.length > 0 && pagedIds.every(id => selected.has(id));
  const anySelected = pagedIds.some(id => selected.has(id));

  const toggleAll = () => {
    if (allSelected) setSelected(prev => { const n = new Set(prev); pagedIds.forEach(id => n.delete(id)); return n; });
    else             setSelected(prev => { const n = new Set(prev); pagedIds.forEach(id => n.add(id)); return n; });
  };

  const toggleOne = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Deletar ───────────────────────────────────────────────────
  const deleteSelected = () => {
    setExecutions(prev => prev.filter(e => !selected.has(e.id)));
    setSelected(new Set());
  };

  const deleteOne = (id: string) => {
    setExecutions(prev => prev.filter(e => e.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const totalSize = executions
    .filter(e => e.sizeBytes)
    .reduce((acc, e) => acc + (e.sizeBytes ?? 0), 0);

  return (
    <div className={styles.page}>
      {/* ── Cabeçalho ──────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Execuções</h2>
          <p className={styles.pageSub}>
            {executions.length} execuções · {formatBytes(totalSize)} total armazenado
          </p>
        </div>
        {selected.size > 0 && (
          <button className={styles.deleteSelectedBtn} onClick={deleteSelected}>
            <TrashIcon />
            Excluir {selected.size} selecionada{selected.size !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* ── Barra de filtros ────────────────────────────────────── */}
      <div className={styles.filterBar}>
        {/* Status tabs */}
        <div className={styles.statusTabs}>
          {([
            ['all',       'Todas',      counts.all],
            ['running',   'Em execução', counts.running],
            ['completed', 'Concluídas', counts.completed],
            ['failed',    'Com erro',   counts.failed],
            ['cancelled', 'Canceladas', counts.cancelled],
          ] as [StatusFilter, string, number][]).map(([s, label, count]) => (
            <button
              key={s}
              className={`${styles.tab} ${statusFilter === s ? styles.tabActive : ''} ${s !== 'all' ? styles[`tab_${s}`] : ''}`}
              onClick={() => { setStatusFilter(s); resetPage(); }}
            >
              {label}
              {count > 0 && <span className={styles.tabCount}>{count}</span>}
            </button>
          ))}
        </div>

        {/* Filtros adicionais */}
        <div className={styles.filterRight}>
          <select
            className={styles.filterSelect}
            value={dsFilter}
            onChange={e => { setDsFilter(e.target.value); resetPage(); }}
          >
            {DS_FILTER_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          <div className={styles.dateRange}>
            <input
              className={styles.dateInput}
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); resetPage(); }}
              title="Data inicial"
            />
            <span className={styles.dateSep}>→</span>
            <input
              className={styles.dateInput}
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); resetPage(); }}
              title="Data final"
            />
          </div>

          {(dsFilter || dateFrom || dateTo) && (
            <button
              className={styles.clearBtn}
              onClick={() => { setDsFilter(''); setDateFrom(''); setDateTo(''); resetPage(); }}
              title="Limpar filtros"
            >
              <CloseIcon /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Tabela ──────────────────────────────────────────────── */}
      <div className={styles.tableWrap}>
        {paged.length === 0 ? (
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
                    ref={el => { if (el) el.indeterminate = anySelected && !allSelected; }}
                    onChange={toggleAll}
                  />
                </th>
                <th>Job</th>
                <th>Banco de dados</th>
                <th>Storage(s)</th>
                <th>Início</th>
                <th>Duração</th>
                <th>Tamanho</th>
                <th>Status</th>
                <th className={styles.actionsCol} />
              </tr>
            </thead>
            <tbody>
              {paged.map(exec => (
                <ExecRow
                  key={exec.id}
                  exec={exec}
                  isSelected={selected.has(exec.id)}
                  onToggle={() => toggleOne(exec.id)}
                  onViewLog={() => setLogTarget(exec)}
                  onDelete={() => deleteOne(exec.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Rodapé / Paginação ───────────────────────────────────── */}
      <div className={styles.pagination}>
        <div className={styles.pagLeft}>
          <span className={styles.pagInfo}>
            {filtered.length === 0 ? '0 resultados' : (
              `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} de ${filtered.length}`
            )}
          </span>
          <select
            className={styles.pagSelect}
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value) as typeof PAGE_SIZES[number]); resetPage(); }}
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s} por página</option>)}
          </select>
        </div>

        <div className={styles.pagButtons}>
          <button
            className={styles.pagBtn}
            onClick={() => setPage(1)}
            disabled={safePage === 1}
            title="Primeira página"
          >
            «
          </button>
          <button
            className={styles.pagBtn}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >
            ‹
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
            .reduce<(number | '…')[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === '…'
                ? <span key={`e${i}`} className={styles.pagEllipsis}>…</span>
                : <button
                    key={p}
                    className={`${styles.pagBtn} ${p === safePage ? styles.pagBtnActive : ''}`}
                    onClick={() => setPage(p as number)}
                  >
                    {p}
                  </button>
            )
          }

          <button
            className={styles.pagBtn}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
          >
            ›
          </button>
          <button
            className={styles.pagBtn}
            onClick={() => setPage(totalPages)}
            disabled={safePage === totalPages}
            title="Última página"
          >
            »
          </button>
        </div>
      </div>

      {/* ── Modal de logs ──────────────────────────────────────── */}
      {logTarget && (
        <LogModal exec={logTarget} onClose={() => setLogTarget(null)} />
      )}
    </div>
  );
}

/* ── Linha da tabela ────────────────────────────────────────────── */
function ExecRow({
  exec, isSelected, onToggle, onViewLog, onDelete,
}: {
  exec:       MockExecution;
  isSelected: boolean;
  onToggle:   () => void;
  onViewLog:  () => void;
  onDelete:   () => void;
}) {
  const isRunning = exec.status === 'running';

  return (
    <>
      <tr className={`${isSelected ? styles.selectedRow : ''} ${isRunning ? styles.runningRow : ''}`}>
        <td className={styles.checkCol}>
          <input type="checkbox" checked={isSelected} onChange={onToggle} />
        </td>

        {/* Nome do job */}
        <td>
          <div className={styles.jobCell}>
            <span className={styles.jobName}>{exec.jobName}</span>
            <span className={styles.jobId}>{exec.id}</span>
          </div>
        </td>

        {/* Banco */}
        <td>
          <div className={styles.dsCell}>
            <span className={`${styles.dsIcon} ${styles[exec.datasourceType]}`}>
              {DS_ABBR[exec.datasourceType] ?? 'DB'}
            </span>
            <span className={styles.dsName}>{exec.datasourceName}</span>
          </div>
        </td>

        {/* Storages */}
        <td>
          <div className={styles.storageList}>
            {exec.storageNames.map(s => (
              <span key={s} className={styles.storageChip}>{s}</span>
            ))}
          </div>
        </td>

        {/* Início */}
        <td className={styles.dateCell}>{formatDateTime(exec.startedAt)}</td>

        {/* Duração */}
        <td className={styles.monoCell}>
          {isRunning ? (
            <span className={styles.runningText}>em andamento…</span>
          ) : exec.durationSeconds !== null ? (
            formatDuration(exec.durationSeconds)
          ) : '—'}
        </td>

        {/* Tamanho */}
        <td className={styles.monoCell}>
          {exec.sizeBytes ? formatBytes(exec.sizeBytes) : '—'}
        </td>

        {/* Status */}
        <td>
          <StatusBadge status={exec.status} />
        </td>

        {/* Ações */}
        <td className={styles.actionsCol}>
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={onViewLog} title="Ver logs">
              <LogIcon />
            </button>
            <button
              className={`${styles.actionBtn} ${styles.deleteBtn}`}
              onClick={onDelete}
              title="Excluir execução"
              disabled={isRunning}
            >
              <TrashIcon />
            </button>
          </div>
        </td>
      </tr>

      {/* Linha de erro inline (quando falhou) */}
      {exec.status === 'failed' && exec.errorMessage && (
        <tr className={styles.errorRow}>
          <td />
          <td colSpan={8}>
            <div className={styles.errorInline}>
              <ErrorIcon />
              <span>{exec.errorMessage}</span>
              <button className={styles.logsLink} onClick={onViewLog}>Ver logs completos →</button>
            </div>
          </td>
        </tr>
      )}

      {/* Barra de progresso (quando está rodando) */}
      {isRunning && exec.progress !== null && (
        <tr className={styles.progressRow}>
          <td />
          <td colSpan={8}>
            <div className={styles.progressWrap}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${exec.progress}%` }} />
              </div>
              <span className={styles.progressPct}>{exec.progress}%</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
