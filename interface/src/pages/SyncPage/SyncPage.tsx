import { useEffect, useMemo, useState } from 'react';
import {
  dbSyncJobsApi,
  datasourceApi,
  storageApi,
  type ApiDbSyncJob,
  type ApiDatasource,
  type ApiStorageLocation,
} from '../../services/api';
import { PERMISSIONS } from '../../constants/permissions';
import Modal from '../../ui/overlay/Modal/Modal';
import { useCriticalAction } from '../../hooks/useCriticalAction';
import styles from './SyncPage.module.css';

type Direction = 'source_to_target' | 'target_to_source';
type Frequency = 'daily' | 'weekly' | 'monthly';
type SyncExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';

const SUPPORTED_TYPES = new Set(['postgres', 'mysql', 'mariadb']);
const MINUTES = [0, 15, 30, 45];
const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terca' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sabado' },
];
const MONTHDAY_OPTIONS = Array.from({ length: 28 }, (_, idx) => idx + 1);
const STATUS_LABELS: Record<SyncExecutionStatus, string> = {
  queued: 'Na fila',
  running: 'Executando',
  completed: 'Concluido',
  failed: 'Falhou',
  cancelled: 'Cancelado',
  unknown: 'Sem historico',
};

function parseScheduleCron(cron: string) {
  const [m = '0', h = '2', dom = '*', _mon = '*', dow = '*'] = cron.trim().split(/\s+/);
  const minute = Number(m);
  const hour = Number(h);
  const monthDay = Number(dom);
  const weekDay = Number(dow);
  let frequency: Frequency = 'daily';

  if (dom !== '*' && dow === '*') frequency = 'monthly';
  else if (dow !== '*' && dom === '*') frequency = 'weekly';

  return {
    hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 2,
    minute: Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 0,
    frequency,
    monthDay: Number.isFinite(monthDay) && monthDay >= 1 && monthDay <= 28 ? monthDay : 1,
    weekDay: Number.isFinite(weekDay) && weekDay >= 0 && weekDay <= 6 ? weekDay : 1,
  };
}

function buildCron(params: { frequency: Frequency; hour: number; minute: number; weekDay: number; monthDay: number }) {
  if (params.frequency === 'weekly') {
    return `${params.minute} ${params.hour} * * ${params.weekDay}`;
  }
  if (params.frequency === 'monthly') {
    return `${params.minute} ${params.hour} ${params.monthDay} * *`;
  }
  return `${params.minute} ${params.hour} * * *`;
}

function formatScheduleLabel(cron: string, enabled: boolean) {
  if (!enabled) return 'Manual apenas (sem execucao automatica)';

  const parsed = parseScheduleCron(cron);
  const hh = String(parsed.hour).padStart(2, '0');
  const mm = String(parsed.minute).padStart(2, '0');
  if (parsed.frequency === 'weekly') {
    const weekday = WEEKDAY_OPTIONS.find((item) => item.value === parsed.weekDay)?.label ?? 'Dia invalido';
    return `Semanal (${weekday}) ${hh}:${mm} UTC`;
  }
  if (parsed.frequency === 'monthly') {
    return `Mensal (dia ${parsed.monthDay}) ${hh}:${mm} UTC`;
  }
  return `Diaria ${hh}:${mm} UTC`;
}

function getStatusKey(status: string | null | undefined): SyncExecutionStatus {
  if (status === 'queued' || status === 'running' || status === 'completed' || status === 'failed' || status === 'cancelled') {
    return status;
  }
  return 'unknown';
}

interface CreateFormState {
  name: string;
  sourceDatasourceId: string;
  targetDatasourceId: string;
  storageLocationId: string;
  direction: Direction;
  dropExisting: boolean;
  runOnManual: boolean;
  recurring: boolean;
  frequency: Frequency;
  hour: number;
  minute: number;
  weekDay: number;
  monthDay: number;
}

const INITIAL_FORM: CreateFormState = {
  name: '',
  sourceDatasourceId: '',
  targetDatasourceId: '',
  storageLocationId: '',
  direction: 'source_to_target',
  dropExisting: true,
  runOnManual: true,
  recurring: true,
  frequency: 'daily',
  hour: 2,
  minute: 0,
  weekDay: 1,
  monthDay: 1,
};

export default function SyncPage({ permissions }: { permissions?: string[] }) {
  const isAdmin = permissions?.includes(PERMISSIONS.ACCESS_MANAGE) ?? false;
  const criticalAction = useCriticalAction({ isAdmin });
  const [jobs, setJobs] = useState<ApiDbSyncJob[]>([]);
  const [datasources, setDatasources] = useState<ApiDatasource[]>([]);
  const [storages, setStorages] = useState<ApiStorageLocation[]>([]);
  const [form, setForm] = useState<CreateFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const canWrite = permissions?.includes(PERMISSIONS.DB_SYNC_JOBS_WRITE) ?? false;
  const canRun = permissions?.includes(PERMISSIONS.DB_SYNC_JOBS_RUN) ?? false;

  const supportedDatasources = useMemo(
    () => datasources.filter((item) => SUPPORTED_TYPES.has(item.type)),
    [datasources],
  );

  const targetCandidates = useMemo(() => {
    const source = supportedDatasources.find((item) => item.id === form.sourceDatasourceId);
    if (!source) return [];
    return supportedDatasources.filter((item) => item.id !== source.id && item.type === source.type);
  }, [supportedDatasources, form.sourceDatasourceId]);

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      const [jobsRes, dsRes, stRes] = await Promise.all([
        dbSyncJobsApi.list({ limit: 100 }),
        datasourceApi.list(),
        storageApi.list(),
      ]);
      setJobs(jobsRes.data);
      setDatasources(dsRes.data);
      setStorages(stRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar sincronizacoes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!form.sourceDatasourceId) return;
    if (targetCandidates.some((item) => item.id === form.targetDatasourceId)) return;
    setForm((prev) => ({
      ...prev,
      targetDatasourceId: targetCandidates[0]?.id ?? '',
    }));
  }, [targetCandidates, form.sourceDatasourceId, form.targetDatasourceId]);

  async function createSyncJob() {
    if (!form.name.trim() || !form.sourceDatasourceId || !form.targetDatasourceId || !form.storageLocationId) {
      setCreateError('Preencha nome, origem, destino e storage.');
      return;
    }

    try {
      setSaving(true);
      setCreateError(null);
      const scheduleCron = buildCron({
        frequency: form.frequency,
        hour: form.hour,
        minute: form.minute,
        weekDay: form.weekDay,
        monthDay: form.monthDay,
      });
      await dbSyncJobsApi.create({
        name: form.name.trim(),
        source_datasource_id: form.sourceDatasourceId,
        target_datasource_id: form.targetDatasourceId,
        storage_location_id: form.storageLocationId,
        schedule_cron: scheduleCron,
        schedule_timezone: 'UTC',
        overwrite_direction: form.direction,
        drop_existing: form.dropExisting,
        run_on_manual: form.recurring ? form.runOnManual : true,
        enabled: form.recurring,
      });
      setForm(INITIAL_FORM);
      setIsCreateModalOpen(false);
      await loadAll();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Falha ao criar sync job');
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(job: ApiDbSyncJob) {
    try {
      setError(null);
      await dbSyncJobsApi.update(job.id, { enabled: !job.enabled });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar job');
    }
  }

  async function runNow(job: ApiDbSyncJob) {
    try {
      setRunningId(job.id);
      setError(null);
      await criticalAction.run({
        action: 'db_sync_job.run',
        actionLabel: 'Executar sync job',
        resourceType: 'db_sync_job',
        resourceId: job.id,
        execute: (auth) => dbSyncJobsApi.run(job.id, auth).then(() => undefined),
        onSuccess: () => loadAll(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao executar sincronizacao');
    } finally {
      setRunningId(null);
    }
  }

  async function removeJob(job: ApiDbSyncJob) {
    try {
      setError(null);
      await criticalAction.run({
        action: 'db_sync_job.delete',
        actionLabel: 'Remover sync job',
        resourceType: 'db_sync_job',
        resourceId: job.id,
        execute: (auth) => dbSyncJobsApi.remove(job.id, auth),
        onSuccess: () => loadAll(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover sync job');
    }
  }

  function openCreateModal() {
    setCreateError(null);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (saving) return;
    setCreateError(null);
    setForm(INITIAL_FORM);
    setIsCreateModalOpen(false);
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Sincronizacao de Bases</h2>
          <p className={styles.pageSub}>Configure fluxos entre ambientes com execucao manual ou recorrente via cron.</p>
        </div>
        <div className={styles.pageHeaderActions}>
          <button className={styles.newJobBtn} onClick={openCreateModal} disabled={!canWrite}>
            Novo Sync Job
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.content}>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Sync Jobs Cadastrados</h3>
          {loading ? (
            <div className={styles.empty}>Carregando...</div>
          ) : jobs.length === 0 ? (
            <div className={styles.empty}>Nenhum sync job cadastrado.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Fluxo</th>
                    <th>Agendamento</th>
                    <th>Ultima execucao</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const statusKey = getStatusKey(job.last_sync_execution?.status);
                    return (
                      <tr key={job.id}>
                        <td>
                          <strong className={styles.checkItem}>{job.name}</strong>
                        </td>
                        <td>
                          <span className={styles.checkItem} >{job.source_datasource?.name ?? job.source_datasource_id} {'->'} {job.target_datasource?.name ?? job.target_datasource_id}</span>
                        </td>
                        <td> <span className={styles.checkItem}>{formatScheduleLabel(job.schedule_cron, job.enabled)}</span></td>
                        <td> <span className={styles.checkItem}>{job.last_execution_at ? new Date(job.last_execution_at).toLocaleString('pt-BR') : '-'}</span></td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[`status_${statusKey}`]}`}>
                            {STATUS_LABELS[statusKey]}
                          </span>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button disabled={!canWrite} onClick={() => void toggleEnabled(job)}>{job.enabled ? 'Desativar' : 'Ativar'}</button>
                            <button className={styles.actionRun} disabled={runningId === job.id || !canRun} onClick={() => void runNow(job)}>
                              {runningId === job.id ? 'Executando...' : 'Executar'}
                            </button>
                            <button className={styles.actionDanger} disabled={!canWrite} onClick={() => void removeJob(job)}>Remover</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {isCreateModalOpen && (
        <Modal
          title="Novo Sync Job"
          subtitle="Configure origem, destino e agendamento da sincronizacao."
          onClose={closeCreateModal}
          size="lg"
          footer={(
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeCreateModal} disabled={saving}>
                Cancelar
              </button>
              <button className={styles.saveBtn} onClick={() => void createSyncJob()} disabled={saving || !canWrite}>
                {saving ? 'Criando...' : 'Criar Sync Job'}
              </button>
            </div>
          )}
        >
          <div className={styles.modalForm}>
            {createError && <div className={styles.modalError}>{createError}</div>}
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nome</span>
                <input
                  className={styles.input}
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Sync Producao -> Teste"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Origem</span>
                <select
                  className={styles.select}
                  value={form.sourceDatasourceId}
                  onChange={(e) => setForm((prev) => ({ ...prev, sourceDatasourceId: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {supportedDatasources.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} ({item.type})</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Destino</span>
                <select
                  className={styles.select}
                  value={form.targetDatasourceId}
                  onChange={(e) => setForm((prev) => ({ ...prev, targetDatasourceId: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {targetCandidates.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} ({item.type})</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Storage</span>
                <select
                  className={styles.select}
                  value={form.storageLocationId}
                  onChange={(e) => setForm((prev) => ({ ...prev, storageLocationId: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {storages.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Direcao</span>
                <select
                  className={styles.select}
                  value={form.direction}
                  onChange={(e) => setForm((prev) => ({ ...prev, direction: e.target.value as Direction }))}
                >
                  <option value="source_to_target">Origem {'->'} Destino</option>
                  <option value="target_to_source">Destino {'->'} Origem</option>
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Frequencia</span>
                <select
                  className={styles.select}
                  value={form.frequency}
                  disabled={!form.recurring}
                  onChange={(e) => setForm((prev) => ({ ...prev, frequency: e.target.value as Frequency }))}
                >
                  <option value="daily">Diaria</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </label>

              {form.frequency === 'weekly' && (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Dia da semana</span>
                  <select
                    className={styles.select}
                    value={form.weekDay}
                    disabled={!form.recurring}
                    onChange={(e) => setForm((prev) => ({ ...prev, weekDay: Number(e.target.value) }))}
                  >
                    {WEEKDAY_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
              )}

              {form.frequency === 'monthly' && (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Dia do mes</span>
                  <select
                    className={styles.select}
                    value={form.monthDay}
                    disabled={!form.recurring}
                    onChange={(e) => setForm((prev) => ({ ...prev, monthDay: Number(e.target.value) }))}
                  >
                    {MONTHDAY_OPTIONS.map((value) => (
                      <option key={value} value={value}>Dia {value}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Horario (UTC)</span>
                <div className={styles.timeRow}>
                  <select
                    className={styles.select}
                    value={form.hour}
                    disabled={!form.recurring}
                    onChange={(e) => setForm((prev) => ({ ...prev, hour: Number(e.target.value) }))}
                  >
                    {Array.from({ length: 24 }, (_, value) => (
                      <option key={value} value={value}>{String(value).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className={styles.timeSep}>:</span>
                  <select
                    className={styles.select}
                    value={form.minute}
                    disabled={!form.recurring}
                    onChange={(e) => setForm((prev) => ({ ...prev, minute: Number(e.target.value) }))}
                  >
                    {MINUTES.map((value) => (
                      <option key={value} value={value}>{String(value).padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </label>
            </div>

            <div className={styles.flags}>
              <label className={styles.checkItem}>
                <input className={styles.checkbox} type="checkbox" checked={form.dropExisting} onChange={(e) => setForm((prev) => ({ ...prev, dropExisting: e.target.checked }))} />
                <span>Drop existing no restore</span>
              </label>
              <label className={styles.checkItem}>
                <input className={styles.checkbox} type="checkbox" checked={form.recurring} onChange={(e) => setForm((prev) => ({ ...prev, recurring: e.target.checked }))} />
                <span>Recorrente (execucao automatica)</span>
              </label>
              <label className={styles.checkItem}>
                <input className={styles.checkbox} type="checkbox" checked={form.recurring ? form.runOnManual : true} disabled={!form.recurring} onChange={(e) => setForm((prev) => ({ ...prev, runOnManual: e.target.checked }))} />
                <span>Permitir execucao manual</span>
              </label>
            </div>

            <p className={styles.modalHint}>
              {form.recurring
                ? `Cron: ${buildCron({ frequency: form.frequency, hour: form.hour, minute: form.minute, weekDay: form.weekDay, monthDay: form.monthDay })}`
                : 'Nao recorrente: executa somente manualmente (sem agendamento automatico).'}
            </p>
          </div>
        </Modal>
      )}
      {criticalAction.modal}
    </div>
  );
}
