import styles from './Sidebar.module.css';

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

/* ── Ícones inline (24×24, stroke) ──────────────────────────── */

function LogoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="7" rx="9" ry="4" fill="var(--color-primary)" />
      <path d="M3 7v4c0 2.21 4.03 4 9 4s9-1.79 9-4V7" fill="var(--color-primary)" opacity="0.7" />
      <path d="M3 11v4c0 2.21 4.03 4 9 4s9-1.79 9-4v-4" fill="var(--color-primary)" opacity="0.4" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v4c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 9v4c0 1.66 4.03 3 9 3s9-1.34 9-3V9" />
      <path d="M3 13v4c0 1.66 4.03 3 9 3s9-1.34 9-3v-4" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="6" rx="2" />
      <rect x="2" y="13" width="20" height="6" rx="2" />
      <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function JobsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14.5" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polygon points="10 8 17 12 10 16" fill="currentColor" stroke="none" />
    </svg>
  );
}

function HealthIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
