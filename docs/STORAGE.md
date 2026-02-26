# :bookmark: Storage - DataGuardian

> Guia de tipos de storage, estratégias e boas práticas operacionais.

## :bookmark: Tipos suportados

- `local`
- `ssh`
- `s3`
- `minio`
- `backblaze`

## :sparkles: Operações suportadas pelos adapters

- `upload`
- `download`
- `exists`
- `list`
- `delete`
- `copy`
- `testConnection`

## :bookmark: Storage Explorer (API)

- `GET /api/storage-locations/:id/files?path=`
- `DELETE /api/storage-locations/:id/files?path=`
- `POST /api/storage-locations/:id/files/copy`
- `GET /api/storage-locations/:id/files/download?path=`

## :bookmark: Estratégias de gravação no backup job

- `fallback`: salva no primeiro storage disponível
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

## :bookmark: Organização de arquivos de backup

Padrão por banco e execução:

`{database_name}/{YYYY-MM-DD_HHMMSS}/...`

O manifest de artefatos também é salvo junto para suportar restore/retry-upload.

## :bookmark: Download no explorer

- Download de arquivo suportado
- Download de pasta suportado (retornado como `.zip`)

## :white_check_mark: Boas práticas

- Usar pelo menos 2 storages em jobs críticos
- Usar `replicate` para maior resiliência
- Testar conexão antes de habilitar storage em produção
- Monitorar health de storage em `/api/health/storage`

## :bookmark: Storage local em Docker

Quando a aplicação roda em Docker, o tipo `local` deve usar caminho dentro de:

- `/var/backups`

Esse caminho é montado para uma pasta do host, garantindo persistência dos backups mesmo após update/recreate do container.

Você também pode informar caminho absoluto do host no cadastro (ex.: `C:/backups/dataguardian` ou `/opt/backups/dataguardian`), desde que esteja dentro de `LOCAL_STORAGE_HOST_PATH`.
A API mapeia automaticamente para o caminho equivalente dentro do container (`LOCAL_STORAGE_ROOT_PATH`, padrão `/var/backups`).

