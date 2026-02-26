# :bookmark: Sugestões de Melhorias - DataGuardian

> Backlog estratégico para evolução do produto.

## :white_check_mark: Já implementado recentemente

- Restore em fila BullMQ com retry e controle de concorrência
- Endpoint Prometheus nativo (`/metrics`)
- Persistência de health de storage em `storage_health_checks`
- Alertas externos robustos (SMTP, webhook, WhatsApp) com templates/versionamento
- RBAC dinâmico + auditoria
- Restore verification mode com confirmação explícita e permissão dedicada

## :sparkles: Backlog recomendado (próximas evoluções)

### 1) Streaming de logs em tempo real

- Exibir logs sem polling para execuções longas (SSE/WebSocket)

### 2) Criptografia de artefatos em repouso

- AES por job/storage com rotação de chave

### 3) Políticas de retenção avançadas

- Regras por janela (diário/semanal/mensal) além de `max_backups`

### 4) Restore drill automatizado

- Rotina periódica com verification mode + relatório

### 5) SLA/SLO operacionais

- Meta de sucesso de backup/restore por datasource com alertas de violação

### 6) E2E ampliado para falhas

- Redis indisponível, storage parcial, credenciais expiradas, retry exaustivo

### 7) Integrações de observabilidade

- Exportar traces (OpenTelemetry) e correlacionar com logs/métricas

### 8) Multi-tenant (opcional)

- Isolamento por organização/equipe para ambientes compartilhados

## :bookmark: Critérios de sucesso sugeridos

- Reduzir tempo médio de diagnóstico (MTTD)
- Reduzir tempo médio de recuperação (MTTR)
- Aumentar taxa de sucesso de backup/restore
- Diminuir regressão funcional por release

