# Storage - DataGuardian

## Tipos suportados

- `local`
- `ssh`
- `s3`
- `minio`
- `backblaze`

## Operacoes suportadas pelos adapters

- `upload`
- `download`
- `exists`
- `list`
- `delete`
- `copy`
- `testConnection`

## Storage explorer (API)

- `GET /api/storage-locations/:id/files?path=`
- `DELETE /api/storage-locations/:id/files?path=`
- `POST /api/storage-locations/:id/files/copy`
- `GET /api/storage-locations/:id/files/download?path=`

## Estrategias de gravacao no backup job

- `fallback`: salva no primeiro storage disponivel
- `replicate`: tenta salvar em todos os storages selecionados

Exemplo de `backup_options`:

```json
{
  "storage_strategy": "fallback",
  "storage_targets": [
    { "storage_location_id": "uuid-1", "order": 1 },
    { "storage_location_id": "uuid-2", "order": 2 }
  ]
}
```

## Organizacao de arquivos de backup

Padrao de organizacao por banco e execucao:

`{database_name}/{YYYY-MM-DD_HHMMSS}/...`

O manifest de artefatos tambem e salvo junto para suportar restore/retry-upload.

## Download no explorer

- download de arquivo suportado
- download de pasta suportado (retornado como `.zip`)

## Boas praticas

- usar pelo menos 2 storages em jobs criticos
- usar `replicate` para maior resiliencia
- testar conexao antes de habilitar storage em producao
- monitorar health de storage em `/api/health/storage`
