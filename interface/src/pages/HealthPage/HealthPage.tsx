import { useCallback, useEffect, useMemo, useState } from 'react';
import { healthApi } from '../../services/api';
import type {
  ApiSystemHealth,
  ApiDatasourceHealthEntry,
  ApiStorageHealthEntry,
} from '../../services/api';
import { SpinnerIcon, ClockIcon, AlertTriangleIcon, ServerIcon, DatabaseIcon } from '../../components/Icons';
import styles from './HealthPage.module.css';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export default function HealthPage() {
  const [system, setSystem] = useState<ApiSystemHealth | null>(null);
  const [datasourceChecks, setDatasourceChecks] = useState<ApiDatasourceHealthEntry[]>([]);
  const [storageChecks, setStorageChecks] = useState<ApiStorageHealthEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      const [systemRes, datasourceRes, storageRes] = await Promise.all([
        healthApi.system(),
        healthApi.datasources(),
        healthApi.storage(),
      ]);

      setSystem(systemRes);
      setDatasourceChecks(datasourceRes.data);
      setStorageChecks(storageRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados de health.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadData(true);
    }, 30000);

    return () => clearInterval(timer);
  }, [loadData]);

  const datasourceSummary = useMemo(() => {
    const ok = datasourceChecks.filter((item) => item.status === 'ok').length;
    return {
      ok,
      total: datasourceChecks.length,
    };
  }, [datasourceChecks]);

  const storageSummary = useMemo(() => {
    const ok = storageChecks.filter((item) => item.status === 'ok').length;
    return {
      ok,
      total: storageChecks.length,
    };
  }, [storageChecks]);

  if (loading) {
    return (
      <div className={styles.centerState}>
        <SpinnerIcon width={16} height={16} />
        Carregando health...
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centerState}>
        <AlertTriangleIcon width={16} height={16} />
        {error}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Monitoramento de Health</h2>
          <p className={styles.subtitle}>Verificação automática de bancos e storages em segundo plano.</p>
        </div>
        <button className={styles.refreshBtn} onClick={() => void loadData(true)} disabled={refreshing}>
          {refreshing ? <SpinnerIcon width={14} height={14} /> : <ClockIcon width={14} height={14} />}
          {refreshing ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {system && (
        <div className={styles.metricsCard}>
          <div>
            <h3 className={styles.sectionTitle}>Prometheus Metrics</h3>
            <p className={styles.tableMeta}>Endpoint nativo para scraping e observabilidade.</p>
          </div>
          <div className={styles.metricsActions}>
            <code className={styles.metricsCode}>/metrics</code>
            <button
              className={styles.refreshBtn}
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/metrics`)}
            >
              Copiar URL
            </button>
          </div>
        </div>
      )}

      {system && (
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Status geral</span>
            <div className={styles.summaryValueRow}>
              <span className={`${styles.statusBadge} ${system.status === 'ok' ? styles.ok : styles.error}`}>
                {system.status === 'ok' ? 'OK' : 'Degradado'}
              </span>
              <span className={styles.summarySub}>Uptime: {formatUptime(system.uptime_seconds)}</span>
            </div>
          </div>

          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Datasources</span>
            <div className={styles.summaryValueRow}>
              <DatabaseIcon width={16} height={16} />
              <span className={styles.summaryValue}>{system.stats.datasources_healthy}/{system.stats.datasources_total}</span>
            </div>
            <span className={styles.summarySub}>Saudáveis</span>
          </div>

          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Storages</span>
            <div className={styles.summaryValueRow}>
              <ServerIcon width={16} height={16} />
              <span className={styles.summaryValue}>{storageSummary.ok}/{storageSummary.total}</span>
            </div>
            <span className={styles.summarySub}>Saudáveis</span>
          </div>
        </div>
      )}

      {system && (
        <div className={styles.workersCard}>
          <h3 className={styles.sectionTitle}>Workers</h3>
          <div className={styles.workersGrid}>
            {Object.entries(system.services.workers).map(([name, status]) => (
              <div key={name} className={styles.workerRow}>
                <span className={styles.workerName}>{name}</span>
                <span className={`${styles.statusBadge} ${status === 'running' ? styles.ok : styles.error}`}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.tablesGrid}>
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h3 className={styles.sectionTitle}>Health dos Datasources</h3>
            <span className={styles.tableMeta}>{datasourceSummary.ok}/{datasourceSummary.total} OK</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Datasource</th>
                  <th>Status</th>
                  <th>Latência</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {datasourceChecks.length === 0 && (
                  <tr>
                    <td colSpan={4} className={styles.emptyCell}>Sem checks de datasource ainda.</td>
                  </tr>
                )}
                {datasourceChecks.map((item) => (
                  <tr key={item.id}>
                    <td>{item.datasource?.name ?? item.datasource_id}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${item.status === 'ok' ? styles.ok : styles.error}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.latency_ms !== null ? `${item.latency_ms}ms` : '-'}</td>
                    <td>{formatDate(item.checked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h3 className={styles.sectionTitle}>Health dos Storages</h3>
            <span className={styles.tableMeta}>{storageSummary.ok}/{storageSummary.total} OK</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Storage</th>
                  <th>Status</th>
                  <th>Latência</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {storageChecks.length === 0 && (
                  <tr>
                    <td colSpan={4} className={styles.emptyCell}>Sem checks de storage ainda.</td>
                  </tr>
                )}
                {storageChecks.map((item) => (
                  <tr key={item.id}>
                    <td>{item.storage_name}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${item.status === 'ok' ? styles.ok : styles.error}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.latency_ms !== null ? `${item.latency_ms}ms` : '-'}</td>
                    <td>{formatDate(item.checked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

