import { useState } from 'react';
import type { MockBackupJob, StorageTarget, BackupType, Frequency } from './mockData';
import { DS_OPTIONS, SL_OPTIONS } from './mockData';
import { DS_ABBR, SL_ABBR } from '../../constants';
import {
  CheckIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  InfoIcon,
  DbIcon,
  StorageIcon,
  ClockIcon,
  RetentionIcon,
} from '../../components/Icons';
import Modal from '../../components/Modal/Modal';
import styles from './JobFormModal.module.css';

interface Props {
  job:     MockBackupJob | null;   // null = criando novo
  onClose: () => void;
  onSave:  (job: MockBackupJob) => void;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS    = Array.from({ length: 24 }, (_, i) => i);
const MINUTES  = [0, 15, 30, 45];

const BACKUP_TYPES: { value: BackupType; label: string; desc: string }[] = [
  { value: 'full',          label: 'Completo',      desc: 'Copia todos os dados a cada execução' },
  { value: 'incremental',   label: 'Incremental',   desc: 'Apenas o que mudou desde o último backup' },
  { value: 'differential',  label: 'Diferencial',   desc: 'Mudanças desde o último backup completo' },
];

export default function JobFormModal({ job, onClose, onSave }: Props) {
  // ── Estado do formulário ────────────────────────────────────────
  const [name, setName]             = useState(job?.name ?? '');
  const [enabled, setEnabled]       = useState(job?.enabled ?? true);
  const [datasourceId, setDs]       = useState(job?.datasourceId ?? '');
  const [backupType, setBt]         = useState<BackupType>(job?.backupType ?? 'full');

  // Storages com ordem
  const [targets, setTargets]       = useState<StorageTarget[]>(
    job?.storageTargets ?? [],
  );

  // Agendamento
  const [frequency, setFreq]        = useState<Frequency>(job?.schedule.frequency ?? 'daily');
  const [hour, setHour]             = useState(job?.schedule.hour ?? 2);
  const [minute, setMinute]         = useState(job?.schedule.minute ?? 0);
  const [daysOfWeek, setDow]        = useState<number[]>(job?.schedule.daysOfWeek ?? [1]);
  const [dayOfMonth, setDom]        = useState(job?.schedule.dayOfMonth ?? 1);

  // Retenção
  const [retDaily, setRetDaily]     = useState(job?.retention.daily ?? 7);
  const [retWeekly, setRetWeekly]   = useState(job?.retention.weekly ?? 4);
  const [retMonthly, setRetMonthly] = useState(job?.retention.monthly ?? 12);

  // UI state
  const [storageToAdd, setStorageToAdd] = useState('');

  // ── Lógica de storages ──────────────────────────────────────────
  const addStorage = () => {
    if (!storageToAdd || targets.find(t => t.storageId === storageToAdd)) return;
    setTargets(prev => [
      ...prev,
      { storageId: storageToAdd, order: prev.length + 1, replicate: prev.length === 0 },
    ]);
    setStorageToAdd('');
  };

  const removeStorage = (id: string) => {
    setTargets(prev => {
      const next = prev.filter(t => t.storageId !== id);
      return next.map((t, i) => ({ ...t, order: i + 1 }));
    });
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setTargets(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((t, i) => ({ ...t, order: i + 1 }));
    });
  };

  const moveDown = (idx: number) => {
    setTargets(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next.map((t, i) => ({ ...t, order: i + 1 }));
    });
  };

  const toggleReplicate = (id: string) =>
    setTargets(prev => prev.map(t => t.storageId === id ? { ...t, replicate: !t.replicate } : t));

  // ── Submit ──────────────────────────────────────────────────────
  const handleSave = () => {
    const base: MockBackupJob = {
      id:           job?.id ?? '',
      name,
      enabled,
      datasourceId,
      storageTargets: targets,
      schedule:     {
        frequency,
        hour,
        minute,
        ...(frequency === 'weekly'  ? { daysOfWeek } : {}),
        ...(frequency === 'monthly' ? { dayOfMonth } : {}),
      },
      backupType,
      retention:    { daily: retDaily, weekly: retWeekly, monthly: retMonthly },
      lastExecution:   job?.lastExecution ?? null,
      nextExecutionAt: job?.nextExecutionAt ?? new Date().toISOString(),
      createdAt:       job?.createdAt ?? new Date().toISOString(),
    };
    onSave(base);
  };

  const isValid = name.trim() && datasourceId && targets.length > 0;

  const availableStorages = SL_OPTIONS.filter(s => !targets.find(t => t.storageId === s.id));

  // ── Footer ────────────────────────────────────────────────────────
  const footerContent = (
    <>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
      <button
        className={styles.saveBtn}
        onClick={handleSave}
        disabled={!isValid}
      >
        {job ? 'Salvar alterações' : 'Criar job'}
      </button>
    </>
  );

  // ── UI ──────────────────────────────────────────────────────────
  return (
    <Modal
      title={job ? 'Editar Job' : 'Novo Backup Job'}
      subtitle="Configure o agendamento, origem e destino do backup"
      onClose={onClose}
      footer={footerContent}
      size="lg"
    >
      {/* ── Seção 1: Informações básicas ─────────────────────── */}
      <Section icon={<InfoIcon />} title="Informações gerais">
        <div className={styles.field}>
          <label className={styles.label}>Nome do job *</label>
          <input
            className={styles.input}
            type="text"
            placeholder="Ex: Postgres — Backup Diário"
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
                onClick={() => setBt(bt.value)}
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

      {/* ── Seção 2: Banco de dados ──────────────────────────── */}
      <Section icon={<DbIcon />} title="Banco de dados de origem">
        <div className={styles.dsGrid}>
          {DS_OPTIONS.map(ds => (
            <button
              key={ds.id}
              className={`${styles.dsCard} ${datasourceId === ds.id ? styles.dsCardActive : ''}`}
              onClick={() => setDs(ds.id)}
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

      {/* ── Seção 3: Destinos de armazenamento ───────────────── */}
      <Section icon={<StorageIcon />} title="Destinos de armazenamento">
        <p className={styles.sectionHint}>
          Adicione um ou mais locais. Arraste para definir a ordem de prioridade.
          Marque <strong>Replicar</strong> para guardar cópias em paralelo.
        </p>

        {/* Lista de storages selecionados */}
        {targets.length === 0 && (
          <p className={styles.emptyTargets}>Nenhum destino adicionado ainda.</p>
        )}

        <div className={styles.targetList}>
          {targets.map((t, idx) => {
            const sl = SL_OPTIONS.find(s => s.id === t.storageId);
            return (
              <div key={t.storageId} className={styles.targetRow}>
                <div className={styles.targetOrder}>
                  <button className={styles.orderBtn} onClick={() => moveUp(idx)} disabled={idx === 0}><ChevronUpIcon /></button>
                  <span className={styles.orderNum}>{idx + 1}</span>
                  <button className={styles.orderBtn} onClick={() => moveDown(idx)} disabled={idx === targets.length - 1}><ChevronDownIcon /></button>
                </div>

                <span className={`${styles.slBadge} ${styles[sl?.type ?? '']}`}>
                  {SL_ABBR[sl?.type ?? ''] ?? '?'}
                </span>

                <div className={styles.targetInfo}>
                  <span className={styles.targetName}>{sl?.name}</span>
                  {idx === 0 && <span className={styles.primaryLabel}>Primário</span>}
                </div>

                <label className={styles.replicateToggle} title="Replicar backup neste destino em paralelo">
                  <input
                    type="checkbox"
                    checked={t.replicate}
                    onChange={() => toggleReplicate(t.storageId)}
                  />
                  <span>Replicar</span>
                </label>

                <button
                  className={styles.removeTarget}
                  onClick={() => removeStorage(t.storageId)}
                  title="Remover destino"
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}
        </div>

        {/* Adicionar novo destino */}
        {availableStorages.length > 0 && (
          <div className={styles.addTargetRow}>
            <select
              className={styles.select}
              value={storageToAdd}
              onChange={e => setStorageToAdd(e.target.value)}
            >
              <option value="">Selecione um storage…</option>
              {availableStorages.map(sl => (
                <option key={sl.id} value={sl.id}>{sl.name}</option>
              ))}
            </select>
            <button
              className={styles.addTargetBtn}
              onClick={addStorage}
              disabled={!storageToAdd}
            >
              <PlusIcon /> Adicionar
            </button>
          </div>
        )}
      </Section>

      {/* ── Seção 4: Agendamento ─────────────────────────────── */}
      <Section icon={<ClockIcon />} title="Agendamento">
        {/* Frequência */}
        <div className={styles.field}>
          <label className={styles.label}>Frequência</label>
          <div className={styles.freqTabs}>
            {(['daily', 'weekly', 'monthly'] as Frequency[]).map(f => (
              <button
                key={f}
                className={`${styles.freqTab} ${frequency === f ? styles.freqTabActive : ''}`}
                onClick={() => setFreq(f)}
                type="button"
              >
                {f === 'daily' ? 'Diário' : f === 'weekly' ? 'Semanal' : 'Mensal'}
              </button>
            ))}
          </div>
        </div>

        {/* Dias da semana (se weekly) */}
        {frequency === 'weekly' && (
          <div className={styles.field}>
            <label className={styles.label}>Dias da semana</label>
            <div className={styles.dowGrid}>
              {WEEKDAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.dowBtn} ${daysOfWeek.includes(i) ? styles.dowActive : ''}`}
                  onClick={() => setDow(prev =>
                    prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dia do mês (se monthly) */}
        {frequency === 'monthly' && (
          <div className={styles.field}>
            <label className={styles.label}>Dia do mês</label>
            <input
              className={`${styles.input} ${styles.inputSm}`}
              type="number"
              min="1"
              max="28"
              value={dayOfMonth}
              onChange={e => setDom(Number(e.target.value))}
            />
            <span className={styles.fieldHint}>Use no máximo 28 para funcionar em todos os meses.</span>
          </div>
        )}

        {/* Horário */}
        <div className={styles.field}>
          <label className={styles.label}>Horário de execução</label>
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
            <span className={styles.timeHint}>Horário do servidor (UTC)</span>
          </div>
        </div>
      </Section>

      {/* ── Seção 5: Retenção ─────────────────────────────────── */}
      <Section icon={<RetentionIcon />} title="Política de retenção">
        <p className={styles.sectionHint}>
          Define quantos backups manter de cada tipo antes de apagar os mais antigos automaticamente.
        </p>
        <div className={styles.retentionGrid}>
          <RetentionField label="Backups diários" value={retDaily}   onChange={setRetDaily}   />
          <RetentionField label="Backups semanais" value={retWeekly}  onChange={setRetWeekly}  />
          <RetentionField label="Backups mensais"  value={retMonthly} onChange={setRetMonthly} />
        </div>
      </Section>
    </Modal>
  );
}

/* ── Componentes auxiliares ──────────────────────────────────────── */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
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
        <button className={styles.retBtn} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
        <span className={styles.retValue}>{value === 0 ? '∞' : value}</span>
        <button className={styles.retBtn} onClick={() => onChange(value + 1)}>+</button>
      </div>
      <span className={styles.retHint}>{value === 0 ? 'sem limite' : `${value} backup${value !== 1 ? 's' : ''}`}</span>
    </div>
  );
}
