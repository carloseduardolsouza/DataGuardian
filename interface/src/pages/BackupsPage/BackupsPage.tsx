import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backupsApi } from '../../services/api';
import { useResizableWidth } from '../../hooks/useResizableWidth';
import type {
  ApiBackupDatasourceSummary,
  ApiBackupEntry,
  ApiBackupStorageLocation,
  ApiRestoreTargetDatasource,
} from '../../services/api';
import {
  FolderIcon,
  DatabaseIcon,
  SpinnerIcon,
  PlayFilledIcon,
  ExportIcon,
  SearchIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ErrorIcon,
} from '../../ui/icons/Icons';
import { ROUTE_PATHS } from '../../ui/navigation/Sidebar/Sidebar';
import Modal from '../../ui/overlay/Modal/Modal';
import { PERMISSIONS } from '../../constants/permissions';
import { useCriticalAction } from '../../hooks/useCriticalAction';
import styles from './BackupsPage.module.css';

function formatBytes(value: number | string | null) {
  if (value === null) return '—';
  const bytes = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const amount = bytes / 1024 ** index;
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function storageStatusLabel(status: ApiBackupStorageLocation['status']) {
  if (status === 'available') return 'Disponivel';
  if (status === 'missing') return 'Arquivo ausente';
  if (status === 'unreachable') return 'Inacessivel';
  return 'Desconhecido';
}

function storageStatusClass(status: ApiBackupStorageLocation['status']) {
  if (status === 'available') return styles.storageStatusSuccess;
  if (status === 'missing') return styles.storageStatusWarning;
  if (status === 'unreachable') return styles.storageStatusDanger;
  return styles.storageStatusMuted;
}

interface Props {
  permissions?: string[];
  isAdmin?: boolean;
}

export default function BackupsPage({ permissions = [], isAdmin = false }: Props) {
  const criticalAction = useCriticalAction({ isAdmin });
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth > 980);
  const navigate = useNavigate();
  const [datasources, setDatasources] = useState<ApiBackupDatasourceSummary[]>([]);
  const [restoreTargets, setRestoreTargets] = useState<ApiRestoreTargetDatasource[]>([]);
  const [loadingDatasources, setLoadingDatasources] = useState(true);
  const [selectedDatasourceId, setSelectedDatasourceId] = useState<string | null>(null);

  const [backups, setBackups] = useState<ApiBackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [restoreRunning, setRestoreRunning] = useState<Record<string, boolean>>({});
  const [downloadRunning, setDownloadRunning] = useState<Record<string, boolean>>({});
  const [storageSelection, setStorageSelection] = useState<Record<string, string>>({});
  const [restoreTarget, setRestoreTarget] = useState<ApiBackupEntry | null>(null);
  const [targetDatasourceId, setTargetDatasourceId] = useState('');
  const [verificationMode, setVerificationMode] = useState(false);
  const [keepVerificationDatabase, setKeepVerificationDatabase] = useState(false);
  const [dropExisting, setDropExisting] = useState(true);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const listPane = useResizableWidth({
    storageKey: 'dg-backups-left-width',
    defaultWidth: 320,
    minWidth: 250,
    maxWidth: 480,
  });

  const filteredDatasources = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return datasources;
    return datasources.filter((item) => {
      return item.datasource_name.toLowerCase().includes(term)
        || item.datasource_type.toLowerCase().includes(term);
    });
  }, [datasources, search]);

  const selectedDatasource = useMemo(
    () => datasources.find((item) => item.datasource_id === selectedDatasourceId) ?? null,
    [datasources, selectedDatasourceId],
  );

  const availableCount = useMemo(() => {
    return backups.reduce((acc, backup) => {
      const hasAvailable = backup.storage_locations.some((item) => item.status === 'available');
      return acc + (hasAvailable ? 1 : 0);
    }, 0);
  }, [backups]);

  const canRestore = permissions.includes(PERMISSIONS.BACKUPS_RESTORE);
  const canRunRestoreVerification = permissions.includes(PERMISSIONS.BACKUPS_RESTORE_VERIFY);
  const requiredPhrase = verificationMode ? 'VERIFICAR RESTORE' : 'RESTAURAR';

  const loadDatasources = async () => {
    try {
      setLoadingDatasources(true);
      setError(null);
      const response = await backupsApi.listDatasources();
      setDatasources(response.data);

      if (!selectedDatasourceId && response.data.length > 0) {
        setSelectedDatasourceId(response.data[0].datasource_id);
      } else if (selectedDatasourceId && !response.data.some((item) => item.datasource_id === selectedDatasourceId)) {
        setSelectedDatasourceId(response.data[0]?.datasource_id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar bancos com backup');
      setDatasources([]);
      setSelectedDatasourceId(null);
    } finally {
      setLoadingDatasources(false);
    }
  };

  const loadRestoreTargets = async () => {
    if (!canRestore) {
      setRestoreTargets([]);
      return;
    }

    try {
      const response = await backupsApi.restoreTargets();
      setRestoreTargets(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar bancos de destino para restore');
      setRestoreTargets([]);
    }
  };

  const loadBackups = async (datasourceId: string) => {
    try {
      setLoadingBackups(true);
      setError(null);
      const response = await backupsApi.listByDatasource(datasourceId);
      setBackups(response.backups);
      setStorageSelection({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar backups');
      setBackups([]);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    void loadDatasources();
  }, []);

  useEffect(() => {
    void loadRestoreTargets();
  }, [canRestore]);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth > 980);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!selectedDatasourceId) {
      setBackups([]);
      return;
    }
    void loadBackups(selectedDatasourceId);
  }, [selectedDatasourceId]);

  const openRestoreModal = (backup: ApiBackupEntry) => {
    setRestoreTarget(backup);
    setTargetDatasourceId(backup.datasource.id);
    setVerificationMode(false);
    setKeepVerificationDatabase(false);
    setDropExisting(true);
    setConfirmationPhrase('');
  };

  const availableDownloadLocation = (backup: ApiBackupEntry) => {
    const preferredStorageId = storageSelection[backup.execution_id];
    if (preferredStorageId) {
      const selected = backup.storage_locations.find((item) => item.storage_location_id === preferredStorageId);
      if (selected?.status === 'available' && selected.relative_path) return selected;
    }

    return backup.storage_locations.find((item) => item.status === 'available' && Boolean(item.relative_path)) ?? null;
  };

  const handleDownload = async (backup: ApiBackupEntry) => {
    const candidate = availableDownloadLocation(backup);
    if (!candidate) {
      setError('Nenhum storage disponivel para download deste backup.');
      return;
    }

    try {
      setDownloadRunning((prev) => ({ ...prev, [backup.execution_id]: true }));
      setError(null);
      await backupsApi.download(backup.execution_id, candidate.storage_location_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao baixar backup');
    } finally {
      setDownloadRunning((prev) => ({ ...prev, [backup.execution_id]: false }));
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    if (!targetDatasourceId) {
      setError('Selecione um banco de destino para o restore.');
      return;
    }
    if (confirmationPhrase.trim() !== requiredPhrase) {
      setError(`Confirmacao invalida. Digite '${requiredPhrase}' para continuar.`);
      return;
    }

    if (verificationMode && !canRunRestoreVerification) {
      setError('Voce nao possui permissao para usar o modo de verificacao.');
      return;
    }

    const backup = restoreTarget;
    const storageLocationId = storageSelection[backup.execution_id] || undefined;
    const restoreRequestPayload = {
      storage_location_id: storageLocationId,
      target_datasource_id: targetDatasourceId,
      drop_existing: dropExisting,
      verification_mode: verificationMode,
      keep_verification_database: keepVerificationDatabase,
      confirmation_phrase: confirmationPhrase.trim(),
    };
    const approvalPayload = {
      backup_execution_id: backup.execution_id,
      source_datasource_id: backup.datasource.id,
      source_datasource_name: backup.datasource.name,
      target_datasource_id: targetDatasourceId,
      selected_storage_location_id: storageLocationId ?? null,
      drop_existing: dropExisting,
      verification_mode: verificationMode,
      keep_verification_database: keepVerificationDatabase,
      confirmation_phrase: confirmationPhrase.trim(),
    };

    try {
      setRestoreRunning((prev) => ({ ...prev, [backup.execution_id]: true }));
      let executionId: string | null = null;
      const done = await criticalAction.run({
        action: 'backup.restore',
        actionLabel: 'Executar restore de backup',
        resourceType: 'backup_execution',
        resourceId: backup.execution_id,
        payload: approvalPayload,
        requestApprovalFirst: !isAdmin,
        execute: async (auth) => {
          const response = await backupsApi.restore(
            backup.execution_id,
            restoreRequestPayload,
            auth,
          );
          executionId = response.execution_id;
        },
      });
      if (!done || !executionId) return;
      setRestoreTarget(null);
      navigate(ROUTE_PATHS.executions, {
        state: { openExecutionId: executionId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar restore');
    } finally {
      setRestoreRunning((prev) => ({ ...prev, [backup.execution_id]: false }));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.leftPanel} style={isDesktop ? { width: listPane.width } : undefined}>
        <div className={styles.leftHeader}>
          <div className={styles.searchWrap}>
            <SearchIcon />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar banco..."
              className={styles.searchInput}
            />
          </div>
          <button className={styles.refreshBtn} onClick={() => void loadDatasources()} disabled={loadingDatasources}>
            Atualizar
          </button>
        </div>

        <div className={styles.datasourceList}>
          {loadingDatasources ? (
            <div className={styles.stateLine}><SpinnerIcon /> Carregando bancos...</div>
          ) : filteredDatasources.length === 0 ? (
            <div className={styles.stateLine}>Nenhum banco com backup encontrado.</div>
          ) : (
            filteredDatasources.map((item) => (
              <button
                key={item.datasource_id}
                className={`${styles.datasourceItem} ${selectedDatasourceId === item.datasource_id ? styles.datasourceItemActive : ''}`}
                onClick={() => setSelectedDatasourceId(item.datasource_id)}
              >
                <span className={styles.datasourceIcon}><DatabaseIcon /></span>
                <span className={styles.datasourceMeta}>
                  <span className={styles.datasourceName}>{item.datasource_name}</span>
                  <span className={styles.datasourceSub}>
                    {item.datasource_type} · {item.backups_count} backup{item.backups_count !== 1 ? 's' : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
      {isDesktop && (
        <div
          className={styles.resizeHandle}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar painel de bancos"
          onPointerDown={listPane.startResize}
          onDoubleClick={listPane.resetWidth}
        />
      )}

      <div className={styles.rightPanel}>
        {selectedDatasource ? (
          <>
            <div className={styles.summaryBar}>
              <div className={styles.summaryItem}>
                <FolderIcon />
                <div>
                  <p className={styles.summaryValue}>{backups.length}</p>
                  <p className={styles.summaryLabel}>Backups listados</p>
                </div>
              </div>
              <div className={styles.summaryItem}>
                <CheckCircleIcon />
                <div>
                  <p className={styles.summaryValue}>{availableCount}</p>
                  <p className={styles.summaryLabel}>Com arquivo disponivel</p>
                </div>
              </div>
              <div className={styles.summaryItem}>
                <AlertTriangleIcon />
                <div>
                  <p className={styles.summaryValue}>{backups.length - availableCount}</p>
                  <p className={styles.summaryLabel}>Requer atencao</p>
                </div>
              </div>
            </div>

            {error && (
              <div className={styles.errorBanner}>
                <ErrorIcon />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.tableWrap}>
              {loadingBackups ? (
                <div className={styles.stateLine}><SpinnerIcon /> Carregando backups...</div>
              ) : backups.length === 0 ? (
                <div className={styles.stateLine}>Sem backups para este banco.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.thCell}>Data</th>
                      <th className={styles.thCell}>Job</th>
                      <th className={styles.thCell}>Tamanho</th>
                      <th className={styles.thCell}>Storages</th>
                      <th className={styles.thCell}>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((backup) => {
                      const running = Boolean(restoreRunning[backup.execution_id]);
                      const downloading = Boolean(downloadRunning[backup.execution_id]);
                      const hasMultipleStorages = backup.storage_locations.length > 1;
                      const canDownload = availableDownloadLocation(backup) !== null;
                      return (
                        <tr key={backup.execution_id}>
                          <td className={`${styles.tdCell} ${styles.cellDate}`}>{formatDate(backup.created_at)}</td>
                          <td className={styles.tdCell}>{backup.job.name}</td>
                          <td className={`${styles.tdCell} ${styles.cellMono}`}>{formatBytes(backup.compressed_size_bytes ?? backup.size_bytes)}</td>
                          <td className={styles.tdCell}>
                            <div className={styles.storageList}>
                              {backup.storage_locations.map((location) => (
                                <span key={`${backup.execution_id}-${location.storage_location_id}`} className={`${styles.storagePill} ${storageStatusClass(location.status)}`}>
                                  {location.storage_name}: {storageStatusLabel(location.status)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className={`${styles.tdCell} ${styles.actionsCell}`}>
                            {hasMultipleStorages && (
                              <select
                                className={styles.storageSelect}
                                value={storageSelection[backup.execution_id] ?? ''}
                                onChange={(event) => {
                                  setStorageSelection((prev) => ({
                                    ...prev,
                                    [backup.execution_id]: event.target.value,
                                  }));
                                }}
                              >
                                <option value="">Auto</option>
                                {backup.storage_locations.map((location) => (
                                  <option key={location.storage_location_id} value={location.storage_location_id}>
                                    {location.storage_name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              className={styles.downloadBtn}
                              disabled={downloading || !canDownload}
                              onClick={() => void handleDownload(backup)}
                              title={canDownload ? 'Baixar backup' : 'Backup indisponivel para download'}
                            >
                              {downloading ? <SpinnerIcon /> : <ExportIcon />}
                              {downloading ? 'Baixando...' : 'Baixar'}
                            </button>
                            {canRestore && (
                              <button
                                className={styles.restoreBtn}
                                disabled={running}
                                onClick={() => openRestoreModal(backup)}
                              >
                                {running ? <SpinnerIcon /> : <PlayFilledIcon />}
                                {running ? 'Restaurando...' : 'Restore'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <div className={styles.placeholder}>
            <FolderIcon width={40} height={40} />
            <p>Selecione um banco para ver os backups disponiveis.</p>
          </div>
        )}
      </div>

      {restoreTarget && (
        <Modal
          title="Confirmar restore"
          subtitle={`Backup de ${formatDate(restoreTarget.created_at)} para '${restoreTarget.datasource.name}'`}
          onClose={() => setRestoreTarget(null)}
          size="md"
          footer={(
            <>
              <button className={styles.secondaryBtn} onClick={() => setRestoreTarget(null)}>Cancelar</button>
              <button
                className={styles.restoreBtn}
                onClick={() => void handleRestore()}
                disabled={confirmationPhrase.trim() !== requiredPhrase || restoreRunning[restoreTarget.execution_id]}
              >
                {restoreRunning[restoreTarget.execution_id] ? <SpinnerIcon /> : <PlayFilledIcon />}
                {verificationMode ? 'Validar backup' : 'Iniciar restore'}
              </button>
            </>
          )}
        >
          <div className={styles.modalContent}>
            <p className={styles.modalHint}>
              Escolha o tipo de operacao. O modo de verificacao restaura em banco temporario para validar o backup sem afetar o banco principal.
            </p>

            <label className={styles.field}>
              <span>Banco de destino</span>
              <select
                className={styles.confirmInput}
                value={targetDatasourceId}
                onChange={(event) => setTargetDatasourceId(event.target.value)}
              >
                {restoreTargets
                  .filter((item) => item.datasource_type === restoreTarget.datasource.type)
                  .map((item) => (
                    <option key={item.datasource_id} value={item.datasource_id}>
                      {item.datasource_name} ({item.datasource_type})
                    </option>
                  ))}
              </select>
            </label>

            <label className={styles.checkboxRow}>
              <input
                type="radio"
                name="restore-mode"
                checked={!verificationMode}
                onChange={() => setVerificationMode(false)}
              />
              <span>Restore real no banco de destino</span>
            </label>

            <label className={styles.checkboxRow}>
              <input
                type="radio"
                name="restore-mode"
                checked={verificationMode}
                onChange={() => setVerificationMode(true)}
                disabled={!canRunRestoreVerification}
              />
              <span>Restore verification mode (banco temporario)</span>
            </label>

            {!canRunRestoreVerification && (
              <p className={styles.warningText}>
                Seu usuario nao possui permissao para restore verification mode.
              </p>
            )}

            {!verificationMode && (
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={dropExisting}
                  onChange={(event) => setDropExisting(event.target.checked)}
                />
                <span>Limpar objetos existentes antes do restore (clean)</span>
              </label>
            )}

            {verificationMode && (
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={keepVerificationDatabase}
                  onChange={(event) => setKeepVerificationDatabase(event.target.checked)}
                />
                <span>Manter banco temporario apos validacao</span>
              </label>
            )}

            <label className={styles.field}>
              <span>Digite <code>{requiredPhrase}</code> para confirmar</span>
              <input
                className={styles.confirmInput}
                value={confirmationPhrase}
                onChange={(event) => setConfirmationPhrase(event.target.value)}
                placeholder={requiredPhrase}
              />
            </label>
          </div>
        </Modal>
      )}
      {criticalAction.modal}
    </div>
  );
}


