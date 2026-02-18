import { useRef, useState } from 'react';
import type { MockExecution, LogLevel } from './mockData';
import { formatDateTime, formatBytes, formatDuration } from './mockData';
import styles from './LogModal.module.css';

interface Props {
  exec:    MockExecution;
  onClose: () => void;
}

type LevelFilter = 'all' | LogLevel;

const LEVEL_ORDER: LogLevel[] = ['error', 'warn', 'info', 'success', 'debug'];

export default function LogModal({ exec, onClose }: Props) {
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [search, setSearch]           = useState('');
  const [copied, setCopied]           = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const filtered = exec.logs.filter(l => {
    if (levelFilter !== 'all' && l.level !== levelFilter) return false;
    if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCopy = async () => {
    const text = exec.logs
      .map(l => `[${l.ts}] [${l.level.toUpperCase().padEnd(7)}] ${l.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollToBottom = () => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  };

  const scrollToTop = () => {
    if (logRef.current) logRef.current.scrollTop = 0;
  };

  const levelCounts = exec.logs.reduce<Partial<Record<LogLevel, number>>>((acc, l) => {
    acc[l.level] = (acc[l.level] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        {/* ── Header ──────────────────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.execId}>{exec.id}</div>
            <h2 className={styles.title}>{exec.jobName}</h2>
            <div className={styles.meta}>
              <span className={`${styles.statusPill} ${styles[exec.status]}`}>
                {STATUS_LABELS[exec.status]}
              </span>
              <span className={styles.metaItem}>{exec.datasourceName}</span>
              <span className={styles.metaDot}>·</span>
              <span className={styles.metaItem}>{formatDateTime(exec.startedAt)}</span>
              {exec.durationSeconds && (
                <>
                  <span className={styles.metaDot}>·</span>
                  <span className={styles.metaItem}>{formatDuration(exec.durationSeconds)}</span>
                </>
              )}
              {exec.sizeBytes && (
                <>
                  <span className={styles.metaDot}>·</span>
                  <span className={styles.metaItem}>{formatBytes(exec.sizeBytes)}</span>
                </>
              )}
            </div>
          </div>

          <div className={styles.headerRight}>
            <button className={styles.copyBtn} onClick={handleCopy} title="Copiar todos os logs">
              {copied ? <><CheckIcon /> Copiado!</> : <><CopyIcon /> Copiar logs</>}
            </button>
            <button className={styles.closeBtn} onClick={onClose} title="Fechar">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Mensagem de erro destacada */}
        {exec.errorMessage && (
          <div className={styles.errorBanner}>
            <AlertIcon />
            <span>{exec.errorMessage}</span>
          </div>
        )}

        {/* ── Toolbar de logs ──────────────────────────────── */}
        <div className={styles.logToolbar}>
          {/* Filtro por level */}
          <div className={styles.levelFilters}>
            <button
              className={`${styles.levelBtn} ${levelFilter === 'all' ? styles.levelBtnActive : ''}`}
              onClick={() => setLevelFilter('all')}
            >
              Todos <span className={styles.levelCount}>{exec.logs.length}</span>
            </button>
            {LEVEL_ORDER.filter(l => (levelCounts[l] ?? 0) > 0).map(l => (
              <button
                key={l}
                className={`${styles.levelBtn} ${styles[`level_${l}`]} ${levelFilter === l ? styles.levelBtnActive : ''}`}
                onClick={() => setLevelFilter(l)}
              >
                {LEVEL_LABELS[l]}
                <span className={styles.levelCount}>{levelCounts[l]}</span>
              </button>
            ))}
          </div>

          {/* Busca */}
          <div className={styles.searchWrap}>
            <SearchIcon />
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Filtrar mensagens…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.clearSearch} onClick={() => setSearch('')}>
                <CloseIcon />
              </button>
            )}
          </div>

          {/* Scroll */}
          <div className={styles.scrollBtns}>
            <button className={styles.scrollBtn} onClick={scrollToTop}    title="Ir ao início"><ChevronUpIcon /></button>
            <button className={styles.scrollBtn} onClick={scrollToBottom} title="Ir ao final"><ChevronDownIcon /></button>
          </div>
        </div>

        {/* ── Log viewer ───────────────────────────────────── */}
        <div className={styles.logWrap} ref={logRef}>
          {filtered.length === 0 ? (
            <div className={styles.logEmpty}>Nenhuma entrada corresponde ao filtro</div>
          ) : (
            filtered.map((entry, idx) => (
              <div key={idx} className={`${styles.logLine} ${styles[`ll_${entry.level}`]}`}>
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

        {/* ── Rodapé ───────────────────────────────────────── */}
        <div className={styles.footer}>
          <span className={styles.footerInfo}>
            {filtered.length} de {exec.logs.length} entradas
          </span>
          {exec.status === 'running' && (
            <span className={styles.liveIndicator}>
              <span className={styles.liveDot} /> Atualizando em tempo real
            </span>
          )}
          <button className={styles.closeFooterBtn} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/* ── Constantes ──────────────────────────────────────────────────── */
const STATUS_LABELS: Record<string, string> = {
  completed: 'Concluído', failed: 'Erro', running: 'Executando',
  cancelled: 'Cancelado', queued: 'Na fila',
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  error: 'ERROR', warn: 'WARN', info: 'INFO', success: 'OK', debug: 'DEBUG',
};

/* ── Ícones ──────────────────────────────────────────────────────── */
function CloseIcon()      { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function CopyIcon()       { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>; }
function CheckIcon()      { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function AlertIcon()      { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }
function SearchIcon()     { return <svg width="13" height="13" className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function ChevronUpIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>; }
function ChevronDownIcon(){ return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>; }
