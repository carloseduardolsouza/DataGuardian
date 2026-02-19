import styles from './Sidebar.module.css';
import { Link } from 'react-router-dom';
import {
  LogoIcon,
  DashboardIcon,
  DatabaseIcon,
  ServerIcon,
  JobsIcon,
  PlayIcon,
  HealthIcon,
  BellIcon,
  SettingsIcon,
  LogoutIcon,
} from '../Icons';

export type NavKey =
  | 'dashboard'
  | 'datasources'
  | 'storage'
  | 'backup-jobs'
  | 'executions'
  | 'health'
  | 'notifications'
  | 'settings';

export const ROUTE_PATHS: Record<NavKey, string> = {
  dashboard: '/dashboard',
  datasources: '/datasources',
  storage: '/storage',
  'backup-jobs': '/backup-jobs',
  executions: '/executions',
  health: '/health',
  notifications: '/notifications',
  settings: '/settings',
};

interface Props {
  active: NavKey;
  onLogout: () => void;
  unreadNotifications?: number;
}

interface NavItem {
  key: NavKey;
  label: string;
  icon: React.ReactNode;
}

const mainNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { key: 'datasources', label: 'Datasources', icon: <DatabaseIcon /> },
  { key: 'storage', label: 'Storage', icon: <ServerIcon /> },
  { key: 'backup-jobs', label: 'Backup Jobs', icon: <JobsIcon /> },
  { key: 'executions', label: 'Execucoes', icon: <PlayIcon /> },
];

const systemNav: NavItem[] = [
  { key: 'health', label: 'Health', icon: <HealthIcon /> },
  { key: 'notifications', label: 'Notificacoes', icon: <BellIcon /> },
  { key: 'settings', label: 'Configuracoes', icon: <SettingsIcon /> },
];

export default function Sidebar({ active, onLogout, unreadNotifications = 0 }: Props) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.logoWrap}>
          <LogoIcon />
        </div>
        <span className={styles.brandName}>DataGuardian</span>
      </div>

      <nav className={styles.nav}>
        <div className={styles.navGroup}>
          <p className={styles.navGroupLabel}>Principal</p>
          {mainNav.map((item) => (
            <Link
              key={item.key}
              to={ROUTE_PATHS[item.key]}
              className={`${styles.navItem}${active === item.key ? ` ${styles.active}` : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>

        <div className={styles.navGroup}>
          <p className={styles.navGroupLabel}>Sistema</p>
          {systemNav.map((item) => (
            <Link
              key={item.key}
              to={ROUTE_PATHS[item.key]}
              className={`${styles.navItem}${active === item.key ? ` ${styles.active}` : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
              {item.key === 'notifications' && unreadNotifications > 0 && (
                <span className={styles.navBadge}>{unreadNotifications}</span>
              )}
            </Link>
          ))}
        </div>
      </nav>

      <div className={styles.footer}>
        <div className={styles.userRow}>
          <div className={styles.avatar}>A</div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>Admin</p>
            <p className={styles.userRole}>Administrador</p>
          </div>
        </div>
        <button className={styles.logoutBtn} onClick={onLogout}>
          <LogoutIcon />
          Sair
        </button>
      </div>
    </aside>
  );
}
