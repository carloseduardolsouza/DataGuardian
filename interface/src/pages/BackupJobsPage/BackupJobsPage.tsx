import { useEffect, useMemo, useState } from 'react';
import { backupJobsApi, datasourceApi, storageApi } from '../../services/api';
import type { ApiBackupJob, ApiDatasource, ApiStorageLocation } from '../../services/api';
import JobFormModal from './JobFormModal';
import ConfirmDialog from '../../ui/dialogs/ConfirmDialog/ConfirmDialog';
import { useCriticalAction } from '../../hooks/useCriticalAction';
import styles from './BackupJobsPage.module.css';

import StatusBadge from '../../ui/data-display/StatusBadge/StatusBadge';
import {
  PlusIcon,
  PlayFilledIcon,
  EditIcon,
  ClockIcon,
  NextIcon,
  EmptyJobsIcon,
  SpinnerIcon,
  TrashIcon,
} from '../../ui/icons/Icons';

type Filter = 'all' | 'active' | 'inactive';

function scheduleLabel(cron: string) {
  const [min = '*', hour = '*', dom = '*', _month = '*', dow = '*'] = cron.split(' ');
  if (dom !== '*' && dow === '*') return `Mensal dia ${dom} às ${hour}:${String(min).padStart(2, '0')}`;
  if (dow !== '*' && dom === '*') return `Semanal (dias ${dow}) às ${hour}:${String(min).padStart(2, '0')}`;
  return `Diário às ${hour}:${String(min).padStart(2, '0')}`;
}

function nextRunLabel(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins < 0) return 'Atrasado';
  if (mins < 60) return `Em ${mins} min`;
  if (mins < 24 * 60) return `Em ${Math.floor(mins / 60)}h`;
  return d.toLocaleString('pt-BR');
}

function formatDuration(secs: number | null) {
  if (secs === null) return '—';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function formatSize(bytes: number | null) {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function resolveStorageNames(job: ApiBackupJob, storages: ApiStorageLocation[]) {
  const targets = job.storage_targets
    ?? job.backup_options?.storage_targets
    ?? [{ storage_location_id: job.storage_location_id, order: 1 }];

  const ordered = [...targets].sort((a, b) => a.order - b.order);
  return ordered.map((target) => {
    const storage = storages.find((s) => s.id === target.storage_location_id);
    return storage?.name ?? target.storage_location_id;
  });
}

export default function BackupJobsPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const criticalAction = useCriticalAction({ isAdmin });
  const [jobs, setJobs] = useState<ApiBackupJob[]>([]);
  const [datasources, setDatasources] = useState<ApiDatasource[]>([]);
  const [storages, setStorages] = useState<ApiStorageLocation[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [editJob, setEditJob] = useState<ApiBackupJob | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runningNowIds, setRunningNowIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiBackupJob | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      const [jobsRes, dsRes, slRes] = await Promise.all([
        backupJobsApi.list(),
        datasourceApi.list(),
        storageApi.list(),
      ]);
      setJobs(jobsRes.data);
      setDatasources(dsRes.data);
      setStorages(slRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar backup jobs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const filtered = useMemo(() => jobs.filter(j => (
    filter === 'all' ? true : filter === 'active' ? j.enabled : !j.enabled
  )), [jobs, filter]);

  const counts = {
    all: jobs.length,
    active: jobs.filter(j => j.enabled).length,
    inactive: jobs.filter(j => !j.enabled).length,
  };

  async function toggleEnable(job: ApiBackupJob) {
    try {
      await backupJobsApi.update(job.id, { enabled: !job.enabled });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar job.');
    }
  }

  async function runNow(jobId: string) {
    const startedAt = new Date().toISOString();
    setError(null);
    setRunningNowIds((prev) => (prev.includes(jobId) ? prev : [...prev, jobId]));
    setJobs((prev) => prev.map((job) => {
      if (job.id !== jobId) return job;
      return {
        ...job,
        last_execution_at: startedAt,
        last_execution: {
          status: 'running',
          started_at: startedAt,
          finished_at: null,
          size_bytes: null,
          duration_seconds: null,
        },
      };
    }));

    try {
      const started = await criticalAction.run({
        action: 'backup_job.run',
        actionLabel: 'Executar backup job',
        resourceType: 'backup_job',
        resourceId: jobId,
        execute: (auth) => backupJobsApi.run(jobId, auth).then(() => undefined),
      });
      if (!started) return;

      for (let i = 0; i < 20; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const fresh = await backupJobsApi.getById(jobId);
        setJobs((prev) => prev.map((job) => (job.id === jobId ? fresh : job)));
        if (
          fresh.last_execution?.status
          && ['completed', 'failed', 'cancelled'].includes(fresh.last_execution.status)
        ) {
          break;
        }
      }

      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar job.');
      await loadAll();
    } finally {
      setRunningNowIds((prev) => prev.filter((id) => id !== jobId));
    }
  }

  async function removeJob(job: ApiBackupJob) {
    setDeleteTarget(job);
  }

  async function confirmRemoveJob() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await criticalAction.run({
        action: 'backup_job.delete',
        actionLabel: 'Remover backup job',
        resourceType: 'backup_job',
        resourceId: deleteTarget.id,
        execute: (auth) => backupJobsApi.remove(deleteTarget.id, auth),
        onSuccess: async () => {
          await loadAll();
          setDeleteTarget(null);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover job.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave(payload: Parameters<typeof backupJobsApi.create>[0], id?: string) {
    try {
      setSaving(true);
      setError(null);
      if (id) await backupJobsApi.update(id, payload);
      else await backupJobsApi.create(payload);

      setEditJob(null);
      setShowCreate(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar job.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Backup Jobs</h2>
          <p className={styles.pageSub}>{counts.active} ativos · {counts.inactive} inativos</p>
        </div>
        <button className={styles.newBtn} onClick={() => setShowCreate(true)}>
          <PlusIcon /> Novo Job
        </button>
      </div>

      <div className={styles.filters}>
        {(['all', 'active', 'inactive'] as Filter[]).map(f => (
          <button
            key={f}
            className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Todos' : f === 'active' ? 'Ativos' : 'Inativos'}
            <span className={styles.filterCount}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '8px 24px', color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>
          {error}
        </div>
      )}

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}><SpinnerIcon /> <p>Carregando jobs...</p></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <EmptyJobsIcon />
            <p>Nenhum job encontrado</p>
            <button className={styles.newBtnSm} onClick={() => setShowCreate(true)}>
              <PlusIcon /> Criar primeiro job
            </button>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Datasource / Storage</th>
                <th>Agendamento</th>
                <th>Última execução</th>
                <th>Próxima execução</th>
                <th>Status</th>
                <th className={styles.actionsCol} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(job => (
                <tr key={job.id} className={!job.enabled ? styles.disabledRow : ''}>
                  <td>
                    <div className={styles.jobCell}>
                      <span className={styles.jobName}>{job.name}</span>
                      <span className={`${styles.typeBadge} ${styles.full}`}>full</span>
                    </div>
                  </td>

                  <td>
                    <div className={styles.connectCell}>
                      <div className={styles.dsItem}>
                        <span className={styles.dsName}>{job.datasource?.name ?? job.datasource_id}</span>
                      </div>
                      <div className={styles.slList}>
                        {resolveStorageNames(job, storages).map((name, index) => (
                          <span key={`${job.id}-${name}-${index}`} className={styles.slChip}>
                            {index === 0 ? `${name} (primario)` : name}
                          </span>
                        ))}
                        <span className={styles.slChip}>
                          {(job.storage_strategy ?? job.backup_options?.storage_strategy ?? 'fallback') === 'replicate'
                            ? 'replicar'
                            : 'fallback'}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className={styles.schedCell}>
                      <ClockIcon />
                      <span>{scheduleLabel(job.schedule_cron)}</span>
                    </div>
                  </td>

                  <td>
                    {job.last_execution ? (
                      <div className={styles.execCell}>
                        <StatusBadge status={job.last_execution.status === 'completed' ? 'success' : job.last_execution.status} />
                        <span className={styles.execMeta}>{job.last_execution.started_at ? new Date(job.last_execution.started_at).toLocaleString('pt-BR') : '—'}</span>
                        <span className={styles.execSize}>{formatSize(job.last_execution.size_bytes)}</span>
                        <span className={styles.execDur}>{formatDuration(job.last_execution.duration_seconds)}</span>
                      </div>
                    ) : (
                      <span className={styles.neverText}>Nunca executado</span>
                    )}
                  </td>

                  <td>
                    <div className={styles.nextCell}>
                      <NextIcon />
                      <span>{job.enabled ? nextRunLabel(job.next_execution_at) : 'Pausado'}</span>
                    </div>
                  </td>

                  <td>
                    <button
                      className={`${styles.toggle} ${job.enabled ? styles.toggleOn : styles.toggleOff}`}
                      onClick={() => void toggleEnable(job)}
                    >
                      <span className={styles.toggleThumb} />
                    </button>
                  </td>

                  <td className={styles.actionsCol}>
                    <div className={styles.actions}>
                      <button
                        className={styles.actionBtn}
                        title="Executar agora"
                        onClick={() => void runNow(job.id)}
                        disabled={runningNowIds.includes(job.id)}
                      >
                        <PlayFilledIcon />
                      </button>
                      <button className={styles.actionBtn} title="Editar" onClick={() => setEditJob(job)}>
                        <EditIcon />
                      </button>
                      <button className={styles.actionBtn} title="Remover" onClick={() => void removeJob(job)}>
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(showCreate || editJob) && (
        <JobFormModal
          job={editJob}
          datasources={datasources}
          storages={storages}
          saving={saving}
          onClose={() => { setEditJob(null); setShowCreate(false); }}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Confirmar exclusao de backup job"
        message={deleteTarget ? `Deseja remover o job "${deleteTarget.name}"?` : ''}
        confirmLabel="Excluir job"
        loading={deleting}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmRemoveJob()}
      />
      {criticalAction.modal}
    </div>
  );
}



