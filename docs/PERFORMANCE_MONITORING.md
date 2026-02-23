# Performance Monitoring

Este documento descreve os recursos de performance adicionados na aplicacao para reduzir bloqueio de event-loop e melhorar visibilidade de consumo da maquina.

## Objetivos

- reduzir impacto de tarefas CPU-bound no loop principal
- exibir dados de maquina/processo no dashboard
- facilitar diagnostico de lentidao e gargalos

## Thread Pool (`worker_threads`)

Arquivo: `src/core/performance/thread-pool.ts`

### Uso atual

- checksum SHA-256 de artefatos de backup no `backup-worker`

### Como funciona

- pool fixo de workers iniciado sob demanda
- fila interna para tarefas pendentes
- metrica de throughput e erro (`processed`, `failed`)
- fallback automatico para thread principal em caso de erro de worker

### Configuracao

- `WORKER_THREAD_POOL_SIZE`
  - `0`: desabilita pool
  - `>= 1`: numero de workers
  - default: `max(1, min(8, cpu_count - 1))`

## Monitor de Maquina/Processo

Arquivo: `src/core/performance/system-monitor.ts`

### Coleta

- CPU da maquina (`cpu_percent`)
- load average (`load_avg_1m`, `load_avg_5m`, `load_avg_15m`)
- memoria da maquina (`memory_usage_percent`)
- CPU do processo Node (`process_cpu_percent`)
- memoria do processo (`process_memory_rss_bytes`, `process_heap_used_bytes`)
- event loop lag medio (`event_loop_lag_ms`)

### Configuracao

- `SYSTEM_MONITOR_INTERVAL_MS` (default `5000`)
- `SYSTEM_MONITOR_HISTORY_SIZE` (default `120`)

## Dashboard

Endpoint: `GET /api/dashboard/overview`

Novos campos:

- `performance.machine`
- `performance.current`
- `performance.history`
- `performance.thread_pool`

## Diagnostico rapido

- CPU maquina alta + CPU processo baixa:
- gargalo externo (outras aplicacoes/host)

- CPU processo alta + event loop lag alto:
- carga pesada no processo Node

- `thread_pool.queued` crescendo continuamente:
- tarefas CPU-bound acima da capacidade do pool
- considerar aumentar `WORKER_THREAD_POOL_SIZE` com cuidado

- RSS alto e heap alto:
- investigar retencao de objetos em memoria

