import { useState } from 'react';
import type { MockDatasource, MockTable } from './mockData';
import styles from './ObjectExplorer.module.css';

interface Props {
  datasource:    MockDatasource;
  selectedTable: MockTable | null;
  onSelectTable: (table: MockTable) => void;
}

export default function ObjectExplorer({ datasource, selectedTable, onSelectTable }: Props) {
  const [openSchemas, setOpenSchemas] = useState<Record<string, boolean>>(
    Object.fromEntries(datasource.schemas.map((s) => [s.name, true])),
  );
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({});

  const toggleSchema = (name: string) =>
    setOpenSchemas((p) => ({ ...p, [name]: !p[name] }));

  const toggleTableExpand = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    setOpenTables((p) => ({ ...p, [name]: !p[name] }));
  };

  const formatCount = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  if (datasource.status === 'critical') {
    return (
      <div className={styles.panel}>
        <ExplorerHeader datasource={datasource} />
        <div className={styles.empty}>
          <svg className={styles.emptyIcon} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className={styles.emptyText}>Conexão recusada</p>
          <p className={styles.emptyHint}>Verifique se o banco está acessível</p>
        </div>
      </div>
    );
  }

  if (datasource.schemas.length === 0) {
    return (
      <div className={styles.panel}>
        <ExplorerHeader datasource={datasource} />
        <div className={styles.empty}>
          <svg className={styles.emptyIcon} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
          </svg>
          <p className={styles.emptyText}>Banco sem schemas</p>
          <p className={styles.emptyHint}>Status: {datasource.status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <ExplorerHeader datasource={datasource} />
      <div className={styles.tree}>
        {datasource.schemas.map((schema) => (
          <div key={schema.name}>
            {/* Schema header */}
            <div className={styles.schemaRow} onClick={() => toggleSchema(schema.name)}>
              <svg className={`${styles.chevron}${openSchemas[schema.name] ? ` ${styles.open}` : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <SchemaIcon />
              {schema.name}
            </div>

            {/* Tables */}
            {openSchemas[schema.name] && schema.tables.map((table) => (
              <div key={table.name}>
                <button
                  className={`${styles.tableRow}${selectedTable?.name === table.name ? ` ${styles.active}` : ''}`}
                  onClick={() => onSelectTable(table)}
                >
                  <svg
                    className={`${styles.chevron}${openTables[table.name] ? ` ${styles.open}` : ''}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                    onClick={(e) => toggleTableExpand(e, table.name)}
                  >
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <TableGridIcon className={styles.tableIcon} />
                  <span className={styles.tableName}>{table.name}</span>
                  <span className={styles.tableRowCount}>{formatCount(table.rowCount)}</span>
                </button>

                {/* Columns */}
                {openTables[table.name] && (
                  <div className={styles.columnsWrap}>
                    {table.columns.map((col) => (
                      <div key={col.name} className={styles.columnRow}>
                        <ColumnIcon className={styles.colIcon} />
                        <span className={styles.colName}>{col.name}</span>
                        {col.primaryKey && <span className={`${styles.colBadge} ${styles.pk}`}>PK</span>}
                        {col.foreignKey && <span className={`${styles.colBadge} ${styles.fk}`}>FK</span>}
                        {col.unique && !col.primaryKey && <span className={`${styles.colBadge} ${styles.uk}`}>UQ</span>}
                        <span className={styles.colType}>{col.type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExplorerHeader({ datasource }: { datasource: MockDatasource }) {
  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.title}>Explorer</span>
        <span className={styles.dbName}>{datasource.database}</span>
      </div>
      <button className={styles.refreshBtn} title="Atualizar">
        <RefreshIcon />
      </button>
    </div>
  );
}

/* ── Ícones ─────────────────────────────────────────────────── */
function SchemaIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: 'var(--color-warning)' }}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  );
}
function TableGridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9"  x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/>
      <line x1="9" y1="3"  x2="9"  y2="21"/>
    </svg>
  );
}
function ColumnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="6"  x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6"  x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
    </svg>
  );
}
