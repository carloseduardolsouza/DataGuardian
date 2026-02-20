import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ApiDatasource, ApiSchemaTable } from '../../services/api';
import { datasourceApi } from '../../services/api';
import Modal from '../../components/Modal/Modal';
import { PlayFilledIcon, TrashIcon, ExportIcon } from '../../components/Icons';
import styles from './MainPanel.module.css';

type Tab = 'query' | 'structure';

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  message?: string;
}

interface Props {
  datasource: ApiDatasource;
  selectedTable: ApiSchemaTable | null;
}

function quoteIdentifier(identifier: string, datasourceType: ApiDatasource['type']) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Identificador invalido: ${identifier}`);
  }

  if (datasourceType === 'postgres') {
    return `"${identifier}"`;
  }

  return `\`${identifier}\``;
}

function parseUserValue(raw: string, originalValue?: unknown): unknown {
  const trimmed = raw.trim();

  if (/^null$/i.test(trimmed)) return null;

  if (typeof originalValue === 'number') {
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      throw new Error('Valor numerico invalido');
    }
    return parsed;
  }

  if (typeof originalValue === 'boolean') {
    if (/^(true|1)$/i.test(trimmed)) return true;
    if (/^(false|0)$/i.test(trimmed)) return false;
    throw new Error('Valor booleano invalido. Use true/false');
  }

  if (/^(true|false)$/i.test(trimmed)) {
    return /^true$/i.test(trimmed);
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return raw;
}

function toSqlValue(value: unknown, datasourceType: ApiDatasource['type']) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') {
    if (datasourceType === 'postgres') return value ? 'TRUE' : 'FALSE';
    return value ? '1' : '0';
  }
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

export default function MainPanel({ datasource, selectedTable }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('query');
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [resultMenu, setResultMenu] = useState<{ x: number; y: number } | null>(null);
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});
  const [savingInsert, setSavingInsert] = useState(false);

  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingCell, setSavingCell] = useState(false);

  const editableColumns = useMemo(() => {
    if (!selectedTable) return [] as Array<{ name: string; type: string }>;
    return selectedTable.columns.map((col) => ({ name: col.name, type: col.type }));
  }, [selectedTable]);

  const runQuery = useCallback(async (
    query: string,
    opts?: { trackHistory?: boolean; resetResult?: boolean },
  ) => {
    if (!query.trim() || running) return;

    const trackHistory = opts?.trackHistory ?? true;
    const resetResult = opts?.resetResult ?? true;

    setRunning(true);
    if (resetResult) setResult(null);
    setQueryError(null);

    try {
      const res = await datasourceApi.query(datasource.id, query.trim());
      setResult(res);
      if (trackHistory) {
        setHistory((h) => [query.trim(), ...h.filter((q) => q !== query.trim())].slice(0, 20));
      }
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Erro ao executar query');
    } finally {
      setRunning(false);
    }
  }, [datasource.id, running]);

  const refreshCurrentQuery = useCallback(async () => {
    if (!sql.trim()) return;
    await runQuery(sql.trim(), { trackHistory: false, resetResult: false });
  }, [runQuery, sql]);

  useEffect(() => {
    if (selectedTable) {
      setSql(`SELECT * FROM ${selectedTable.name} LIMIT 50;`);
      setResult(null);
      setQueryError(null);
      setEditingCell(null);
    }
  }, [selectedTable?.name]);

  useEffect(() => {
    const closeMenu = () => setResultMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, []);

  const handleRun = useCallback(async () => {
    await runQuery(sql.trim(), { trackHistory: true, resetResult: true });
  }, [runQuery, sql]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleRun();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = sql.slice(0, start) + '  ' + sql.slice(end);
      setSql(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
    }
  };

  const openInsertModal = () => {
    if (!selectedTable) {
      setQueryError('Selecione uma tabela no Explorer para inserir valores.');
      return;
    }

    const draft: Record<string, string> = {};
    for (const col of selectedTable.columns) {
      draft[col.name] = '';
    }
    setInsertValues(draft);
    setShowInsertModal(true);
  };

  const handleInsert = async () => {
    if (!selectedTable || savingInsert) return;

    setSavingInsert(true);
    setQueryError(null);

    try {
      const quotedTable = quoteIdentifier(selectedTable.name, datasource.type);
      const entries = Object.entries(insertValues).filter(([, value]) => value.trim() !== '');

      let statement = '';
      if (entries.length === 0) {
        statement = datasource.type === 'postgres'
          ? `INSERT INTO ${quotedTable} DEFAULT VALUES;`
          : `INSERT INTO ${quotedTable} () VALUES ();`;
      } else {
        const columns = entries.map(([name]) => quoteIdentifier(name, datasource.type));
        const values = entries.map(([, value]) => toSqlValue(parseUserValue(value), datasource.type));
        statement = `INSERT INTO ${quotedTable} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
      }

      await datasourceApi.query(datasource.id, statement);
      setShowInsertModal(false);
      await refreshCurrentQuery();
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Erro ao inserir valor');
    } finally {
      setSavingInsert(false);
    }
  };

  const startCellEdit = (rowIndex: number, column: string, value: unknown) => {
    if (value === null || value === undefined || String(value).length === 0) return;
    if (!selectedTable) {
      setQueryError('Selecione uma tabela no Explorer para editar valores.');
      return;
    }

    setEditingCell({ rowIndex, column });
    setEditingValue(String(value));
  };

  const saveCellEdit = useCallback(async () => {
    if (!editingCell || !result || !selectedTable || savingCell) return;

    const row = result.rows[editingCell.rowIndex];
    if (!row) return;

    const pkColumns = selectedTable.columns.filter((c) => c.primaryKey).map((c) => c.name);
    if (pkColumns.length === 0) {
      setQueryError('Nao foi possivel atualizar: a tabela nao possui chave primaria.');
      setEditingCell(null);
      return;
    }

    try {
      setSavingCell(true);
      const quotedTable = quoteIdentifier(selectedTable.name, datasource.type);
      const quotedColumn = quoteIdentifier(editingCell.column, datasource.type);
      const originalValue = row[editingCell.column];
      const parsedEditValue = parseUserValue(editingValue, originalValue);

      const whereParts = pkColumns.map((pk) => {
        const pkValue = row[pk];
        if (pkValue === null || pkValue === undefined) {
          throw new Error(`Chave primaria '${pk}' sem valor na linha selecionada.`);
        }
        return `${quoteIdentifier(pk, datasource.type)} = ${toSqlValue(pkValue, datasource.type)}`;
      });

      const statement = `UPDATE ${quotedTable} SET ${quotedColumn} = ${toSqlValue(parsedEditValue, datasource.type)} WHERE ${whereParts.join(' AND ')};`;
      await datasourceApi.query(datasource.id, statement);

      setEditingCell(null);
      setEditingValue('');
      await refreshCurrentQuery();
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Erro ao atualizar valor');
    } finally {
      setSavingCell(false);
    }
  }, [editingCell, editingValue, datasource.id, datasource.type, refreshCurrentQuery, result, savingCell, selectedTable]);

  const tabs: Tab[] = ['query', 'structure'];
  const tabLabels: Record<Tab, string> = { query: 'Query', structure: 'Estrutura' };

  return (
    <div className={styles.panel}>
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
              <button className={styles.actionBtn} onClick={() => setShowHistory((h) => !h)} title="Historico de queries">
                <HistoryIcon />
              </button>
              {result && result.columns.length > 0 && (
                <button className={styles.actionBtn} onClick={() => exportCSV(result)} title="Exportar CSV">
                  <ExportIcon /> CSV
                </button>
              )}
              <button
                className={`${styles.actionBtn} ${styles.primary}`}
                onClick={() => void handleRun()}
                disabled={running || !sql.trim()}
              >
                {running ? <span className={styles.spinner} /> : <PlayFilledIcon width={13} height={13} />}
                {running ? 'Executando...' : 'Executar'}
                {!running && <span className={styles.kbd}>^?</span>}
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

      <div className={styles.content}>
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
                    ? `Tabela: ${selectedTable.name} - ${selectedTable.columns.length} colunas`
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
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="9" y1="15" x2="15" y2="15" />
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
                    {result.message ?? 'Query executada com sucesso.'} - {result.executionTime}ms
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
                    <button className={styles.actionBtn} onClick={() => exportCSV(result)}>
                      <ExportIcon /> Exportar CSV
                    </button>
                  </div>
                  <div
                    className={styles.tableWrap}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const x = Math.min(e.clientX, window.innerWidth - 190);
                      const y = Math.min(e.clientY, window.innerHeight - 64);
                      setResultMenu({ x, y });
                    }}
                  >
                    <ResultTable
                      columns={result.columns}
                      rows={result.rows}
                      editingCell={editingCell}
                      editingValue={editingValue}
                      savingCell={savingCell}
                      onEditValueChange={setEditingValue}
                      onCellDoubleClick={startCellEdit}
                      onEditCommit={() => void saveCellEdit()}
                      onEditCancel={() => {
                        setEditingCell(null);
                        setEditingValue('');
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

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
                  <th>Padrao</th>
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
                      {col.foreignKey && <span className={`${styles.badge} ${styles.fk}`}>FK</span>}
                      {col.unique && !col.primaryKey && <span className={`${styles.badge} ${styles.uq}`}>UQ</span>}
                    </td>
                    <td>
                      {col.defaultValue
                        ? <span className={styles.defaultVal}>{col.defaultValue}</span>
                        : <span className={styles.nullVal}>-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resultMenu && (
        <div
          className={styles.contextMenu}
          style={{ top: resultMenu.y, left: resultMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.contextAction}
            onClick={() => {
              setResultMenu(null);
              openInsertModal();
            }}
          >
            Adicionar valor
          </button>
        </div>
      )}

      {showInsertModal && selectedTable && (
        <Modal
          title="Adicionar valor"
          subtitle={`Tabela: ${selectedTable.name}`}
          onClose={() => setShowInsertModal(false)}
          size="lg"
          footer={(
            <>
              <button className={styles.modalBtnSecondary} onClick={() => setShowInsertModal(false)} disabled={savingInsert}>
                Cancelar
              </button>
              <button className={styles.modalBtnPrimary} onClick={() => void handleInsert()} disabled={savingInsert}>
                {savingInsert ? <span className={styles.spinner} /> : null}
                {savingInsert ? 'Salvando...' : 'Inserir'}
              </button>
            </>
          )}
        >
          <div className={styles.insertGrid}>
            {editableColumns.map((col) => (
              <label key={col.name} className={styles.insertField}>
                <span className={styles.insertLabel}>{col.name}</span>
                <span className={styles.insertHint}>{col.type}</span>
                <input
                  className={styles.insertInput}
                  value={insertValues[col.name] ?? ''}
                  onChange={(e) => setInsertValues((prev) => ({ ...prev, [col.name]: e.target.value }))}
                  placeholder="vazio => valor padrao/NULL"
                />
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

interface ResultTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  editingCell: { rowIndex: number; column: string } | null;
  editingValue: string;
  savingCell: boolean;
  onEditValueChange: (value: string) => void;
  onCellDoubleClick: (rowIndex: number, column: string, value: unknown) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
}

function ResultTable(props: ResultTableProps) {
  const {
    columns,
    rows,
    editingCell,
    editingValue,
    savingCell,
    onEditValueChange,
    onCellDoubleClick,
    onEditCommit,
    onEditCancel,
  } = props;

  const renderCell = (val: unknown) => {
    if (val === null || val === undefined) return <span className={styles.nullVal}>NULL</span>;
    if (val === true) return <span className={styles.boolTrue}>true</span>;
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
            {columns.map((c) => {
              const isEditing = editingCell?.rowIndex === i && editingCell.column === c;
              if (isEditing) {
                return (
                  <td key={c} className={styles.cellEditing}>
                    <input
                      className={styles.cellInput}
                      value={editingValue}
                      onChange={(e) => onEditValueChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          onEditCommit();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          onEditCancel();
                        }
                      }}
                      onBlur={() => {
                        if (!savingCell) onEditCommit();
                      }}
                      autoFocus
                    />
                  </td>
                );
              }

              const currentValue = row[c];
              const editable = currentValue !== null && currentValue !== undefined && String(currentValue) !== '';

              return (
                <td
                  key={c}
                  className={editable ? styles.cellEditable : ''}
                  onDoubleClick={() => editable && onCellDoubleClick(i, c, currentValue)}
                  title={editable ? 'Duplo clique para editar' : undefined}
                >
                  {renderCell(currentValue)}
                </td>
              );
            })}
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
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Historico de Queries</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '18px' }}>x</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {history.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>Nenhuma query no historico</p>
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

function exportCSV(result: QueryResult) {
  if (!result.columns.length) return;
  const header = result.columns.join(',');
  const body = result.rows.map((r) =>
    result.columns.map((c) => {
      const v = r[c];
      if (v === null || v === undefined) return '';
      if (typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return String(v);
    }).join(','),
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'query_result.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function exportStructureCSV(table: ApiSchemaTable) {
  const header = 'coluna,tipo,nullable,pk,fk,uq,padrao';
  const body = table.columns.map((c) =>
    [c.name, c.type, c.nullable ? 'YES' : 'NO', c.primaryKey ? 'PK' : '', c.foreignKey ? 'FK' : '', c.unique && !c.primaryKey ? 'UQ' : '', c.defaultValue ?? ''].join(','),
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${table.name}_structure.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function HistoryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
      <polyline points="12 7 12 12 15 15" />
    </svg>
  );
}
