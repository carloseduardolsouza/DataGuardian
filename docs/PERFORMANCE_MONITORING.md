# :bookmark: Performance Monitoring - DataGuardian

> Recursos de performance para reduzir bloqueio do event-loop e aumentar visibilidade operacional.

## :bookmark: Objetivos

- Reduzir impacto de tarefas CPU-bound no loop principal
- Exibir dados de máquina/processo no dashboard
- Facilitar diagnóstico de lentidão e gargalos

## :bookmark: Thread Pool (`worker_threads`)

Arquivo: `src/core/performance/thread-pool.ts`

### Uso atual

- Checksum SHA-256 de artefatos de backup no `backup-worker`

### Como funciona

- Pool fixo de workers iniciado sob demanda
- Fila interna para tarefas pendentes
- Métricas de throughput e erro (`processed`, `failed`)
- Fallback automático para thread principal em caso de erro de worker

### Configuração

- `WORKER_THREAD_POOL_SIZE`
- `0`: desabilita pool
- `>= 1`: número de workers
- Default: `max(1, min(8, cpu_count - 1))`

## :sparkles: Monitor de Máquina/Processo

Arquivo: `src/core/performance/system-monitor.ts`

### Coleta

- CPU da máquina (`cpu_percent`)
- Load average (`load_avg_1m`, `load_avg_5m`, `load_avg_15m`)
- Memória da máquina (`memory_usage_percent`)
- CPU do processo Node (`process_cpu_percent`)
- Memória do processo (`process_memory_rss_bytes`, `process_heap_used_bytes`)
- Event loop lag médio (`event_loop_lag_ms`)

### Configuração

- `SYSTEM_MONITOR_INTERVAL_MS` (default `5000`)
- `SYSTEM_MONITOR_HISTORY_SIZE` (default `120`)

## :bookmark: Dashboard

Endpoint: `GET /api/dashboard/overview`

Campos adicionados:

- `performance.machine`
- `performance.current`
- `performance.history`
- `performance.thread_pool`

## :bookmark: Diagnóstico rápido

- CPU da máquina alta + CPU do processo baixa: gargalo externo (outras aplicações/host)
- CPU do processo alta + event loop lag alto: carga pesada no processo Node
- `thread_pool.queued` crescendo continuamente: tarefas CPU-bound acima da capacidade do pool
- RSS alto e heap alto: investigar retenção excessiva de objetos em memória

