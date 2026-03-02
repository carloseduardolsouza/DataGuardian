import { useEffect, useMemo, useRef, useState } from 'react';
import { executionsApi } from '../../services/api';
import type { ApiExecution, ApiExecutionLogEntry } from '../../services/api';
import {
  CloseIcon, CopyIcon, CheckIcon, AlertIcon,
  SearchIcon, ChevronUpIcon, ChevronDownIcon,
} from '../../ui/icons/Icons';
import { LEVEL_LABELS, EXEC_STATUS_LABELS } from '../../constants';
import ConfirmDialog from '../../ui/dialogs/ConfirmDialog/ConfirmDialog';
import { useCriticalAction } from '../../hooks/useCriticalAction';
import styles from './LogModal.module.css';

interface Props {
  executionId: string;
  isAdmin?: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

type LevelFilter = 'all' | ApiExecutionLogEntry['level'];

const LEVEL_ORDER: ApiExecutionLogEntry['level'][] = ['error', 'warn', 'info', 'success', 'debug'];

function formatDateTime(iso: string | null) {
  if (!iso) return 'â€”';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(secs: number | null) {
  if (secs === null) return 'â€”';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function formatBytes(value: number | string | null) {
  if (value === null) return 'â€”';
  const bytes = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return 'â€”';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const amount = bytes / 1024 ** index;
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function LogModal({ executionId, isAdmin = false, onClose, onChanged }: Props) {
  const criticalAction = useCriticalAction({ isAdmin });
  const [execution, setExecution] = useState<ApiExecution | null>(null);
  const [logs, setLogs] = useState<ApiExecutionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<'cancel' | 'delete' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [exec, logsRes] = await Promise.all([
        executionsApi.getById(executionId),
        executionsApi.logs(executionId),
      ]);
      setExecution(exec);
      setLogs(logsRes.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar execução e logs');
    } finally {
      setLoading(false);
    }
  }

  async function refreshLive() {
    try {
      const [exec, logsRes] = await Promise.all([
        executionsApi.getById(executionId),
        executionsApi.logs(executionId),
      ]);
      setExecution(exec);
      setLogs(logsRes.logs ?? []);
    } catch {
      // evita quebrar o modal por falha temporaria de polling
    }
  }

  useEffect(() => {
    void load();
  }, [executionId]);

  useEffect(() => {
    if (!execution || (execution.status !== 'running' && execution.status !== 'queued')) return;
    const timer = setInterval(() => {
      void refreshLive();
    }, 1000);
    return () => clearInterval(timer);
  }, [execution, executionId]);

  const filtered = useMemo(() => {
    return logs.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      if (search && !entry.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, levelFilter, search]);

  const levelCounts = useMemo(() => logs.reduce<Partial<Record<ApiExecutionLogEntry['level'], number>>>((acc, entry) => {
    acc[entry.level] = (acc[entry.level] ?? 0) + 1;
    return acc;
  }, {}), [logs]);

  async function handleCopy() {
    const text = logs
      .map((entry) => `[${entry.ts}] [${entry.level.toUpperCase().padEnd(7)}] ${entry.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleCancel() {
    if (!execution || (execution.status !== 'queued' && execution.status !== 'running')) return;
    try {
      setActing('cancel');
      await executionsApi.cancel(execution.id);
      await onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar execução');
    } finally {
      setActing(null);
    }
  }

  async function handleDelete() {
    if (!execution) return;
    try {
      setActing('delete');
      const done = await criticalAction.run({
        action: 'execution.delete',
        actionLabel: 'Excluir execução',
        resourceType: 'execution',
        resourceId: execution.id,
        onApprovalModalClose: () => setShowDeleteConfirm(false),
        execute: (auth) => executionsApi.remove(execution.id, auth),
      });
      if (!done) return;
      await onChanged();
      setShowDeleteConfirm(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover execução');
      setActing(null);
    }
  }

  function scrollToBottom() {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }

  function scrollToTop() {
    if (logRef.current) logRef.current.scrollTop = 0;
  }

  return (
    <div className={styles.overlay} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.execId}>{execution?.id ?? executionId}</div>
            <h2 className={styles.title}>{execution?.job?.name ?? 'Execução'}</h2>
            <div className={styles.meta}>
              <span className={`${styles.statusPill} ${styles[execution?.status ?? 'queued']}`}>
                {execution ? EXEC_STATUS_LABELS[execution.status] : 'Carregando'}
              </span>
              {execution?.datasource?.name && <span className={styles.metaItem}>{execution.datasource.name}</span>}
              <span className={styles.metaDot}>Â·</span>
              <span className={styles.metaItem}>{formatDateTime(execution?.started_at ?? null)}</span>
              <span className={styles.metaDot}>Â·</span>
              <span className={styles.metaItem}>{formatDuration(execution?.duration_seconds ?? null)}</span>
              <span className={styles.metaDot}>Â·</span>
              <span className={styles.metaItem}>{formatBytes(execution?.compressed_size_bytes ?? execution?.size_bytes ?? null)}</span>
            </div>
          </div>

          <div className={styles.headerRight}>
            <button className={styles.copyBtn} onClick={() => void handleCopy()} disabled={logs.length === 0}>
              {copied ? <><CheckIcon /> Copiado</> : <><CopyIcon /> Copiar logs</>}
            </button>
            {execution && (execution.status === 'queued' || execution.status === 'running') && (
              <button className={styles.copyBtn} onClick={() => void handleCancel()} disabled={acting !== null}>
                {acting === 'cancel' ? 'Cancelando...' : 'Cancelar'}
              </button>
            )}
            {execution && execution.status !== 'queued' && execution.status !== 'running' && (
              <button className={styles.copyBtn} onClick={() => setShowDeleteConfirm(true)} disabled={acting !== null}>
                {acting === 'delete' ? 'Removendo...' : 'Remover'}
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
          </div>
        </div>

        {error && (
          <div className={styles.errorBanner}>
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        {execution?.error_message && (
          <div className={styles.errorBanner}>
            <AlertIcon />
            <span>{execution.error_message}</span>
          </div>
        )}

        <div className={styles.logToolbar}>
          <div className={styles.levelFilters}>
            <button
              className={`${styles.levelBtn} ${levelFilter === 'all' ? styles.levelBtnActive : ''}`}
              onClick={() => setLevelFilter('all')}
            >
              Todos <span className={styles.levelCount}>{logs.length}</span>
            </button>
            {LEVEL_ORDER.filter((level) => (levelCounts[level] ?? 0) > 0).map((level) => (
              <button
                key={level}
                className={`${styles.levelBtn} ${styles[`level_${level}`]} ${levelFilter === level ? styles.levelBtnActive : ''}`}
                onClick={() => setLevelFilter(level)}
              >
                {LEVEL_LABELS[level]}
                <span className={styles.levelCount}>{levelCounts[level]}</span>
              </button>
            ))}
          </div>

          <div className={styles.searchWrap}>
            <SearchIcon className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Filtrar mensagens..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button className={styles.clearSearch} onClick={() => setSearch('')}><CloseIcon /></button>
            )}
          </div>

          <div className={styles.scrollBtns}>
            <button className={styles.scrollBtn} onClick={scrollToTop}><ChevronUpIcon /></button>
            <button className={styles.scrollBtn} onClick={scrollToBottom}><ChevronDownIcon /></button>
          </div>
        </div>

        <div className={styles.logWrap} ref={logRef}>
          {loading ? (
            <div className={styles.logEmpty}>Carregando logs...</div>
          ) : filtered.length === 0 ? (
            <div className={styles.logEmpty}>Nenhuma entrada corresponde ao filtro</div>
          ) : (
            filtered.map((entry, index) => (
              <div key={`${entry.ts}-${index}`} className={`${styles.logLine} ${styles[`ll_${entry.level}`]}`}>
                <span className={styles.logTs}>
                  {new Date(entry.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className={`${styles.logLevel} ${styles[`lb_${entry.level}`]}`}>
                  {LEVEL_LABELS[entry.level]}
                </span>
                <span className={styles.logMsg}>{entry.message}</span>
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerInfo}>{filtered.length} de {logs.length} entradas</span>
          {execution?.status === 'running' && (
            <span className={styles.liveIndicator}><span className={styles.liveDot} /> Atualizando em tempo real</span>
          )}
          <button className={styles.closeFooterBtn} onClick={onClose}>Fechar</button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Confirmar exclusao de execucao"
        message="Deseja remover esta execucao?"
        confirmLabel="Excluir execucao"
        loading={acting === 'delete'}
        onClose={() => {
          if (acting !== 'delete') setShowDeleteConfirm(false);
        }}
        onConfirm={() => void handleDelete()}
      />
      {criticalAction.modal}
    </div>
  );
}




