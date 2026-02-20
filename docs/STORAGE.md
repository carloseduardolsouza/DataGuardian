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

## Estrategias de gravacao em backup job

- `fallback`: salva no primeiro storage disponivel
- `replicate`: tenta salvar em todos os storages selecionados

Configuracao no job:

```json
{
  "backup_options": {
    "storage_strategy": "fallback",
    "storage_targets": [
      { "storage_location_id": "uuid-1", "order": 1 },
      { "storage_location_id": "uuid-2", "order": 2 }
    ]
  }
}
```

## Organizacao de arquivos de backup

O backup e salvo em pasta do banco, com subpasta de execucao.

Padrao:

`{database_name}/{YYYY-MM-DD_HHMMSS}/backup.*`

Tambem e gerado `manifest.json` na mesma pasta.

## Download de arquivo pelo explorer

- somente arquivo (download de pasta nao suportado)
- erro esperado ao baixar pasta: `STORAGE_FOLDER_DOWNLOAD_NOT_SUPPORTED`

## Boas praticas

- usar pelo menos 2 storages para redundancia
- preferir `replicate` quando disponibilidade for prioritaria
- testar conexao do storage antes de habilitar em job
