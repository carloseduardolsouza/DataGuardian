import { useState } from 'react';
import type { ApiDatasource } from '../../services/api';
import { datasourceApi } from '../../services/api';
import Modal from '../../ui/overlay/Modal/Modal';
import { SpinnerIcon } from '../../ui/icons/Icons';
import styles from './CreateFolderModal.module.css';

interface Props {
  datasource: ApiDatasource;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

export default function CreateFolderModal({ datasource, onClose, onCreated }: Props) {
  const [folderName, setFolderName] = useState('');
  const [ifNotExists, setIfNotExists] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = datasource.type === 'postgres' && folderName.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;

    setSaving(true);
    setError(null);

    try {
      await datasourceApi.createFolder(datasource.id, {
        folder_name: folderName.trim(),
        if_not_exists: ifNotExists,
      });

      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar pasta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Criar Pasta"
      subtitle={`Datasource: ${datasource.name}`}
      onClose={onClose}
      size="md"
      footer={(
        <>
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className={styles.btnPrimary} onClick={() => void handleSubmit()} disabled={!canSubmit || saving}>
            {saving ? <SpinnerIcon width={14} height={14} /> : null}
            {saving ? 'Criando...' : 'Criar pasta'}
          </button>
        </>
      )}
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>Nome da pasta/schema</span>
          <input
            className={styles.input}
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder="ex: analytics"
            autoFocus
          />
        </label>

        <label className={styles.toggleField}>
          <input
            type="checkbox"
            checked={ifNotExists}
            onChange={(event) => setIfNotExists(event.target.checked)}
          />
          <span>Criar com IF NOT EXISTS</span>
        </label>

        <p className={styles.hint}>
          Em datasources Postgres, a pasta exibida no explorer corresponde a um schema.
        </p>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
}
