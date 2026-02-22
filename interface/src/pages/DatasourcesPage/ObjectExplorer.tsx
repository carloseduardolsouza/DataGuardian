import { useEffect, useState } from 'react';
import type { ApiDatasource, ApiSchema, ApiSchemaTable } from '../../services/api';
import { SpinnerIcon } from '../../ui/icons/Icons';
import styles from './ObjectExplorer.module.css';

interface Props {
  datasource:    ApiDatasource;
  schemas:       ApiSchema[];
  loading:       boolean;
  error:         string | null;
  selectedTable: ApiSchemaTable | null;
  onSelectTable: (table: ApiSchemaTable) => void;
  onRefresh:     () => void;
  onCreateTable?: (schemaName?: string) => void;
}

export default function ObjectExplorer({
  datasource, schemas, loading, error, selectedTable, onSelectTable, onRefresh, onCreateTable,
}: Props) {
  const [openSchemas, setOpenSchemas] = useState<Record<string, boolean>>({});
  const [openTables,  setOpenTables]  = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; schemaName?: string } | null>(null);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, []);

  const openMenu = (x: number, y: number, schemaName?: string) => {
    const menuWidth = 190;
    const menuHeight = 46;
    const nextX = Math.min(x, window.innerWidth - menuWidth - 8);
    const nextY = Math.min(y, window.innerHeight - menuHeight - 8);
    setMenu({ x: Math.max(8, nextX), y: Math.max(8, nextY), schemaName });
  };

  const toggleSchema = (name: string) =>
    setOpenSchemas((p) => ({ ...p, [name]: p[name] === false ? true : p[name] === undefined ? false : !p[name] }));

  // Default: first schema is open
  const isSchemaOpen = (name: string, idx: number) =>
    openSchemas[name] === undefined ? idx === 0 : openSchemas[name];

  const toggleTableExpand = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    setOpenTables((p) => ({ ...p, [name]: !p[name] }));
  };

  // ── Loading state ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.panel}>
        <ExplorerHeader datasource={datasource} onRefresh={onRefresh} />
        <div className={styles.empty}>
          <SpinnerIcon width={24} height={24} />
          <p className={styles.emptyText}>Carregando schema...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.panel}>
        <ExplorerHeader datasource={datasource} onRefresh={onRefresh} />
        <div className={styles.empty}>
          <svg className={styles.emptyIcon} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className={styles.emptyText}>Falha ao carregar schema</p>
          <p className={styles.emptyHint}>{error}</p>
        </div>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────
  if (schemas.length === 0) {
    return (
      <div className={styles.panel}>
        <ExplorerHeader datasource={datasource} onRefresh={onRefresh} />
        <div className={styles.empty}>
          <svg className={styles.emptyIcon} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
          </svg>
          <p className={styles.emptyText}>Nenhum schema encontrado</p>
          <p className={styles.emptyHint}>Status: {datasource.status}</p>
        </div>
      </div>
    );
  }

  // ── Tree ─────────────────────────────────────────────────────────
  return (
    <div className={styles.panel}>
      <ExplorerHeader datasource={datasource} onRefresh={onRefresh} />
      <div className={styles.tree}>
        {schemas.map((schema, idx) => (
          <div key={schema.name}>
            {/* Schema header */}
            <div
              className={styles.schemaRow}
              onClick={() => toggleSchema(schema.name)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openMenu(e.clientX, e.clientY, schema.name);
              }}
            >
              <svg
                className={`${styles.chevron}${isSchemaOpen(schema.name, idx) ? ` ${styles.open}` : ''}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <SchemaIcon />
              {schema.name}
            </div>

            {/* Tables */}
            {isSchemaOpen(schema.name, idx) && schema.tables.map((table) => (
              <div key={table.name}>
                <button
                  className={`${styles.tableRow}${selectedTable?.name === table.name ? ` ${styles.active}` : ''}`}
                  onClick={() => onSelectTable(table)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openMenu(e.clientX, e.clientY, schema.name);
                  }}
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
                  <span className={styles.tableRowCount}>{table.columns.length}c</span>
                </button>

                {/* Columns */}
                {openTables[table.name] && (
                  <div className={styles.columnsWrap}>
                    {table.columns.map((col) => (
                      <div key={col.name} className={styles.columnRow}>
                        <ColumnIcon className={styles.colIcon} />
                        <span className={styles.colName}>{col.name}</span>
                        {col.primaryKey  && <span className={`${styles.colBadge} ${styles.pk}`}>PK</span>}
                        {col.foreignKey  && <span className={`${styles.colBadge} ${styles.fk}`}>FK</span>}
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

      {menu && (
        <div
          className={styles.contextMenu}
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.contextAction}
            onClick={() => {
              onCreateTable?.(menu.schemaName);
              setMenu(null);
            }}
            disabled={!onCreateTable}
          >
            Criar tabela
          </button>
        </div>
      )}
    </div>
  );
}

function ExplorerHeader({ datasource, onRefresh }: { datasource: ApiDatasource; onRefresh: () => void }) {
  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.title}>Explorer</span>
        <span className={styles.dbName}>{datasource.name}</span>
      </div>
      <button className={styles.refreshBtn} title="Atualizar schema" onClick={onRefresh}>
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


