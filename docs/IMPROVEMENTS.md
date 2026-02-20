# Sugestoes de Melhorias - DataGuardian

Este documento consolida melhorias recomendadas para evoluir o DataGuardian em robustez, observabilidade e capacidade operacional.

## Prioridade alta

1. Restore em fila (BullMQ)
- Colocar restore no mesmo modelo assíncrono de backup.
- Benefícios: retry controlado, concorrência previsível, melhor resiliência.

2. Logs em tempo real na tela de Execuções
- Implementar SSE/WebSocket para streaming de logs por execução.
- Benefícios: feedback imediato para operador, melhor UX em backup/restore longos.

3. Persistir health de storage no banco
- Hoje o histórico de storage health está em memória.
- Persistir em tabela dedicada para histórico durável e auditoria.

4. Testes E2E dos fluxos críticos
- Cobrir: backup manual, retry-upload, restore, cleanup.
- Benefícios: menos regressão e maior confiança em releases.

## Prioridade média

5. Métricas Prometheus nativas
- Expor `/metrics` com contadores e latências por worker/job/storage.
- Benefícios: observabilidade operacional e integração com Grafana.

6. Sistema de auditoria
- Registrar ações sensíveis: login, criação/edição de jobs, execuções manuais, restores.
- Benefícios: rastreabilidade e compliance.

7. Alertas externos mais robustos
- Melhorar SMTP/webhook/WhatsApp com templates e padronização.
- Benefícios: alertas mais claros e acionáveis.

8. RBAC simples evolutivo
- Evoluir de single-user para perfis: `admin`, `operator`, `readonly`.
- Benefícios: segurança e segregação de funções.

## Prioridade estratégica

9. Verificação de restore (restore validation mode)
- Restaurar em ambiente temporário e validar integridade antes de aprovar backup.
- Benefícios: aumenta confiabilidade de recuperação real.

10. Criptografia de backup em repouso
- Criptografia opcional dos artefatos (ex: AES) e gestão de chaves.
- Benefícios: segurança para compliance e ambientes sensíveis.

## Proposta de roadmap

## Fase 1 (curto prazo)
- Restore em fila
- Logs em tempo real
- Health de storage persistente
- Testes E2E básicos

## Fase 2 (médio prazo)
- Métricas Prometheus
- Auditoria
- Alertas externos aprimorados

## Fase 3 (longo prazo)
- RBAC
- Verificação de restore
- Criptografia em repouso

## Critérios de sucesso sugeridos

- Redução de falhas operacionais não detectadas.
- Tempo de diagnóstico menor em incidentes.
- Maior taxa de sucesso de backup/restore.
- Menor regressão entre versões.
