import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar, { ROUTE_PATHS, type NavKey } from '../../components/Sidebar/Sidebar';
import {
  DatabaseStatIcon,
  JobStatIcon,
  ExecutionStatIcon,
  DangerStatIcon,
  SunIcon,
  MoonIcon,
  EmptyPageIcon,
} from '../../components/Icons';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import DatasourcesPage from '../DatasourcesPage/DatasourcesPage';
import StoragePage from '../StoragePage/StoragePage';
import BackupJobsPage from '../BackupJobsPage/BackupJobsPage';
import BackupsPage from '../BackupsPage/BackupsPage';
import ExecutionsPage from '../ExecutionsPage/ExecutionsPage';
import HealthPage from '../HealthPage/HealthPage';
import SettingsPage from '../SettingsPage/SettingsPage';
import NotificationsPage from '../NotificationsPage/NotificationsPage';
import { dashboardApi, notificationsApi, type ApiDashboardOverview } from '../../services/api';
import styles from './DashboardPage.module.css';

interface Props {
  activePage: NavKey;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  currentUsername?: string;
}

const PAGE_TITLES: Record<NavKey, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: 'Visao geral do sistema' },
  datasources: { title: 'Datasources', sub: 'Gerencie suas fontes de dados' },
  storage: { title: 'Storage', sub: 'Locais de armazenamento' },
  'backup-jobs': { title: 'Backup Jobs', sub: 'Gerencie seus jobs de backup' },
  backups: { title: 'Backups', sub: 'Explore backups por banco e execute restore' },
  executions: { title: 'Execucoes', sub: 'Historico de execucoes' },
  health: { title: 'Health', sub: 'Monitoramento de saude' },
  notifications: { title: 'Notificacoes', sub: 'Central de alertas' },
  settings: { title: 'Configuracoes', sub: 'Preferencias do sistema' },
};

function formatBytes(value: number | string | null) {
  if (value === null) return '—';
  const bytes = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const amount = bytes / 1024 ** index;
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(secs: number | null) {
  if (secs === null || secs <= 0) return '—';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function formatAgo(isoDate: string) {
  const date = new Date(isoDate);
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m atras`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atras`;
  const d = Math.floor(h / 24);
  return `${d}d atras`;
}

function mapHealthDot(status: 'healthy' | 'warning' | 'critical' | 'unknown') {
  if (status === 'healthy') return 'ok';
  if (status === 'warning') return 'warning';
  return 'error';
}

export default function DashboardPage({ activePage, theme, onToggleTheme, onLogout, currentUsername }: Props) {
  const [unreadCount, setUnreadCount] = useState(0);
  const { title, sub } = PAGE_TITLES[activePage];

  useEffect(() => {
    const loadUnread = async () => {
      try {
        const response = await notificationsApi.list({ limit: 1, read: 'false' });
        setUnreadCount(response.unread_count ?? 0);
      } catch {
        setUnreadCount(0);
      }
    };
    void loadUnread();
  }, []);

  return (
    <div className={styles.layout}>
      <Sidebar
        active={activePage}
        onLogout={onLogout}
        unreadNotifications={unreadCount}
        currentUsername={currentUsername}
      />

      <div className={styles.main}>
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

        <main
          className={
            activePage === 'datasources'
            || activePage === 'storage'
            || activePage === 'backup-jobs'
            || activePage === 'backups'
            || activePage === 'executions'
            || activePage === 'notifications'
              ? styles.contentFull
              : styles.content
          }
        >
          {activePage === 'dashboard' && <DashboardContent />}
          {activePage === 'datasources' && <DatasourcesPage />}
          {activePage === 'storage' && <StoragePage />}
          {activePage === 'backup-jobs' && <BackupJobsPage />}
          {activePage === 'backups' && <BackupsPage />}
          {activePage === 'executions' && <ExecutionsPage />}
          {activePage === 'health' && <HealthPage />}
          {activePage === 'notifications' && (
            <NotificationsPage onUnreadCountChange={setUnreadCount} />
          )}
          {activePage === 'settings' && <SettingsPage />}
          {activePage !== 'dashboard' && activePage !== 'datasources' && activePage !== 'storage' && activePage !== 'backup-jobs' && activePage !== 'backups' && activePage !== 'executions' && activePage !== 'health' && activePage !== 'notifications' && activePage !== 'settings' && (
            <EmptyPage page={activePage} />
          )}
        </main>
      </div>
    </div>
  );
}

function DashboardContent() {
  const navigate = useNavigate();
  const [data, setData] = useState<ApiDashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    try {
      setError(null);
      const response = await dashboardApi.overview();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
    const timer = setInterval(() => {
      void loadOverview();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    if (!data) {
      return [
        { label: 'Datasources', value: 0, delta: '0 saudaveis', variant: 'primary' as const, icon: <DatabaseStatIcon /> },
        { label: 'Jobs Ativos', value: 0, delta: '0 no total', variant: 'success' as const, icon: <JobStatIcon /> },
        { label: 'Execucoes Hoje', value: 0, delta: 'taxa 0%', variant: 'warning' as const, icon: <ExecutionStatIcon /> },
        { label: 'Falhas Hoje', value: 0, delta: '0 em 24h', variant: 'danger' as const, icon: <DangerStatIcon /> },
      ];
    }

    return [
      {
        label: 'Datasources',
        value: data.stats.datasources_total,
        delta: `${data.stats.datasources_healthy} saudaveis`,
        variant: 'primary' as const,
        icon: <DatabaseStatIcon />,
      },
      {
        label: 'Jobs Ativos',
        value: data.stats.jobs_enabled,
        delta: `${data.stats.jobs_total} no total`,
        variant: 'success' as const,
        icon: <JobStatIcon />,
      },
      {
        label: 'Execucoes Hoje',
        value: data.stats.executions_today,
        delta: `taxa de sucesso ${data.stats.success_rate_24h}% (24h)`,
        variant: 'warning' as const,
        icon: <ExecutionStatIcon />,
      },
      {
        label: 'Falhas Hoje',
        value: data.stats.executions_failed_today,
        delta: `${data.stats.executions_24h_total} execucoes nas ultimas 24h`,
        variant: 'danger' as const,
        icon: <DangerStatIcon />,
      },
    ];
  }, [data]);

  if (loading && !data) {
    return <div className={styles.section} style={{ padding: '20px' }}>Carregando dashboard...</div>;
  }

  return (
    <>
      {error && (
        <div className={styles.section} style={{ padding: '12px 16px', marginBottom: '16px' }}>
          <span className={styles.textMuted}>{error}</span>
          <button className={styles.sectionAction} onClick={() => void loadOverview()} style={{ marginLeft: 12 }}>
            Tentar novamente
          </button>
        </div>
      )}

      <div className={styles.statsGrid}>
        {stats.map((stat) => (
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

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Execucoes Recentes</h2>
          <button className={styles.sectionAction} onClick={() => navigate(ROUTE_PATHS.executions)}>Ver todas →</button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Datasource</th>
                <th>Job</th>
                <th>Status</th>
                <th>Tamanho</th>
                <th>Duracao</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent_executions ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.datasource_name}</td>
                  <td><span className={styles.textMuted}>{row.job_name}</span></td>
                  <td><StatusBadge status={row.status === 'completed' ? 'success' : row.status} /></td>
                  <td>{formatBytes(row.compressed_size_bytes ?? row.size_bytes)}</td>
                  <td>{formatDuration(row.duration_seconds)}</td>
                  <td className={styles.textMuted}>{formatAgo(row.created_at)}</td>
                </tr>
              ))}
              {(data?.recent_executions.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className={styles.textMuted}>Nenhuma execucao recente.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.bottomGrid}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Proximos Backups</h2>
            <button className={styles.sectionAction} onClick={() => navigate(ROUTE_PATHS['backup-jobs'])}>Gerenciar →</button>
          </div>
          {(data?.upcoming_jobs ?? []).map((job) => (
            <div className={styles.jobItem} key={job.id}>
              <div className={styles.jobItemLeft}>
                <span className={styles.jobItemName}>{job.name}</span>
                <span className={styles.jobItemMeta}>
                  {job.schedule_cron} · {job.next_execution_at ? new Date(job.next_execution_at).toLocaleString('pt-BR') : 'sem agendamento'}
                </span>
              </div>
              <StatusBadge status={job.enabled ? 'success' : 'warning'} label={job.enabled ? 'Ativo' : 'Inativo'} />
            </div>
          ))}
          {(data?.upcoming_jobs.length ?? 0) === 0 && (
            <div className={styles.jobItem}>
              <span className={styles.textMuted}>Nenhum job ativo encontrado.</span>
            </div>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Health Check</h2>
            <button className={styles.sectionAction} onClick={() => navigate(ROUTE_PATHS.health)}>Detalhes →</button>
          </div>
          {(data?.datasource_health ?? []).map((hc) => (
            <div className={styles.healthRow} key={hc.id}>
              <span className={`${styles.healthDot} ${styles[mapHealthDot(hc.status)]}`} />
              <span className={styles.healthName}>{hc.name}</span>
              <span className={styles.healthLatency}>{hc.latency_ms !== null ? `${hc.latency_ms}ms` : '—'}</span>
            </div>
          ))}
          {(data?.datasource_health.length ?? 0) === 0 && (
            <div className={styles.healthRow}>
              <span className={styles.textMuted}>Sem dados de health ainda.</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function EmptyPage({ page }: { page: NavKey }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        gap: '12px',
        color: 'var(--color-text-muted)',
      }}
    >
      <EmptyPageIcon />
      <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
        {PAGE_TITLES[page].title}
      </p>
      <p style={{ fontSize: 'var(--font-size-sm)' }}>
        Esta secao sera implementada em breve.
      </p>
    </div>
  );
}
