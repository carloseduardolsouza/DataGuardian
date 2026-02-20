import { useMemo, useState } from 'react';
import Modal from '../../components/Modal/Modal';
import { PlusIcon, TrashIcon, SpinnerIcon } from '../../components/Icons';
import { datasourceApi } from '../../services/api';
import type { ApiDatasource } from '../../services/api';
import styles from './CreateTableModal.module.css';

interface ColumnForm {
  id: string;
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  unique: boolean;
  auto_increment: boolean;
}

interface Props {
  datasource: ApiDatasource;
  initialSchemaName?: string | null;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

const DEFAULT_TYPES_BY_DS: Record<string, string[]> = {
  postgres: ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'BOOLEAN', 'TIMESTAMP', 'DATE', 'NUMERIC(10,2)'],
  mysql: ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'BOOLEAN', 'DATETIME', 'DATE', 'DECIMAL(10,2)'],
  mariadb: ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'BOOLEAN', 'DATETIME', 'DATE', 'DECIMAL(10,2)'],
};

function newColumn(seed = 0): ColumnForm {
  return {
    id: `col-${Date.now()}-${seed}`,
    name: '',
    type: 'VARCHAR(255)',
    nullable: true,
    primary_key: false,
    unique: false,
    auto_increment: false,
  };
}

export default function CreateTableModal({ datasource, initialSchemaName, onClose, onCreated }: Props) {
  const [tableName, setTableName] = useState('');
  const [schemaName, setSchemaName] = useState(initialSchemaName?.trim() || 'public');
  const [ifNotExists, setIfNotExists] = useState(true);
  const [columns, setColumns] = useState<ColumnForm[]>([newColumn(1)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeSuggestions = useMemo(
    () => DEFAULT_TYPES_BY_DS[datasource.type] ?? ['VARCHAR(255)', 'INT', 'TEXT'],
    [datasource.type],
  );

  const canSubmit = tableName.trim().length > 0
    && columns.length > 0
    && columns.every((col) => col.name.trim() && col.type.trim());

  const updateColumn = (id: string, patch: Partial<ColumnForm>) => {
    setColumns((prev) => prev.map((col) => {
      if (col.id !== id) return col;
      const next = { ...col, ...patch };
      if (patch.primary_key === true) {
        next.nullable = false;
      }
      if (patch.primary_key === true && next.unique) {
        next.unique = false;
      }
      return next;
    }));
  };

  const removeColumn = (id: string) => {
    setColumns((prev) => (prev.length > 1 ? prev.filter((col) => col.id !== id) : prev));
  };

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;

    setSaving(true);
    setError(null);

    try {
      await datasourceApi.createTable(datasource.id, {
        table_name: tableName.trim(),
        schema_name: datasource.type === 'postgres' ? schemaName.trim() : undefined,
        if_not_exists: ifNotExists,
        columns: columns.map((col) => ({
          name: col.name.trim(),
          type: col.type.trim(),
          nullable: col.nullable,
          primary_key: col.primary_key,
          unique: col.unique,
          auto_increment: col.auto_increment,
        })),
      });

      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar tabela');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>
        Cancelar
      </button>
      <button className={styles.btnPrimary} onClick={handleSubmit} disabled={!canSubmit || saving}>
        {saving ? <SpinnerIcon width={14} height={14} /> : null}
        {saving ? 'Criando...' : 'Criar tabela'}
      </button>
    </>
  );

  return (
    <Modal
      title="Criar Tabela"
      subtitle={`Datasource: ${datasource.name}`}
      onClose={onClose}
      footer={footer}
      size="lg"
    >
      <div className={styles.form}>
        <div className={styles.row2}>
          <label className={styles.field}>
            <span className={styles.label}>Nome da tabela</span>
            <input
              className={styles.input}
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="ex: customers"
              autoFocus
            />
          </label>

          {datasource.type === 'postgres' ? (
            <label className={styles.field}>
              <span className={styles.label}>Schema</span>
              <input
                className={styles.input}
                value={schemaName}
                onChange={(e) => setSchemaName(e.target.value)}
                placeholder="public"
              />
            </label>
          ) : (
            <label className={styles.toggleField}>
              <input
                type="checkbox"
                checked={ifNotExists}
                onChange={(e) => setIfNotExists(e.target.checked)}
              />
              <span>Criar com IF NOT EXISTS</span>
            </label>
          )}
        </div>

        {datasource.type === 'postgres' && (
          <label className={styles.toggleField}>
            <input
              type="checkbox"
              checked={ifNotExists}
              onChange={(e) => setIfNotExists(e.target.checked)}
            />
            <span>Criar com IF NOT EXISTS</span>
          </label>
        )}

        <div className={styles.columnsHeader}>
          <h3 className={styles.columnsTitle}>Colunas</h3>
          <button
            className={styles.addColumnBtn}
            onClick={() => setColumns((prev) => [...prev, newColumn(prev.length + 1)])}
            type="button"
          >
            <PlusIcon width={13} height={13} /> Adicionar coluna
          </button>
        </div>

        <div className={styles.columnsList}>
          {columns.map((col, index) => (
            <div key={col.id} className={styles.columnRow}>
              <div className={styles.columnMain}>
                <label className={styles.field}>
                  <span className={styles.label}>Coluna {index + 1}</span>
                  <input
                    className={styles.input}
                    value={col.name}
                    onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                    placeholder="ex: id"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Tipo</span>
                  <input
                    className={styles.input}
                    list={`type-suggestions-${datasource.id}`}
                    value={col.type}
                    onChange={(e) => updateColumn(col.id, { type: e.target.value })}
                    placeholder="VARCHAR(255)"
                  />
                </label>
              </div>

              <div className={styles.columnFlags}>
                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={col.nullable}
                    onChange={(e) => updateColumn(col.id, { nullable: e.target.checked })}
                    disabled={col.primary_key}
                  />
                  <span>Nullable</span>
                </label>
                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={col.primary_key}
                    onChange={(e) => updateColumn(col.id, { primary_key: e.target.checked })}
                  />
                  <span>PK</span>
                </label>
                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={col.unique}
                    onChange={(e) => updateColumn(col.id, { unique: e.target.checked })}
                    disabled={col.primary_key}
                  />
                  <span>Unique</span>
                </label>
                <label className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={col.auto_increment}
                    onChange={(e) => updateColumn(col.id, { auto_increment: e.target.checked })}
                  />
                  <span>Auto inc</span>
                </label>
                <button
                  className={styles.removeColumnBtn}
                  onClick={() => removeColumn(col.id)}
                  title="Remover coluna"
                  disabled={columns.length <= 1}
                  type="button"
                >
                  <TrashIcon width={12} height={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <datalist id={`type-suggestions-${datasource.id}`}>
          {typeSuggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </div>
    </Modal>
  );
}
