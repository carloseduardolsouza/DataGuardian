import { useState } from 'react';
import {
  MOCK_BACKUP_JOBS, DS_OPTIONS, SL_OPTIONS,
  scheduleLabel, nextRunLabel, lastRunLabel,
  formatBytes, formatDuration,
} from './mockData';
import type { MockBackupJob, JobStatus } from './mockData';
import JobFormModal from './JobFormModal';
import styles from './BackupJobsPage.module.css';

type Filter = 'all' | 'active' | 'inactive';

export default function BackupJobsPage() {
  const [jobs, setJobs]           = useState(MOCK_BACKUP_JOBS);
  const [filter, setFilter]       = useState<Filter>('all');
  const [editJob, setEditJob]     = useState<MockBackupJob | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = jobs.filter(j =>
    filter === 'all'      ? true :
    filter === 'active'   ? j.enabled :
    !j.enabled,
  );

  const toggleEnable = (id: string) =>
    setJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: !j.enabled } : j));

  const runNow = (id: string) =>
    setJobs(prev => prev.map(j => j.id === id ? {
      ...j,
      lastExecution: {
        status: 'running',
        startedAt: new Date().toISOString(),
        completedAt: null,
        sizeBytes: null,
        durationSeconds: null,
      },
    } : j));

  const handleSave = (data: MockBackupJob) => {
    setJobs(prev => {
      const idx = prev.findIndex(j => j.id === data.id);
      return idx >= 0
        ? prev.map(j => j.id === data.id ? data : j)
        : [...prev, { ...data, id: `job-${Date.now()}`, createdAt: new Date().toISOString() }];
    });
    setEditJob(null);
    setShowCreate(false);
  };

  const counts = {
    all:      jobs.length,
    active:   jobs.filter(j => j.enabled).length,
    inactive: jobs.filter(j => !j.enabled).length,
  };

  return (
    <div className={styles.page}>
      {/* ── Cabeçalho ──────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Backup Jobs</h2>
          <p className={styles.pageSub}>{counts.active} ativos · {counts.inactive} inativos</p>
        </div>
        <button className={styles.newBtn} onClick={() => setShowCreate(true)}>
          <PlusIcon /> Novo Job
        </button>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────── */}
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

      {/* ── Tabela de jobs ──────────────────────────────────────── */}
      <div className={styles.tableWrap}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <EmptyIcon />
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
                <th>Banco / Storage</th>
                <th>Agendamento</th>
                <th>Última execução</th>
                <th>Próxima execução</th>
                <th>Status</th>
                <th className={styles.actionsCol} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(job => {
                const ds  = DS_OPTIONS.find(d => d.id === job.datasourceId);
                const sls = job.storageTargets
                  .sort((a, b) => a.order - b.order)
                  .map(t => SL_OPTIONS.find(s => s.id === t.storageId))
                  .filter(Boolean);

                return (
                  <tr key={job.id} className={!job.enabled ? styles.disabledRow : ''}>
                    {/* Nome + tipo de backup */}
                    <td>
                      <div className={styles.jobCell}>
                        <span className={styles.jobName}>{job.name}</span>
                        <span className={`${styles.typeBadge} ${styles[job.backupType]}`}>
                          {job.backupType}
                        </span>
                      </div>
                    </td>

                    {/* Banco e storages */}
                    <td>
                      <div className={styles.connectCell}>
                        <div className={styles.dsItem}>
                          <span className={`${styles.dsIcon} ${styles[ds?.type ?? '']}`}>
                            {DS_ABBR[ds?.type ?? ''] ?? 'DB'}
                          </span>
                          <span className={styles.dsName}>{ds?.name ?? '—'}</span>
                          <span className={`${styles.statusDot} ${styles[ds?.status ?? 'unknown']}`} />
                        </div>
                        <div className={styles.slList}>
                          {sls.map((sl, idx) => (
                            <span key={sl!.id} className={styles.slChip} title={sl!.name}>
                              <span className={`${styles.slIcon} ${styles[sl!.type]}`}>
                                {SL_ABBR[sl!.type]}
                              </span>
                              {sl!.name}
                              {idx === 0 && <span className={styles.primaryTag}>primário</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>

                    {/* Agendamento */}
                    <td>
                      <div className={styles.schedCell}>
                        <ClockIcon />
                        <span>{scheduleLabel(job.schedule)}</span>
                      </div>
                    </td>

                    {/* Última execução */}
                    <td>
                      {job.lastExecution ? (
                        <div className={styles.execCell}>
                          <StatusBadge status={job.lastExecution.status} />
                          <span className={styles.execMeta}>
                            {lastRunLabel(job.lastExecution)}
                          </span>
                          {job.lastExecution.sizeBytes && (
                            <span className={styles.execSize}>
                              {formatBytes(job.lastExecution.sizeBytes)}
                            </span>
                          )}
                          {job.lastExecution.durationSeconds && (
                            <span className={styles.execDur}>
                              {formatDuration(job.lastExecution.durationSeconds)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className={styles.neverText}>Nunca executado</span>
                      )}
                    </td>

                    {/* Próxima execução */}
                    <td>
                      <div className={styles.nextCell}>
                        {job.enabled ? (
                          <>
                            <NextIcon />
                            <span>{nextRunLabel(job.nextExecutionAt)}</span>
                          </>
                        ) : (
                          <span className={styles.pausedText}>Pausado</span>
                        )}
                      </div>
                    </td>

                    {/* Toggle ativo */}
                    <td>
                      <button
                        className={`${styles.toggle} ${job.enabled ? styles.toggleOn : styles.toggleOff}`}
                        onClick={() => toggleEnable(job.id)}
                        title={job.enabled ? 'Desativar job' : 'Ativar job'}
                      >
                        <span className={styles.toggleThumb} />
                      </button>
                    </td>

                    {/* Ações */}
                    <td className={styles.actionsCol}>
                      <div className={styles.actions}>
                        <button
                          className={styles.actionBtn}
                          title="Executar agora"
                          onClick={() => runNow(job.id)}
                          disabled={!job.enabled || job.lastExecution?.status === 'running'}
                        >
                          <PlayIcon />
                        </button>
                        <button
                          className={styles.actionBtn}
                          title="Editar job"
                          onClick={() => setEditJob(job)}
                        >
                          <EditIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modais ─────────────────────────────────────────────── */}
      {(showCreate || editJob) && (
        <JobFormModal
          job={editJob}
          onClose={() => { setEditJob(null); setShowCreate(false); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

/* ── Status badge ────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { label: string; cls: string }> = {
    success: { label: 'Sucesso',  cls: 'success' },
    failed:  { label: 'Falhou',   cls: 'danger'  },
    running: { label: 'Rodando',  cls: 'running' },
    never:   { label: 'Nunca',    cls: 'neutral' },
  };
  const { label, cls } = map[status];
  return <span className={`${styles.badge} ${styles[cls]}`}>{label}</span>;
}

/* ── Abreviações ─────────────────────────────────────────────────── */
const DS_ABBR: Record<string, string> = {
  postgres: 'PG', mysql: 'MY', mongodb: 'MG', sqlserver: 'MS', sqlite: 'SL',
};

const SL_ABBR: Record<string, string> = {
  local: 'HDD', ssh: 'SSH', s3: 'S3', minio: 'MIO', backblaze: 'B2',
};

/* ── Ícones ──────────────────────────────────────────────────────── */
function PlusIcon()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function PlayIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21"/></svg>; }
function EditIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function ClockIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function NextIcon()  { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>; }
function EmptyIcon() { return <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg>; }
