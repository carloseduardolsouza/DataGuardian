import { useState } from 'react';
import { datasourceFoldersApi } from '../../services/api';
import { SpinnerIcon } from '../../ui/icons/Icons';
import Modal from '../../ui/overlay/Modal/Modal';
import styles from './CreateDatasourceFolderModal.module.css';

interface Props {
  folder?: { id: string; name: string } | null;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

export default function CreateDatasourceFolderModal({ folder, onClose, onCreated }: Props) {
  const [name, setName] = useState(folder?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;

    setSaving(true);
    setError(null);

    try {
      if (folder) {
        await datasourceFoldersApi.update(folder.id, { name: name.trim() });
      } else {
        await datasourceFoldersApi.create({ name: name.trim() });
      }
      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Erro ao ${folder ? 'editar' : 'criar'} pasta`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={folder ? 'Editar Pasta de Datasources' : 'Criar Pasta de Datasources'}
      subtitle="Organize seus bancos de dados em grupos e arraste os itens para dentro ou para fora."
      onClose={onClose}
      size="md"
      footer={(
        <>
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className={styles.btnPrimary} onClick={() => void handleSubmit()} disabled={!canSubmit || saving}>
            {saving ? <SpinnerIcon width={14} height={14} /> : null}
            {saving ? (folder ? 'Salvando...' : 'Criando...') : (folder ? 'Salvar nome' : 'Criar pasta')}
          </button>
        </>
      )}
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>Nome da pasta</span>
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="ex: Produção, Clientes, Legado"
            autoFocus
          />
        </label>

        <p className={styles.hint}>
          Depois de criar, você pode arrastar qualquer datasource para dentro da pasta ou soltá-lo na área raiz para removê-lo dela.
        </p>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
}
