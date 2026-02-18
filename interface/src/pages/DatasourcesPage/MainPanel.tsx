import { useState, useCallback } from 'react';
import type { MockDatasource, MockTable, QueryResult } from './mockData';
import { runMockQuery } from './mockData';
import styles from './MainPanel.module.css';

type Tab = 'query' | 'data' | 'structure' | 'indexes';

interface Props {
  datasource:    MockDatasource;
  selectedTable: MockTable | null;
  initialTab?:   Tab;
}

const PAGE_SIZE = 50;

export default function MainPanel({ datasource, selectedTable, initialTab = 'query' }: Props) {
  const [activeTab,   setActiveTab]   = useState<Tab>(initialTab);
  const [sql,         setSql]         = useState('SELECT * FROM ' + (selectedTable?.name ?? 'users') + ' LIMIT 50;');
  const [result,      setResult]      = useState<QueryResult | null>(null);
  const [running,     setRunning]     = useState(false);
  const [dataPage,    setDataPage]    = useState(0);
  const [history,     setHistory]     = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const handleRun = useCallback(async () => {
    if (!sql.trim() || running) return;
    setRunning(true);
    setResult(null);

    await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));

    const res = runMockQuery(sql, datasource);
    setResult(res);
    setRunning(false);
    if (!res.error) {
      setHistory((h) => [sql, ...h.filter((q) => q !== sql)].slice(0, 20));
    }
  }, [sql, running, datasource]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRun();
    }
    // Tab = 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const el    = e.currentTarget;
      const start = el.selectionStart;
      const end   = el.selectionEnd;
      const next  = sql.slice(0, start) + '  ' + sql.slice(end);
      setSql(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
    }
  };

  // Quando troca de tabela, sugere query
  if (selectedTable && !sql.includes(selectedTable.name)) {
    setSql(`SELECT * FROM ${selectedTable.name} LIMIT 50;`);
    setResult(null);
  }

  const tableData = selectedTable?.rows ?? [];
  const totalPages = Math.ceil(tableData.length / PAGE_SIZE);
  const pageData   = tableData.slice(dataPage * PAGE_SIZE, (dataPage + 1) * PAGE_SIZE);

  return (
    <div className={styles.panel}>
      {/* Tab bar */}
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {(['query', 'data', 'structure', 'indexes'] as Tab[]).map((tab) => {
            const labels: Record<Tab, string> = { query: 'Query', data: 'Dados', structure: 'Estrutura', indexes: 'Índices' };
            const disabled = tab !== 'query' && !selectedTable;
            return (
              <button
                key={tab}
                className={`${styles.tab}${activeTab === tab ? ` ${styles.active}` : ''}`}
                onClick={() => !disabled && setActiveTab(tab)}
                disabled={disabled}
                title={disabled ? 'Selecione uma tabela primeiro' : undefined}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        <div className={styles.toolbarActions}>
          {activeTab === 'query' && (
            <>
              <button className={styles.actionBtn} onClick={() => { setSql(''); setResult(null); }}>
                <TrashIcon /> Limpar
              </button>
              <button className={styles.actionBtn} onClick={() => setShowHistory((h) => !h)} title="Histórico de queries">
                <HistoryIcon />
              </button>
              {result && !result.error && (
                <button className={styles.actionBtn} onClick={() => exportCSV(result)} title="Exportar CSV">
                  <DownloadIcon /> CSV
                </button>
              )}
              <button
                className={`${styles.actionBtn} ${styles.primary}`}
                onClick={handleRun}
                disabled={running || !sql.trim()}
              >
                {running ? <span className={styles.spinner} /> : <PlayIcon />}
                {running ? 'Executando...' : 'Executar'}
                {!running && <span className={styles.kbd}>⌃↵</span>}
              </button>
            </>
          )}
          {(activeTab === 'data' || activeTab === 'structure') && selectedTable && (
            <button className={styles.actionBtn} onClick={() => exportCSV({ columns: selectedTable.columns.map(c => c.name), rows: selectedTable.rows, rowCount: selectedTable.rows.length, executionTime: '' })}>
              <DownloadIcon /> Exportar
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className={styles.content}>

        {/* ── QUERY TAB ── */}
        {activeTab === 'query' && (
          <div className={styles.queryLayout}>
            {/* History overlay */}
            {showHistory && (
              <HistoryPanel history={history} onSelect={(q) => { setSql(q); setShowHistory(false); }} onClose={() => setShowHistory(false)} />
            )}

            <div className={styles.editorWrap}>
              <textarea
                className={styles.editor}
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="SELECT * FROM users LIMIT 10;"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <div className={styles.editorFooter}>
                <span className={styles.editorHint}>
                  {selectedTable
                    ? `Tabela selecionada: ${selectedTable.name} (${selectedTable.rowCount.toLocaleString()} linhas)`
                    : `Conectado a: ${datasource.database}`}
                </span>
                <span className={styles.editorHint}>Ctrl+Enter para executar</span>
              </div>
            </div>

            <div className={styles.results}>
              {running && (
                <div className={styles.loading}>
                  <span className={styles.spinner} />
                  Executando query...
                </div>
              )}

              {!running && !result && (
                <div className={styles.emptyState}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  <p>Nenhuma query executada</p>
                  <span>Escreva uma query SQL e pressione <strong>Ctrl+Enter</strong></span>
                </div>
              )}

              {!running && result?.error && (
                <div className={styles.errorState}>
                  <div className={styles.errorBanner}>
                    ERROR: {result.error}
                  </div>
                </div>
              )}

              {!running && result && !result.error && result.columns.length === 0 && (
                <div className={styles.results} style={{ padding: 'var(--space-4)' }}>
                  <div className={styles.successBanner}>
                    {result.message ?? 'Query executada com sucesso.'} — {result.executionTime}
                  </div>
                </div>
              )}

              {!running && result && !result.error && result.columns.length > 0 && (
                <>
                  <div className={styles.resultsToolbar}>
                    <div className={styles.resultsMeta}>
                      <span><strong>{result.rowCount}</strong> {result.rowCount === 1 ? 'linha' : 'linhas'}</span>
                      <span>Tempo: <strong>{result.executionTime}</strong></span>
                    </div>
                    <button className={styles.actionBtn} onClick={() => exportCSV(result)}>
                      <DownloadIcon /> Exportar CSV
                    </button>
                  </div>
                  <div className={styles.tableWrap}>
                    <ResultTable columns={result.columns} rows={result.rows} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── DATA TAB ── */}
        {activeTab === 'data' && selectedTable && (
          <div className={styles.queryLayout}>
            <div className={styles.resultsToolbar}>
              <div className={styles.resultsMeta}>
                <span>Tabela: <strong>{selectedTable.name}</strong></span>
                <span><strong>{selectedTable.rowCount.toLocaleString()}</strong> linhas totais</span>
                <span>Tamanho: <strong>{selectedTable.size}</strong></span>
              </div>
            </div>
            <div className={styles.tableWrap} style={{ flex: 1 }}>
              <ResultTable
                columns={selectedTable.columns.map((c) => c.name)}
                rows={pageData}
                showRowNums
              />
            </div>
            <div className={styles.pagination}>
              <span className={styles.paginationInfo}>
                Mostrando {dataPage * PAGE_SIZE + 1}–{Math.min((dataPage + 1) * PAGE_SIZE, tableData.length)} de {tableData.length} (mock)
              </span>
              <div className={styles.paginationBtns}>
                <button className={styles.pageBtn} disabled={dataPage === 0} onClick={() => setDataPage(0)}>«</button>
                <button className={styles.pageBtn} disabled={dataPage === 0} onClick={() => setDataPage((p) => p - 1)}>‹</button>
                <span className={styles.paginationInfo}>{dataPage + 1} / {Math.max(1, totalPages)}</span>
                <button className={styles.pageBtn} disabled={dataPage >= totalPages - 1} onClick={() => setDataPage((p) => p + 1)}>›</button>
                <button className={styles.pageBtn} disabled={dataPage >= totalPages - 1} onClick={() => setDataPage(totalPages - 1)}>»</button>
              </div>
            </div>
          </div>
        )}

        {/* ── STRUCTURE TAB ── */}
        {activeTab === 'structure' && selectedTable && (
          <div className={styles.tableWrap}>
            <table className={styles.structureTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Coluna</th>
                  <th>Tipo</th>
                  <th>Nullable</th>
                  <th>Chaves</th>
                  <th>Padrão</th>
                </tr>
              </thead>
              <tbody>
                {selectedTable.columns.map((col, i) => (
                  <tr key={col.name}>
                    <td style={{ color: 'var(--color-text-subtle)', fontSize: '11px' }}>{i + 1}</td>
                    <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{col.name}</td>
                    <td><span className={styles.typePill}>{col.type}</span></td>
                    <td className={styles.nullable}>{col.nullable ? 'YES' : 'NO'}</td>
                    <td>
                      {col.primaryKey && <span className={`${styles.badge} ${styles.pk}`}>PK</span>}
                      {col.foreignKey && <span className={`${styles.badge} ${styles.fk}`} title={col.foreignKey}>FK</span>}
                      {col.unique && !col.primaryKey && <span className={`${styles.badge} ${styles.uq}`}>UQ</span>}
                    </td>
                    <td>{col.defaultValue ? <span className={styles.defaultVal}>{col.defaultValue}</span> : <span className={styles.nullVal}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── INDEXES TAB ── */}
        {activeTab === 'indexes' && selectedTable && (
          <div className={styles.tableWrap}>
            <table className={styles.structureTable}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Colunas</th>
                  <th>Único</th>
                  <th>Primário</th>
                  <th>Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {selectedTable.indexes.map((idx) => (
                  <tr key={idx.name}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{idx.name}</td>
                    <td><span className={styles.typePill}>{idx.type}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{idx.columns.join(', ')}</td>
                    <td>{idx.unique ? <Check /> : <Dash />}</td>
                    <td>{idx.primary ? <Check /> : <Dash />}</td>
                    <td className={styles.nullable}>{idx.size ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}

/* ── Componentes internos ───────────────────────────────────── */

function ResultTable({ columns, rows, showRowNums = false }: { columns: string[]; rows: Record<string, string | number | boolean | null>[]; showRowNums?: boolean }) {
  const renderCell = (val: string | number | boolean | null) => {
    if (val === null)     return <span className={styles.nullVal}>NULL</span>;
    if (val === true)     return <span className={styles.boolTrue}>true</span>;
    if (val === false)    return <span className={styles.boolFalse}>false</span>;
    if (typeof val === 'number') return <span className={styles.numVal}>{val}</span>;
    return <span>{String(val)}</span>;
  };

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {showRowNums && <th className={styles.rowNum}>#</th>}
          {columns.map((c) => <th key={c}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {showRowNums && <td className={styles.rowNum}>{i + 1}</td>}
            {columns.map((c) => <td key={c}>{renderCell(row[c] ?? null)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HistoryPanel({ history, onSelect, onClose }: { history: string[]; onSelect: (q: string) => void; onClose: () => void }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Histórico de Queries</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '18px' }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {history.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>Nenhuma query no histórico</p>
        )}
        {history.map((q, i) => (
          <div
            key={i}
            onClick={() => onSelect(q)}
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: 'var(--color-text)',
              marginBottom: 'var(--space-1)',
              background: 'var(--color-bg)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >{q}</div>
        ))}
      </div>
    </div>
  );
}

/* ── Utilitário de export CSV ────────────────── */
function exportCSV(result: QueryResult) {
  if (!result.columns.length) return;
  const header = result.columns.join(',');
  const body   = result.rows.map((r) => result.columns.map((c) => {
    const v = r[c];
    if (v === null) return '';
    if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
    return String(v);
  }).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'query_result.csv'; a.click();
  URL.revokeObjectURL(url);
}

/* ── Ícones ─────────────────────────────────────────────────── */
function PlayIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>; }
function TrashIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>; }
function HistoryIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/><polyline points="12 7 12 12 15 15"/></svg>; }
function DownloadIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>; }
function Check() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function Dash() { return <span style={{ color: 'var(--color-text-subtle)', fontSize: '12px' }}>—</span>; }
