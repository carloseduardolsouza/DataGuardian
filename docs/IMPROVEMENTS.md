# Sugestoes de Melhorias - DataGuardian

Este documento lista melhorias futuras. Itens ja implementados foram removidos do backlog principal.

## Ja implementado recentemente

- restore em fila BullMQ com retry/control de concorrencia
- endpoint Prometheus nativo (`/metrics`)
- persistencia de health de storage em tabela (`storage_health_checks`)
- alertas externos robustos (SMTP, webhook, WhatsApp) com templates/versionamento
- RBAC dinamico + auditoria
- restore verification mode com confirmacao explicita e permissao dedicada

## Backlog recomendado (proximas evolucoes)

1. Streaming de logs em tempo real (SSE/WebSocket)
- Exibir logs sem polling para execucoes longas.

2. Criptografia de artefatos em repouso
- AES por job/storage, com rotacao de chave.

3. Politicas de retencao avancadas
- Regras por janela (diario/semanal/mensal) alem de `max_backups`.

4. Restore drill automatizado
- Rotina periodica que executa verification mode e gera relatorio.

5. SLA/SLO operacionais
- Meta de sucesso de backup/restore por datasource e alertas por violacao.

6. E2E ampliado para cenarios de falha
- Falha de Redis, storage parcial, credenciais expiradas, retry exaustivo.

7. Integrações de observabilidade
- Exportar traces (OpenTelemetry) e correlacionar com logs/metricas.

8. Multi-tenant (opcional)
- Isolamento por organizacao/equipe para ambientes compartilhados.

## Criterios de sucesso sugeridos

- reduzir tempo medio de diagnostico (MTTD)
- reduzir tempo medio de recuperacao (MTTR)
- aumentar taxa de sucesso de backup/restore
- diminuir regressao funcional por release
