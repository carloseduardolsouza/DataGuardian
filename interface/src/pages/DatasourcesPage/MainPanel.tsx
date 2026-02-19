import { useState, useCallback, useEffect } from 'react';
import type { ApiDatasource, ApiSchemaTable } from '../../services/api';
import { datasourceApi } from '../../services/api';
import { PlayFilledIcon, TrashIcon, ExportIcon } from '../../components/Icons';
import styles from './MainPanel.module.css';

type Tab = 'query' | 'structure';

interface QueryResult {
  columns:       string[];
  rows:          Record<string, unknown>[];
  rowCount:      number;
  executionTime: number;
  message?:      string;
}

interface Props {
  datasource:    ApiDatasource;
  selectedTable: ApiSchemaTable | null;
}

export default function MainPanel({ datasource, selectedTable }: Props) {
  const [activeTab,   setActiveTab]   = useState<Tab>('query');
  const [sql,         setSql]         = useState('');
  const [result,      setResult]      = useState<QueryResult | null>(null);
  const [queryError,  setQueryError]  = useState<string | null>(null);
  const [running,     setRunning]     = useState(false);
  const [history,     setHistory]     = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // When a table is selected, update the suggested query
  useEffect(() => {
    if (selectedTable) {
      setSql(`SELECT * FROM ${selectedTable.name} LIMIT 50;`);
      setResult(null);
      setQueryError(null);
    }
  }, [selectedTable?.name]);

  const handleRun = useCallback(async () => {
    if (!sql.trim() || running) return;
    setRunning(true);
    setResult(null);
    setQueryError(null);

    try {
      const res = await datasourceApi.query(datasource.id, sql.trim());
      setResult(res);
      setHistory((h) => [sql.trim(), ...h.filter((q) => q !== sql.trim())].slice(0, 20));
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Erro ao executar query');
    } finally {
      setRunning(false);
    }
  }, [sql, running, datasource.id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRun();
    }
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

  const tabs: Tab[] = ['query', 'structure'];
  const tabLabels: Record<Tab, string> = { query: 'Query', structure: 'Estrutura' };

  return (
    <div className={styles.panel}>
      {/* Tab bar */}
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`${styles.tab}${activeTab === tab ? ` ${styles.active}` : ''}`}
              onClick={() => setActiveTab(tab)}
              disabled={tab === 'structure' && !selectedTable}
              title={tab === 'structure' && !selectedTable ? 'Selecione uma tabela primeiro' : undefined}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        <div className={styles.toolbarActions}>
          {activeTab === 'query' && (
            <>
              <button className={styles.actionBtn} onClick={() => { setSql(''); setResult(null); setQueryError(null); }}>
                <TrashIcon /> Limpar
              </button>
              <button className={styles.actionBtn} onClick={() => setShowHistory((h) => !h)} title="Histórico de queries">
                <HistoryIcon />
              </button>
              {result && result.columns.length > 0 && (
                <button className={styles.actionBtn} onClick={() => exportCSV(result!)} title="Exportar CSV">
                  <ExportIcon /> CSV
                </button>
              )}
              <button
                className={`${styles.actionBtn} ${styles.primary}`}
                onClick={handleRun}
                disabled={running || !sql.trim()}
              >
                {running ? <span className={styles.spinner} /> : <PlayFilledIcon width={13} height={13} />}
                {running ? 'Executando...' : 'Executar'}
                {!running && <span className={styles.kbd}>⌃↵</span>}
              </button>
            </>
          )}
          {activeTab === 'structure' && selectedTable && (
            <button className={styles.actionBtn} onClick={() => exportStructureCSV(selectedTable)}>
              <ExportIcon /> Exportar
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className={styles.content}>

        {/* ── QUERY TAB ── */}
        {activeTab === 'query' && (
          <div className={styles.queryLayout}>
            {showHistory && (
              <HistoryPanel
                history={history}
                onSelect={(q) => { setSql(q); setShowHistory(false); }}
                onClose={() => setShowHistory(false)}
              />
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
                    ? `Tabela: ${selectedTable.name} — ${selectedTable.columns.length} colunas`
                    : `Datasource: ${datasource.name}`}
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

              {!running && !result && !queryError && (
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

              {!running && queryError && (
                <div className={styles.errorState}>
                  <div className={styles.errorBanner}>ERROR: {queryError}</div>
                </div>
              )}

              {!running && result && result.columns.length === 0 && (
                <div className={styles.results} style={{ padding: 'var(--space-4)' }}>
                  <div className={styles.successBanner}>
                    {result.message ?? 'Query executada com sucesso.'} — {result.executionTime}ms
                  </div>
                </div>
              )}

              {!running && result && result.columns.length > 0 && (
                <>
                  <div className={styles.resultsToolbar}>
                    <div className={styles.resultsMeta}>
                      <span><strong>{result.rowCount}</strong> {result.rowCount === 1 ? 'linha' : 'linhas'}</span>
                      <span>Tempo: <strong>{result.executionTime}ms</strong></span>
                    </div>
                    <button className={styles.actionBtn} onClick={() => exportCSV(result!)}>
                      <ExportIcon /> Exportar CSV
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
                      {col.primaryKey  && <span className={`${styles.badge} ${styles.pk}`}>PK</span>}
                      {col.foreignKey  && <span className={`${styles.badge} ${styles.fk}`}>FK</span>}
                      {col.unique && !col.primaryKey && <span className={`${styles.badge} ${styles.uq}`}>UQ</span>}
                    </td>
                    <td>
                      {col.defaultValue
                        ? <span className={styles.defaultVal}>{col.defaultValue}</span>
                        : <span className={styles.nullVal}>—</span>}
                    </td>
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

/* ── Internal components ─────────────────────────────────────── */

function ResultTable({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  const renderCell = (val: unknown) => {
    if (val === null || val === undefined) return <span className={styles.nullVal}>NULL</span>;
    if (val === true)  return <span className={styles.boolTrue}>true</span>;
    if (val === false) return <span className={styles.boolFalse}>false</span>;
    if (typeof val === 'number') return <span className={styles.numVal}>{val}</span>;
    return <span>{String(val)}</span>;
  };

  return (
    <table className={styles.table}>
      <thead>
        <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => <td key={c}>{renderCell(row[c])}</td>)}
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
              padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: '12px',
              color: 'var(--color-text)', marginBottom: 'var(--space-1)',
              background: 'var(--color-bg)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}
          >{q}</div>
        ))}
      </div>
    </div>
  );
}

/* ── Utilities ───────────────────────────────────────────────── */

function exportCSV(result: QueryResult) {
  if (!result.columns.length) return;
  const header = result.columns.join(',');
  const body   = result.rows.map((r) =>
    result.columns.map((c) => {
      const v = r[c];
      if (v === null || v === undefined) return '';
      if (typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n')))
        return `"${v.replace(/"/g, '""')}"`;
      return String(v);
    }).join(','),
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'query_result.csv'; a.click();
  URL.revokeObjectURL(url);
}

function exportStructureCSV(table: ApiSchemaTable) {
  const header = 'coluna,tipo,nullable,pk,fk,uq,padrao';
  const body   = table.columns.map((c) =>
    [c.name, c.type, c.nullable ? 'YES' : 'NO', c.primaryKey ? 'PK' : '', c.foreignKey ? 'FK' : '', c.unique && !c.primaryKey ? 'UQ' : '', c.defaultValue ?? ''].join(','),
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${table.name}_structure.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ── Icons ───────────────────────────────────────────────────── */
function HistoryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
      <polyline points="12 7 12 12 15 15"/>
    </svg>
  );
}
