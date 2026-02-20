import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiBackupJob, ApiDatasource, ApiStorageLocation } from '../../services/api';
import {
  CheckIcon,  InfoIcon,
  DbIcon,
  StorageIcon,
  ClockIcon,
  RetentionIcon,
} from '../../components/Icons';
import Modal from '../../components/Modal/Modal';
import { DS_ABBR, SL_ABBR } from '../../constants';
import styles from './JobFormModal.module.css';

export type BackupType = 'full' | 'incremental' | 'differential';
type Frequency = 'daily' | 'weekly' | 'monthly';

interface JobPayload {
  name: string;
  datasource_id: string;
  storage_location_id: string;
  schedule_cron: string;
  schedule_timezone: string;
  enabled: boolean;
  retention_policy: {
    max_backups: number;
    auto_delete: boolean;
  };
  backup_options: {
    compression: 'gzip' | 'zstd' | 'lz4' | 'none';
    compression_level?: number;
    parallel_jobs?: number;
    exclude_tables?: string[];
    include_tables?: string[];
    max_file_size_mb?: number;
    storage_strategy?: 'replicate' | 'fallback';
    storage_targets?: Array<{
      storage_location_id: string;
      order: number;
    }>;
  };
}

interface Props {
  job: ApiBackupJob | null;
  datasources: ApiDatasource[];
  storages: ApiStorageLocation[];
  saving: boolean;
  onClose: () => void;
  onSave: (payload: JobPayload, id?: string) => Promise<void>;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

const BACKUP_TYPES: { value: BackupType; label: string; desc: string }[] = [
  { value: 'full', label: 'Completo', desc: 'Copia todos os dados a cada execução' },
  { value: 'incremental', label: 'Incremental', desc: 'Apenas o que mudou desde o último backup' },
  { value: 'differential', label: 'Diferencial', desc: 'Mudanças desde o último backup completo' },
];

function parseCron(cron: string) {
  const [minRaw = '0', hourRaw = '2', domRaw = '*', _monthRaw = '*', dowRaw = '*'] = cron.split(' ');
  const minute = Number(minRaw) || 0;
  const hour = Number(hourRaw) || 2;

  if (domRaw !== '*' && dowRaw === '*') {
    return {
      frequency: 'monthly' as Frequency,
      hour,
      minute,
      daysOfWeek: [1],
      dayOfMonth: Number(domRaw) || 1,
    };
  }

  if (dowRaw !== '*' && domRaw === '*') {
    const days = dowRaw.split(',').map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);
    return {
      frequency: 'weekly' as Frequency,
      hour,
      minute,
      daysOfWeek: days.length > 0 ? days : [1],
      dayOfMonth: 1,
    };
  }

  return {
    frequency: 'daily' as Frequency,
    hour,
    minute,
    daysOfWeek: [1],
    dayOfMonth: 1,
  };
}

function buildCron(frequency: Frequency, hour: number, minute: number, daysOfWeek: number[], dayOfMonth: number) {
  if (frequency === 'monthly') {
    return `${minute} ${hour} ${dayOfMonth} * *`;
  }
  if (frequency === 'weekly') {
    const dow = [...new Set(daysOfWeek)].sort((a, b) => a - b).join(',') || '1';
    return `${minute} ${hour} * * ${dow}`;
  }
  return `${minute} ${hour} * * *`;
}

export default function JobFormModal({
  job,
  datasources,
  storages,
  saving,
  onClose,
  onSave,
}: Props) {
  const parsed = parseCron(job?.schedule_cron ?? '0 2 * * *');
  const initialTargets = (
    job?.storage_targets
    ?? job?.backup_options?.storage_targets
    ?? (job?.storage_location_id ? [{ storage_location_id: job.storage_location_id, order: 1 }] : [])
  )
    .map((t) => ({
      storage_location_id: t.storage_location_id,
      order: Number(t.order) || 1,
    }))
    .sort((a, b) => a.order - b.order);

  const [name, setName] = useState(job?.name ?? '');
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [datasourceId, setDatasourceId] = useState(job?.datasource_id ?? '');
  const [storageTargets, setStorageTargets] = useState(initialTargets);
  const [storageToAddId, setStorageToAddId] = useState('');
  const [storageStrategy, setStorageStrategy] = useState<'replicate' | 'fallback'>(
    job?.storage_strategy ?? job?.backup_options?.storage_strategy ?? 'fallback',
  );
  const [backupType, setBackupType] = useState<BackupType>('full');

  const [frequency, setFrequency] = useState<Frequency>(parsed.frequency);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(parsed.daysOfWeek);
  const [dayOfMonth, setDayOfMonth] = useState(parsed.dayOfMonth);

  const initialMaxBackups = Number(
    job?.retention_policy?.max_backups
      ?? (
        Number(job?.retention_policy?.keep_daily ?? 7)
        + Number(job?.retention_policy?.keep_weekly ?? 4)
        + Number(job?.retention_policy?.keep_monthly ?? 12)
      ),
  );
  const [maxBackups, setMaxBackups] = useState(Number.isFinite(initialMaxBackups) ? Math.max(1, initialMaxBackups) : 23);
  const [autoDelete, setAutoDelete] = useState(Boolean(job?.retention_policy?.auto_delete ?? true));

  const [compression, setCompression] = useState<'gzip' | 'zstd' | 'lz4' | 'none'>(
    job?.backup_options?.compression ?? 'gzip',
  );

  const isValid = useMemo(() => {
    if (!name.trim()) return false;
    if (!datasourceId) return false;
    if (storageTargets.length === 0) return false;
    if (frequency === 'weekly' && daysOfWeek.length === 0) return false;
    if (frequency === 'monthly' && (dayOfMonth < 1 || dayOfMonth > 28)) return false;
    return true;
  }, [name, datasourceId, storageTargets.length, frequency, daysOfWeek, dayOfMonth]);

  function addStorageTarget() {
    if (!storageToAddId) return;
    if (storageTargets.some((t) => t.storage_location_id === storageToAddId)) return;
    setStorageTargets((prev) => [
      ...prev,
      { storage_location_id: storageToAddId, order: prev.length + 1 },
    ]);
    setStorageToAddId('');
  }

  function moveTarget(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= storageTargets.length) return;
    const next = [...storageTargets];
    const [moved] = next.splice(index, 1);
    next.splice(newIndex, 0, moved);
    setStorageTargets(next.map((t, i) => ({ ...t, order: i + 1 })));
  }

  function removeTarget(storageLocationId: string) {
    const next = storageTargets
      .filter((t) => t.storage_location_id !== storageLocationId)
      .map((t, i) => ({ ...t, order: i + 1 }));
    setStorageTargets(next);
  }

  async function handleSave() {
    if (!isValid) return;

    const payload: JobPayload = {
      name: name.trim(),
      datasource_id: datasourceId,
      storage_location_id: storageTargets[0].storage_location_id,
      schedule_cron: buildCron(frequency, hour, minute, daysOfWeek, dayOfMonth),
      schedule_timezone: 'UTC',
      enabled,
      retention_policy: {
        max_backups: maxBackups,
        auto_delete: autoDelete,
      },
      backup_options: {
        compression,
        storage_strategy: storageStrategy,
        storage_targets: storageTargets.map((t, index) => ({
          storage_location_id: t.storage_location_id,
          order: index + 1,
        })),
      },
    };

    await onSave(payload, job?.id);
  }

  const footerContent = (
    <>
      <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancelar</button>
      <button className={styles.saveBtn} onClick={() => void handleSave()} disabled={!isValid || saving}>
        {saving ? 'Salvando...' : job ? 'Salvar alterações' : 'Criar job'}
      </button>
    </>
  );

  return (
    <Modal
      title={job ? 'Editar Job' : 'Novo Backup Job'}
      subtitle="Configure o agendamento, origem e destino do backup"
      onClose={onClose}
      footer={footerContent}
      size="lg"
    >
      <Section icon={<InfoIcon />} title="Informações gerais">
        <div className={styles.field}>
          <label className={styles.label}>Nome do job *</label>
          <input
            className={styles.input}
            type="text"
            placeholder="Ex: Postgres - Backup Diário"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Tipo de backup</label>
          <div className={styles.radioCards}>
            {BACKUP_TYPES.map(bt => (
              <button
                key={bt.value}
                className={`${styles.radioCard} ${backupType === bt.value ? styles.radioCardActive : ''}`}
                onClick={() => setBackupType(bt.value)}
                type="button"
              >
                <span className={styles.radioCardLabel}>{bt.label}</span>
                <span className={styles.radioCardDesc}>{bt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <label className={styles.checkLabel}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          <span>Job ativo (será agendado automaticamente)</span>
        </label>
      </Section>

      <Section icon={<DbIcon />} title="Datasource de origem">
        <div className={styles.dsGrid}>
          {datasources.map(ds => (
            <button
              key={ds.id}
              className={`${styles.dsCard} ${datasourceId === ds.id ? styles.dsCardActive : ''}`}
              onClick={() => setDatasourceId(ds.id)}
              type="button"
            >
              <span className={`${styles.dsCardIcon} ${styles[ds.type]}`}>
                {DS_ABBR[ds.type]}
              </span>
              <span className={styles.dsCardName}>{ds.name}</span>
              <span className={`${styles.dsCardStatus} ${styles[ds.status]}`} />
              {datasourceId === ds.id && <span className={styles.dsCardCheck}><CheckIcon /></span>}
            </button>
          ))}
        </div>
      </Section>

      <Section icon={<StorageIcon />} title="Storage de destino">
        <div className={styles.addTargetRow}>
          <select
            className={styles.select}
            value={storageToAddId}
            onChange={(e) => setStorageToAddId(e.target.value)}
          >
            <option value="">Selecione um storage...</option>
            {storages
              .filter((s) => !storageTargets.some((t) => t.storage_location_id === s.id))
              .map(sl => (
              <option key={sl.id} value={sl.id}>{sl.name}</option>
              ))}
          </select>
          <button type="button" className={styles.addTargetBtn} onClick={addStorageTarget} disabled={!storageToAddId}>
            Adicionar
          </button>
        </div>

        <div className={styles.targetList}>
          {storageTargets.length === 0 && (
            <p className={styles.emptyTargets}>Selecione pelo menos um storage de destino.</p>
          )}

          {storageTargets.map((target, index) => {
            const sl = storages.find((s) => s.id === target.storage_location_id);
            if (!sl) return null;
            return (
              <div key={target.storage_location_id} className={styles.targetRow}>
                <div className={styles.targetOrder}>
                  <button
                    type="button"
                    className={styles.orderBtn}
                    onClick={() => moveTarget(index, -1)}
                    disabled={index === 0}
                    aria-label="Mover para cima"
                  >
                    Up
                  </button>
                  <span className={styles.orderNum}>{index + 1}</span>
                  <button
                    type="button"
                    className={styles.orderBtn}
                    onClick={() => moveTarget(index, 1)}
                    disabled={index === storageTargets.length - 1}
                    aria-label="Mover para baixo"
                  >
                    Dn
                  </button>
                </div>

                <span className={`${styles.slBadge} ${styles[sl.type]}`}>{SL_ABBR[sl.type]}</span>
                <div className={styles.targetInfo}>
                  <span className={styles.targetName}>{sl.name}</span>
                  {index === 0 && <span className={styles.primaryLabel}>primario</span>}
                </div>

                <button
                  type="button"
                  className={styles.removeTarget}
                  onClick={() => removeTarget(target.storage_location_id)}
                  aria-label="Remover target"
                >
                  X
                </button>
              </div>
            );
          })}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Estrategia de gravacao</label>
          <div className={styles.freqTabs}>
            <button
              type="button"
              className={`${styles.freqTab} ${storageStrategy === 'fallback' ? styles.freqTabActive : ''}`}
              onClick={() => setStorageStrategy('fallback')}
            >
              Fallback
            </button>
            <button
              type="button"
              className={`${styles.freqTab} ${storageStrategy === 'replicate' ? styles.freqTabActive : ''}`}
              onClick={() => setStorageStrategy('replicate')}
            >
              Replicar
            </button>
          </div>
          <p className={styles.sectionHint}>
            Fallback: salva no primeiro storage disponivel. Replicar: tenta salvar em todos os storages.
          </p>
        </div>
      </Section>

      <Section icon={<ClockIcon />} title="Agendamento">
        <div className={styles.field}>
          <label className={styles.label}>Frequência</label>
          <div className={styles.freqTabs}>
            {(['daily', 'weekly', 'monthly'] as Frequency[]).map(f => (
              <button
                key={f}
                className={`${styles.freqTab} ${frequency === f ? styles.freqTabActive : ''}`}
                onClick={() => setFrequency(f)}
                type="button"
              >
                {f === 'daily' ? 'Diário' : f === 'weekly' ? 'Semanal' : 'Mensal'}
              </button>
            ))}
          </div>
        </div>

        {frequency === 'weekly' && (
          <div className={styles.field}>
            <label className={styles.label}>Dias da semana</label>
            <div className={styles.dowGrid}>
              {WEEKDAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.dowBtn} ${daysOfWeek.includes(i) ? styles.dowActive : ''}`}
                  onClick={() => setDaysOfWeek(prev =>
                    prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i],
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {frequency === 'monthly' && (
          <div className={styles.field}>
            <label className={styles.label}>Dia do mês</label>
            <input
              className={`${styles.input} ${styles.inputSm}`}
              type="number"
              min="1"
              max="28"
              value={dayOfMonth}
              onChange={e => setDayOfMonth(Number(e.target.value))}
            />
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Horário (UTC)</label>
          <div className={styles.timeRow}>
            <select className={styles.select} value={hour} onChange={e => setHour(Number(e.target.value))}>
              {HOURS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
              ))}
            </select>
            <span className={styles.timeSep}>:</span>
            <select className={styles.select} value={minute} onChange={e => setMinute(Number(e.target.value))}>
              {MINUTES.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section icon={<RetentionIcon />} title="Política de retenção">
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={autoDelete} onChange={(e) => setAutoDelete(e.target.checked)} />
          <span>Auto delete habilitado</span>
        </label>

        <div className={styles.retentionGrid}>
          <RetentionField
            label="Maximo de backups por banco"
            value={maxBackups}
            onChange={(value) => setMaxBackups(Math.max(1, value))}
          />
        </div>

        <p className={styles.sectionHint}>
          Exemplo: limite 3. Quando o 4o backup concluir, o mais antigo sera removido.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Compressão</label>
          <select className={styles.select} value={compression} onChange={(e) => setCompression(e.target.value as typeof compression)}>
            <option value="gzip">gzip</option>
            <option value="zstd">zstd</option>
            <option value="lz4">lz4</option>
            <option value="none">none</option>
          </select>
        </div>
      </Section>
    </Modal>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon}>{icon}</span>
        <h3 className={styles.sectionTitle}>{title}</h3>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

function RetentionField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className={styles.retField}>
      <label className={styles.retLabel}>{label}</label>
      <div className={styles.retControl}>
        <button className={styles.retBtn} onClick={() => onChange(Math.max(1, value - 1))} type="button">-</button>
        <span className={styles.retValue}>{value}</span>
        <button className={styles.retBtn} onClick={() => onChange(value + 1)} type="button">+</button>
      </div>
    </div>
  );
}





