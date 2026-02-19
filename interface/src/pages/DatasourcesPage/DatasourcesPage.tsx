import { useState } from 'react';
import { MOCK_DATASOURCES } from './mockData';
import type { MockDatasource, MockTable } from './mockData';
import DatasourceList      from './DatasourceList';
import ObjectExplorer      from './ObjectExplorer';
import MainPanel           from './MainPanel';
import AddDatasourceModal  from './AddDatasourceModal';
import { QueryIcon, TableIcon, StructureIcon, ExportIcon, FolderIcon, AlertIcon, DatabaseIcon } from '../../components/Icons';
import styles              from './DatasourcesPage.module.css';

export default function DatasourcesPage() {
  const [datasources]       = useState(MOCK_DATASOURCES);
  const [selectedDs,   setSelectedDs]   = useState<MockDatasource | null>(null);
  const [selectedTable, setSelectedTable] = useState<MockTable | null>(null);
  const [showAddModal, setShowAddModal]   = useState(false);

  const handleSelectDatasource = (ds: MockDatasource) => {
    setSelectedDs(ds);
    setSelectedTable(null);
  };

  const handleSelectTable = (table: MockTable) => {
    setSelectedTable(table);
  };

  const handleSaveDs = (data: unknown) => {
    console.log('Novo datasource:', data);
  };

  return (
    <div className={styles.layout}>
      {/* ── Painel esquerdo: lista de datasources ── */}
      <div className={styles.leftPanel}>
        <DatasourceList
          datasources={datasources}
          selectedId={selectedDs?.id ?? null}
          onSelect={handleSelectDatasource}
          onAddNew={() => setShowAddModal(true)}
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
            <FolderIcon width={40} height={40} />
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
            <AlertIcon width={56} height={56} />
            <h3>Conexão indisponível</h3>
            <p>Não foi possível conectar ao banco <strong>{selectedDs.name}</strong>. Verifique as configurações e a disponibilidade do servidor.</p>
          </div>
        ) : (
          <div className={styles.rightPlaceholder}>
            <DatabaseIcon width={56} height={56} />
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

      {/* Modal de adição */}
      {showAddModal && (
        <AddDatasourceModal
          onClose={() => setShowAddModal(false)}
          onSave={handleSaveDs}
        />
      )}
    </div>
  );
}
