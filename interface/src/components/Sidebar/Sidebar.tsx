import styles from './Sidebar.module.css';
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

interface Props {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  onLogout: () => void;
  unreadNotifications?: number;
}

interface NavItem {
  key: NavKey;
  label: string;
  icon: React.ReactNode;
}

const mainNav: NavItem[] = [
  { key: 'dashboard',    label: 'Dashboard',     icon: <DashboardIcon /> },
  { key: 'datasources',  label: 'Datasources',   icon: <DatabaseIcon /> },
  { key: 'storage',      label: 'Storage',        icon: <ServerIcon /> },
  { key: 'backup-jobs',  label: 'Backup Jobs',    icon: <JobsIcon /> },
  { key: 'executions',   label: 'Execuções',      icon: <PlayIcon /> },
];

const systemNav: NavItem[] = [
  { key: 'health',        label: 'Health',          icon: <HealthIcon /> },
  { key: 'notifications', label: 'Notificações',    icon: <BellIcon /> },
  { key: 'settings',      label: 'Configurações',   icon: <SettingsIcon /> },
];

export default function Sidebar({ active, onNavigate, onLogout, unreadNotifications = 0 }: Props) {
  return (
    <aside className={styles.sidebar}>
      {/* Cabeçalho */}
      <div className={styles.header}>
        <div className={styles.logoWrap}>
          <LogoIcon />
        </div>
        <span className={styles.brandName}>DataGuardian</span>
      </div>

      {/* Navegação */}
      <nav className={styles.nav}>
        {/* Grupo principal */}
        <div className={styles.navGroup}>
          <p className={styles.navGroupLabel}>Principal</p>
          {mainNav.map((item) => (
            <button
              key={item.key}
              className={`${styles.navItem}${active === item.key ? ` ${styles.active}` : ''}`}
              onClick={() => onNavigate(item.key)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* Grupo sistema */}
        <div className={styles.navGroup}>
          <p className={styles.navGroupLabel}>Sistema</p>
          {systemNav.map((item) => (
            <button
              key={item.key}
              className={`${styles.navItem}${active === item.key ? ` ${styles.active}` : ''}`}
              onClick={() => onNavigate(item.key)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
              {item.key === 'notifications' && unreadNotifications > 0 && (
                <span className={styles.navBadge}>{unreadNotifications}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Rodapé */}
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