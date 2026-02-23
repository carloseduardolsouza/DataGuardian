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
import styles from './SyncPage.module.css';

type Direction = 'source_to_target' | 'target_to_source';

const SUPPORTED_TYPES = new Set(['postgres', 'mysql', 'mariadb']);
const MINUTES = [0, 15, 30, 45];

function parseDailyCron(cron: string) {
  const [m = '0', h = '2'] = cron.split(' ');
  const minute = Number(m);
  const hour = Number(h);
  return {
    hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 2,
    minute: Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 0,
  };
}

function buildDailyCron(hour: number, minute: number) {
  return `${minute} ${hour} * * *`;
}

interface CreateFormState {
  name: string;
  sourceDatasourceId: string;
  targetDatasourceId: string;
  storageLocationId: string;
  direction: Direction;
  dropExisting: boolean;
  runOnManual: boolean;
  enabled: boolean;
  hour: number;
  minute: number;
}

const INITIAL_FORM: CreateFormState = {
  name: '',
  sourceDatasourceId: '',
  targetDatasourceId: '',
  storageLocationId: '',
  direction: 'source_to_target',
  dropExisting: true,
  runOnManual: true,
  enabled: true,
  hour: 2,
  minute: 0,
};

export default function SyncPage({ permissions }: { permissions?: string[] }) {
  const [jobs, setJobs] = useState<ApiDbSyncJob[]>([]);
  const [datasources, setDatasources] = useState<ApiDatasource[]>([]);
  const [storages, setStorages] = useState<ApiStorageLocation[]>([]);
  const [form, setForm] = useState<CreateFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setError('Preencha nome, origem, destino e storage.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await dbSyncJobsApi.create({
        name: form.name.trim(),
        source_datasource_id: form.sourceDatasourceId,
        target_datasource_id: form.targetDatasourceId,
        storage_location_id: form.storageLocationId,
        schedule_cron: buildDailyCron(form.hour, form.minute),
        schedule_timezone: 'UTC',
        overwrite_direction: form.direction,
        drop_existing: form.dropExisting,
        run_on_manual: form.runOnManual,
        enabled: form.enabled,
      });
      setForm(INITIAL_FORM);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar sync job');
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
      await dbSyncJobsApi.run(job.id);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao executar sincronizacao');
    } finally {
      setRunningId(null);
    }
  }

  async function removeJob(job: ApiDbSyncJob) {
    try {
      setError(null);
      await dbSyncJobsApi.remove(job.id);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover sync job');
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Sincronizacao de Bancos (Worker Separado)</h2>
        <p className={styles.sub}>Gestao dedicada via tabela propria `database_sync_jobs` e worker `db-sync`.</p>
      </div>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Novo Sync Job</h3>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Nome</span>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: Sync Producao -> Teste"
            />
          </label>

          <label className={styles.field}>
            <span>Origem</span>
            <select
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
            <span>Destino</span>
            <select
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
            <span>Storage</span>
            <select
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
            <span>Direcao</span>
            <select
              value={form.direction}
              onChange={(e) => setForm((prev) => ({ ...prev, direction: e.target.value as Direction }))}
            >
              <option value="source_to_target">Origem {'->'} Destino</option>
              <option value="target_to_source">Destino {'->'} Origem</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Hora diaria (UTC)</span>
            <div className={styles.timeRow}>
              <select
                value={form.hour}
                onChange={(e) => setForm((prev) => ({ ...prev, hour: Number(e.target.value) }))}
              >
                {Array.from({ length: 24 }, (_, value) => (
                  <option key={value} value={value}>{String(value).padStart(2, '0')}</option>
                ))}
              </select>
              <span>:</span>
              <select
                value={form.minute}
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
          <label><input type="checkbox" checked={form.dropExisting} onChange={(e) => setForm((prev) => ({ ...prev, dropExisting: e.target.checked }))} /><span>Drop existing no restore</span></label>
          <label><input type="checkbox" checked={form.runOnManual} onChange={(e) => setForm((prev) => ({ ...prev, runOnManual: e.target.checked }))} /><span>Executar tambem no manual</span></label>
          <label><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))} /><span>Habilitado</span></label>
        </div>

        <div className={styles.footer}>
          <span className={styles.hint}>Cron: {buildDailyCron(form.hour, form.minute)}</span>
          <button className={styles.saveBtn} onClick={() => void createSyncJob()} disabled={saving || !canWrite}>
            {saving ? 'Criando...' : 'Criar Sync Job'}
          </button>
        </div>
      </section>

      {error && <div className={styles.error}>{error}</div>}

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
                  <th>Cron</th>
                  <th>Ultima execucao</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const parsed = parseDailyCron(job.schedule_cron);
                  return (
                    <tr key={job.id}>
                      <td>
                        <strong>{job.name}</strong>
                      </td>
                      <td>
                        {job.source_datasource?.name ?? job.source_datasource_id} {'->'} {job.target_datasource?.name ?? job.target_datasource_id}
                      </td>
                      <td>{String(parsed.hour).padStart(2, '0')}:{String(parsed.minute).padStart(2, '0')} UTC</td>
                      <td>{job.last_execution_at ? new Date(job.last_execution_at).toLocaleString('pt-BR') : '-'}</td>
                      <td>{job.last_sync_execution?.status ?? '-'}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button disabled={!canWrite} onClick={() => void toggleEnabled(job)}>{job.enabled ? 'Desativar' : 'Ativar'}</button>
                          <button disabled={runningId === job.id || !canRun} onClick={() => void runNow(job)}>
                            {runningId === job.id ? 'Executando...' : 'Executar'}
                          </button>
                          <button disabled={!canWrite} onClick={() => void removeJob(job)}>Remover</button>
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
  );
}
