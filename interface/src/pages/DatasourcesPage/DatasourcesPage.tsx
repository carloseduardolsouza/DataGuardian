import { useState } from 'react';
import { MOCK_DATASOURCES } from './mockData';
import type { MockDatasource, MockTable } from './mockData';
import DatasourceList  from './DatasourceList';
import ObjectExplorer  from './ObjectExplorer';
import MainPanel       from './MainPanel';
import styles          from './DatasourcesPage.module.css';

export default function DatasourcesPage() {
  const [datasources]       = useState(MOCK_DATASOURCES);
  const [selectedDs,   setSelectedDs]   = useState<MockDatasource | null>(null);
  const [selectedTable, setSelectedTable] = useState<MockTable | null>(null);

  const handleSelectDatasource = (ds: MockDatasource) => {
    setSelectedDs(ds);
    setSelectedTable(null);
  };

  const handleSelectTable = (table: MockTable) => {
    setSelectedTable(table);
  };

  return (
    <div className={styles.layout}>
      {/* ── Painel esquerdo: lista de datasources ── */}
      <div className={styles.leftPanel}>
        <DatasourceList
          datasources={datasources}
          selectedId={selectedDs?.id ?? null}
          onSelect={handleSelectDatasource}
        />
      </div>

      {/* ── Painel central: object explorer ────────── */}
      <div className={styles.middlePanel}>
        {selectedDs ? (
          <ObjectExplorer
            datasource={selectedDs}
            selectedTable={selectedTable}
            onSelectTable={handleSelectTable}
          />
        ) : (
          <div className={styles.explorerPlaceholder}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            <p>Nenhum datasource selecionado</p>
            <span>Clique em um banco para explorar</span>
          </div>
        )}
      </div>

      {/* ── Painel direito: query + data ─────────── */}
      <div className={styles.rightPanel}>
        {selectedDs && (selectedDs.status !== 'critical') ? (
          <MainPanel
            key={`${selectedDs.id}-${selectedTable?.name ?? 'none'}`}
            datasource={selectedDs}
            selectedTable={selectedTable}
            initialTab={selectedTable ? 'data' : 'query'}
          />
        ) : selectedDs?.status === 'critical' ? (
          <div className={styles.rightPlaceholder}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h3>Conexão indisponível</h3>
            <p>Não foi possível conectar ao banco <strong>{selectedDs.name}</strong>. Verifique as configurações e a disponibilidade do servidor.</p>
          </div>
        ) : (
          <div className={styles.rightPlaceholder}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M3 5v4c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
              <path d="M3 9v4c0 1.66 4.03 3 9 3s9-1.34 9-3V9"/>
              <path d="M3 13v4c0 1.66 4.03 3 9 3s9-1.34 9-3v-4"/>
            </svg>
            <h3>Gerenciador de Banco de Dados</h3>
            <p>Selecione um datasource para explorar schemas, tabelas e executar queries SQL diretamente no navegador.</p>

            <div className={styles.featureGrid}>
              <div className={styles.featureItem}>
                <QueryIcon /> Editor SQL
              </div>
              <div className={styles.featureItem}>
                <TableIcon /> Visualizar dados
              </div>
              <div className={styles.featureItem}>
                <StructureIcon /> Estrutura
              </div>
              <div className={styles.featureItem}>
                <ExportIcon /> Exportar CSV
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Ícones ─────────────────────────────────────────────────── */
function QueryIcon()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>; }
function TableIcon()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>; }
function StructureIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>; }
function ExportIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>; }
