import { useState } from 'react';
import Sidebar, { type NavKey } from '../../components/Sidebar/Sidebar';
import { DatabaseStatIcon, JobStatIcon, ExecutionStatIcon, DangerStatIcon, SunIcon, MoonIcon, EmptyPageIcon } from '../../components/Icons';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import DatasourcesPage from '../DatasourcesPage/DatasourcesPage';
import StoragePage     from '../StoragePage/StoragePage';
import BackupJobsPage  from '../BackupJobsPage/BackupJobsPage';
import ExecutionsPage  from '../ExecutionsPage/ExecutionsPage';
import styles from './DashboardPage.module.css';

interface Props {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
}

// ── Dados mockados ──────────────────────────────────────────────
const STATS = [
  {
    label:   'Datasources',
    value:   12,
    delta:   '+2 este mês',
    variant: 'primary' as const,
    icon:    <DatabaseStatIcon />,
  },
  {
    label:   'Jobs Ativos',
    value:   6,
    delta:   'de 8 no total',
    variant: 'success' as const,
    icon:    <JobStatIcon />,
  },
  {
    label:   'Execuções Hoje',
    value:   24,
    delta:   '+4 em relação a ontem',
    variant: 'warning' as const,
    icon:    <ExecutionStatIcon />,
  },
  {
    label:   'Falhas Hoje',
    value:   2,
    delta:   '8% de taxa de falha',
    variant: 'danger' as const,
    icon:    <DangerStatIcon />,
  },
];

const EXECUTIONS = [
  { id: 'exc-001', datasource: 'Postgres Produção', job: 'pg-prod-daily',    status: 'success', size: '1.2 GB',  duration: '4m 12s', ago: '2h atrás' },
  { id: 'exc-002', datasource: 'MySQL Staging',     job: 'mysql-staging',    status: 'success', size: '450 MB', duration: '1m 38s', ago: '4h atrás' },
  { id: 'exc-003', datasource: 'MongoDB Atlas',     job: 'mongo-hourly',     status: 'running', size: '—',      duration: '—',      ago: 'agora' },
  { id: 'exc-004', datasource: 'SQLite Local',      job: 'sqlite-backup',    status: 'failed',  size: '—',      duration: '0m 04s', ago: '6h atrás' },
  { id: 'exc-005', datasource: 'Postgres Produção', job: 'pg-prod-daily',    status: 'success', size: '1.1 GB', duration: '3m 58s', ago: '1d atrás' },
];

const JOBS = [
  { name: 'pg-prod-daily',   cron: '0 2 * * *',   nextRun: 'Hoje às 02:00',     enabled: true },
  { name: 'mysql-staging',   cron: '30 3 * * *',   nextRun: 'Hoje às 03:30',     enabled: true },
  { name: 'mongo-hourly',    cron: '0 * * * *',    nextRun: 'Em 38 minutos',     enabled: true },
  { name: 'sqlite-backup',   cron: '0 4 * * 0',    nextRun: 'Dom, 04:00',        enabled: false },
];

const HEALTH_CHECKS = [
  { name: 'Postgres Produção', latency: '12ms', status: 'ok' as const },
  { name: 'MySQL Staging',     latency: '28ms', status: 'ok' as const },
  { name: 'MongoDB Atlas',     latency: '95ms', status: 'warning' as const },
  { name: 'SQLite Local',      latency: '—',    status: 'error' as const },
];

// ── Labels de página por chave de nav ──────────────────────────
const PAGE_TITLES: Record<NavKey, { title: string; sub: string }> = {
  'dashboard':     { title: 'Dashboard',        sub: 'Visão geral do sistema' },
  'datasources':   { title: 'Datasources',      sub: 'Gerencie suas fontes de dados' },
  'storage':       { title: 'Storage',           sub: 'Locais de armazenamento' },
  'backup-jobs':   { title: 'Backup Jobs',       sub: 'Gerencie seus jobs de backup' },
  'executions':    { title: 'Execuções',         sub: 'Histórico de execuções' },
  'health':        { title: 'Health',            sub: 'Monitoramento de saúde' },
  'notifications': { title: 'Notificações',      sub: 'Central de alertas' },
  'settings':      { title: 'Configurações',     sub: 'Preferências do sistema' },
};

export default function DashboardPage({ theme, onToggleTheme, onLogout }: Props) {
  const [activePage, setActivePage] = useState<NavKey>('dashboard');

  const { title, sub } = PAGE_TITLES[activePage];

  return (
    <div className={styles.layout}>
      <Sidebar
        active={activePage}
        onNavigate={setActivePage}
        onLogout={onLogout}
        unreadNotifications={3}
      />

      <div className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <h1 className={styles.pageTitle}>{title}</h1>
            <span className={styles.pageSub}>{sub}</span>
          </div>
          <div className={styles.topbarRight}>
            <button
              className={styles.iconBtn}
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        {/* Conteúdo — páginas com layout próprio usam contentFull */}
        <main className={
          activePage === 'datasources' || activePage === 'storage' || activePage === 'backup-jobs' || activePage === 'executions'
            ? styles.contentFull
            : styles.content
        }>
          {activePage === 'dashboard'    && <DashboardContent />}
          {activePage === 'datasources'  && <DatasourcesPage />}
          {activePage === 'storage'      && <StoragePage />}
          {activePage === 'backup-jobs'  && <BackupJobsPage />}
          {activePage === 'executions'   && <ExecutionsPage />}
          {activePage !== 'dashboard' && activePage !== 'datasources' && activePage !== 'storage' && activePage !== 'backup-jobs' && activePage !== 'executions' && (
            <EmptyPage page={activePage} />
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Conteúdo do Dashboard ──────────────────────────────────── */
function DashboardContent() {
  return (
    <>
      {/* Cards de estatísticas */}
      <div className={styles.statsGrid}>
        {STATS.map((stat) => (
          <div className={styles.statCard} key={stat.label}>
            <div className={`${styles.statIconWrap} ${styles[stat.variant]}`}>
              {stat.icon}
            </div>
            <div className={styles.statBody}>
              <p className={styles.statValue}>{stat.value}</p>
              <p className={styles.statLabel}>{stat.label}</p>
              <p className={`${styles.statDelta} ${styles.neutral}`}>{stat.delta}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabela de execuções recentes */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Execuções Recentes</h2>
          <button className={styles.sectionAction}>Ver todas →</button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Datasource</th>
                <th>Job</th>
                <th>Status</th>
                <th>Tamanho</th>
                <th>Duração</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {EXECUTIONS.map((row) => (
                <tr key={row.id}>
                  <td>{row.datasource}</td>
                  <td><span className={styles.textMuted}>{row.job}</span></td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>{row.size}</td>
                  <td>{row.duration}</td>
                  <td className={styles.textMuted}>{row.ago}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid inferior: jobs + health */}
      <div className={styles.bottomGrid}>
        {/* Próximos jobs */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Próximos Backups</h2>
            <button className={styles.sectionAction}>Gerenciar →</button>
          </div>
          {JOBS.map((job) => (
            <div className={styles.jobItem} key={job.name}>
              <div className={styles.jobItemLeft}>
                <span className={styles.jobItemName}>{job.name}</span>
                <span className={styles.jobItemMeta}>{job.cron} · {job.nextRun}</span>
              </div>
              <StatusBadge status={job.enabled ? 'success' : 'warning'} label={job.enabled ? 'Ativo' : 'Inativo'} />
            </div>
          ))}
        </div>

        {/* Health checks */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Health Check</h2>
            <button className={styles.sectionAction}>Detalhes →</button>
          </div>
          {HEALTH_CHECKS.map((hc) => (
            <div className={styles.healthRow} key={hc.name}>
              <span className={`${styles.healthDot} ${styles[hc.status]}`} />
              <span className={styles.healthName}>{hc.name}</span>
              <span className={styles.healthLatency}>{hc.latency}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── Placeholder para páginas ainda não implementadas ─────── */
function EmptyPage({ page }: { page: NavKey }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      gap: '12px',
      color: 'var(--color-text-muted)',
    }}>
      <EmptyPageIcon />
      <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
        {PAGE_TITLES[page].title}
      </p>
      <p style={{ fontSize: 'var(--font-size-sm)' }}>
        Esta seção será implementada em breve.
      </p>
    </div>
  );
}

