# Storage Locations — DataGuardian

Guia completo de todos os adaptadores de storage suportados pelo DataGuardian.

## Índice

- [Visão Geral](#visão-geral)
- [Local](#local)
- [SSH / SFTP](#ssh--sftp)
- [S3 (AWS / Wasabi)](#s3-aws--wasabi)
- [MinIO](#minio)
- [Backblaze B2](#backblaze-b2)
- [Comparativo de Capacidades](#comparativo-de-capacidades)
- [Convenções de Nomenclatura de Arquivos](#convenções-de-nomenclatura-de-arquivos)
- [Gestão de Espaço](#gestão-de-espaço)

---

## Visão Geral

O DataGuardian utiliza um padrão **Adapter** para abstrair o armazenamento de backups. Independentemente do destino configurado (disco local, NAS via SSH, nuvem S3, etc.), a interface de uso pela aplicação é idêntica.

Cada adapter implementa as operações:

| Operação      | Descrição                                  |
|---------------|--------------------------------------------|
| `upload`      | Envia o arquivo de backup para o storage   |
| `download`    | Baixa um backup do storage                 |
| `delete`      | Remove um arquivo do storage               |
| `list`        | Lista arquivos de um job                   |
| `exists`      | Verifica se um arquivo existe              |
| `checkSpace`  | Verifica espaço disponível                 |
| `testConnection` | Testa conectividade                     |

---

## Local

Armazena os backups diretamente no sistema de arquivos do servidor onde o DataGuardian está rodando. Ideal para ambientes onde o volume de backup é montado por Docker.

### Configuração

```json
{
  "name": "Disco Local",
  "type": "local",
  "config": {
    "path": "/var/backups",
    "max_size_gb": 500
  }
}
```

| Campo        | Tipo    | Obrigatório | Padrão | Descrição                                    |
|--------------|---------|-------------|--------|----------------------------------------------|
| `path`       | string  | sim         | —      | Caminho absoluto do diretório de backups      |
| `max_size_gb`| number  | não         | null   | Emite alerta quando o diretório atingir este tamanho |

### Configuração com Docker

No `docker-compose.yml`, monte um volume externo no caminho configurado:

```yaml
services:
  app:
    volumes:
      - /mnt/disco-externo/backups:/var/backups   # Disco externo
      # ou
      - backup-storage:/var/backups               # Volume Docker gerenciado

volumes:
  backup-storage:
    driver: local
```

### Estrutura de Diretórios

O adapter local organiza os arquivos da seguinte forma:

```
/var/backups/
└── {job_id}/
    ├── 2025-02-13_060001/
    │   └── backup.dump.gz
    ├── 2025-02-12_060001/
    │   └── backup.dump.gz
    └── 2025-02-11_060001/
        ├── backup.part-001.gz
        └── backup.part-002.gz   ← arquivo dividido em chunks
```

### Permissões Necessárias

O processo do DataGuardian deve ter permissão de leitura e escrita no diretório configurado:

```bash
# Dê permissão ao usuário que executa o processo
chown -R 1000:1000 /var/backups
chmod -R 755 /var/backups
```

### Monitoramento de Espaço

O campo `max_size_gb` define um limite de alerta. Quando o diretório ultrapassar esse valor, uma notificação `storage_full` (severity: `warning`) é criada. O sistema não bloqueia automaticamente novos backups ao atingir o limite — apenas alerta.

---

## SSH / SFTP

Armazena backups em um servidor remoto via protocolo SSH/SFTP. Ideal para enviar backups para um NAS, servidor dedicado de armazenamento ou qualquer máquina Linux acessível via SSH.

### Configuração

```json
{
  "name": "NAS Empresa",
  "type": "ssh",
  "config": {
    "host": "nas.empresa.local",
    "port": 22,
    "username": "backup",
    "private_key": "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...\n-----END RSA PRIVATE KEY-----",
    "remote_path": "/mnt/storage/backups"
  }
}
```

| Campo         | Tipo   | Obrigatório | Padrão | Descrição                                          |
|---------------|--------|-------------|--------|----------------------------------------------------|
| `host`        | string | sim         | —      | Hostname ou IP do servidor SSH                     |
| `port`        | integer| não         | `22`   | Porta SSH                                          |
| `username`    | string | sim         | —      | Usuário SSH                                        |
| `password`    | string | não         | —      | Senha (alternativa à chave privada)                |
| `private_key` | string | não         | —      | Conteúdo da chave privada SSH (PEM)                |
| `remote_path` | string | sim         | —      | Caminho absoluto no servidor remoto                |

> Pelo menos um de `password` ou `private_key` deve ser fornecido.

### Autenticação por Chave SSH (Recomendado)

**1. Gere um par de chaves dedicado para o DataGuardian:**

```bash
ssh-keygen -t rsa -b 4096 -C "dataguardian-backup" -f ~/.ssh/dataguardian_rsa -N ""
```

**2. Adicione a chave pública ao servidor de destino:**

```bash
ssh-copy-id -i ~/.ssh/dataguardian_rsa.pub backup@nas.empresa.local
# ou manualmente:
cat ~/.ssh/dataguardian_rsa.pub >> ~/.ssh/authorized_keys
```

**3. Cole o conteúdo da chave privada no campo `private_key`:**

```bash
cat ~/.ssh/dataguardian_rsa
```

### Restrições Recomendadas no Servidor

Para maior segurança, restrinja o usuário `backup` no servidor SSH:

```bash
# /etc/ssh/sshd_config (ou arquivo de configuração adicional)
Match User backup
    PasswordAuthentication no
    ChrootDirectory /mnt/storage
    ForceCommand internal-sftp
    AllowTcpForwarding no
    X11Forwarding no
```

### Verificação de Espaço

O adapter SSH verifica o espaço disponível via comando `df`:

```bash
ssh backup@nas.empresa.local "df -BGB /mnt/storage/backups | tail -1 | awk '{print $4}'"
```

---

## S3 (AWS / Wasabi)

Armazena backups no Amazon S3 ou em provedores compatíveis com a API S3, como **Wasabi**, **Backblaze B2 (modo S3)**, **Cloudflare R2**, etc.

### Configuração — AWS S3

```json
{
  "name": "AWS S3 Backups",
  "type": "s3",
  "config": {
    "endpoint": null,
    "bucket": "empresa-backups",
    "region": "us-east-1",
    "access_key_id": "AKIAIOSFODNN7EXAMPLE",
    "secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "storage_class": "STANDARD_IA"
  }
}
```

### Configuração — Wasabi

```json
{
  "name": "Wasabi Backups",
  "type": "s3",
  "config": {
    "endpoint": "https://s3.wasabisys.com",
    "bucket": "empresa-backups",
    "region": "us-east-1",
    "access_key_id": "WASKEYEXAMPLE",
    "secret_access_key": "wJalrXUtnFEMI...",
    "storage_class": "STANDARD"
  }
}
```

| Campo              | Tipo   | Obrigatório | Padrão | Descrição                              |
|--------------------|--------|-------------|--------|----------------------------------------|
| `endpoint`         | string | não         | null   | URL customizada (null = AWS padrão)    |
| `bucket`           | string | sim         | —      | Nome do bucket S3                      |
| `region`           | string | sim         | —      | Região AWS (ex: `us-east-1`)           |
| `access_key_id`    | string | sim         | —      | AWS Access Key ID                      |
| `secret_access_key`| string | sim         | —      | AWS Secret Access Key                  |
| `storage_class`    | string | não         | `STANDARD` | Classe de armazenamento S3        |

### Classes de Armazenamento S3

| Classe              | Custo   | Latência de Recuperação | Indicado para             |
|---------------------|---------|-------------------------|---------------------------|
| `STANDARD`          | Alto    | Imediato                | Backups frequentemente acessados |
| `STANDARD_IA`       | Médio   | Imediato                | Backups de retenção média (recomendado) |
| `ONEZONE_IA`        | Baixo   | Imediato                | Dados não críticos         |
| `GLACIER`           | Muito baixo | 1–5 horas           | Arquivamento de longo prazo|
| `GLACIER_IR`        | Baixo   | Minutos                 | Arquivamento com recuperação rápida |
| `DEEP_ARCHIVE`      | Mínimo  | 12–48 horas             | Compliance e arquivamento  |

### Política IAM Mínima (AWS)

Crie um usuário IAM dedicado com a política mínima necessária:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DataGuardianS3Access",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::empresa-backups",
        "arn:aws:s3:::empresa-backups/*"
      ]
    }
  ]
}
```

### Estrutura de Objetos no Bucket

```
empresa-backups/
└── {job_id}/
    ├── 2025-02-13_060001/
    │   └── backup.dump.gz
    └── 2025-02-12_060001/
        ├── backup.part-001.gz
        └── backup.part-002.gz
```

### Lifecycle Rules (Recomendado)

Configure regras de ciclo de vida no S3 para mover backups antigos para Glacier automaticamente:

```json
{
  "Rules": [
    {
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 90, "StorageClass": "GLACIER" }
      ]
    }
  ]
}
```

---

## MinIO

MinIO é um servidor de object storage **auto-hospedado** 100% compatível com a API S3. Ideal para quem deseja manter os backups na infraestrutura própria sem depender de nuvem pública.

### Configuração

```json
{
  "name": "MinIO Local",
  "type": "minio",
  "config": {
    "endpoint": "http://minio.local:9000",
    "bucket": "backups",
    "access_key": "minioadmin",
    "secret_key": "miniopassword123",
    "use_ssl": false
  }
}
```

| Campo       | Tipo    | Obrigatório | Padrão  | Descrição                             |
|-------------|---------|-------------|---------|---------------------------------------|
| `endpoint`  | string  | sim         | —       | URL do servidor MinIO                 |
| `bucket`    | string  | sim         | —       | Nome do bucket                        |
| `access_key`| string  | sim         | —       | Access key do MinIO                   |
| `secret_key`| string  | sim         | —       | Secret key do MinIO                   |
| `use_ssl`   | boolean | não         | `false` | Usar HTTPS na comunicação             |

### Deploy do MinIO com Docker

Adicione o MinIO ao seu `docker-compose.yml`:

```yaml
services:
  minio:
    image: minio/minio:latest
    container_name: minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: miniopassword123
    volumes:
      - minio-data:/data
    ports:
      - "9000:9000"   # API S3
      - "9001:9001"   # Console Web
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  minio-data:
    driver: local
```

### Criando o Bucket

Via MinIO Console (`http://localhost:9001`) ou via CLI:

```bash
# Instalar mc (MinIO Client)
mc alias set local http://minio.local:9000 minioadmin miniopassword123
mc mb local/backups
mc policy set private local/backups
```

---

## Backblaze B2

Backblaze B2 é um serviço de armazenamento em nuvem com custo muito baixo (a partir de $0.006/GB/mês), ideal para retenções de longo prazo.

### Configuração

```json
{
  "name": "Backblaze B2",
  "type": "backblaze",
  "config": {
    "bucket_id": "e73ede9969c64427a54e",
    "bucket_name": "empresa-backups",
    "application_key_id": "0014b4f7b5e70d0000000001",
    "application_key": "K001Abc123DefXyz..."
  }
}
```

| Campo                | Tipo   | Obrigatório | Descrição                        |
|----------------------|--------|-------------|----------------------------------|
| `bucket_id`          | string | sim         | ID único do bucket B2            |
| `bucket_name`        | string | sim         | Nome do bucket B2                |
| `application_key_id` | string | sim         | ID da Application Key            |
| `application_key`    | string | sim         | Valor da Application Key         |

### Criando uma Application Key

1. Acesse [backblaze.com](https://www.backblaze.com) → **App Keys**
2. Clique em **Add a New Application Key**
3. Preencha:
   - **Name of Key**: `dataguardian`
   - **Allow access to Bucket**: selecione o bucket de backups
   - **Type of Access**: `Read and Write`
   - **File name prefix**: (deixe em branco)
4. Anote o `applicationKey` — **ele não é exibido novamente**

### Encontrando o Bucket ID

O `bucket_id` está disponível na tela de listagem de buckets do B2 Console, ou via API:

```bash
curl -u "keyId:applicationKey" \
  "https://api.backblazeb2.com/b2api/v2/b2_list_buckets?accountId=YOUR_ACCOUNT_ID"
```

### Limitações

- Backblaze B2 não possui classes de storage diferentes — todos os arquivos têm o mesmo custo
- O download (egress) tem custo adicional; considere isso para testes frequentes de restore
- Recomenda-se usar a política de retenção do DataGuardian em vez do lifecycle nativo do B2

---

## Comparativo de Capacidades

| Feature                    | Local | SSH  | S3   | MinIO | Backblaze B2 |
|----------------------------|-------|------|------|-------|--------------|
| Verificação de espaço      | ✅    | ✅   | ✅   | ✅    | ✅           |
| Multipart upload           | —     | —    | ✅   | ✅    | ✅           |
| Storage classes            | —     | —    | ✅   | ❌    | ❌           |
| Self-hosted                | ✅    | ✅   | ❌   | ✅    | ❌           |
| Criptografia em trânsito   | —     | ✅   | ✅   | ⚙️    | ✅           |
| Criptografia em repouso    | ❌    | ❌   | ✅   | ⚙️    | ✅           |
| Custo                      | infra | infra | médio | infra | baixo       |

> ⚙️ = depende da configuração do servidor

---

## Convenções de Nomenclatura de Arquivos

Independentemente do storage, os arquivos seguem o padrão:

```
{job_id}/{data_hora}/{tipo}.{formato}.{extensao_compressao}
```

**Exemplos:**

```
# Backup PostgreSQL completo com gzip
550e8400-e29b-41d4-a716-446655440000/2025-02-13_060001/backup.dump.gz

# Backup MySQL com zstd, dividido em chunks
job-uuid/2025-02-13_060001/backup.sql.zst.part-001
job-uuid/2025-02-13_060001/backup.sql.zst.part-002

# Backup de arquivos com tar + lz4
job-uuid/2025-02-13_060001/backup.tar.lz4

# Manifesto do backup (metadados)
job-uuid/2025-02-13_060001/manifest.json
```

### Manifesto (`manifest.json`)

Cada backup cria um arquivo `manifest.json` com metadados para facilitar o restore:

```json
{
  "version": "1.0",
  "created_at": "2025-02-13T06:04:32.000Z",
  "execution_id": "exec-uuid-...",
  "job_id": "job-uuid-...",
  "datasource_type": "postgres",
  "backup_type": "full",
  "compression": "gzip",
  "total_size_bytes": 10485760000,
  "compressed_size_bytes": 3670016000,
  "compression_ratio": 0.35,
  "checksum": "sha256:a3f1b2c4...",
  "chunks": [
    { "number": 1, "file": "backup.dump.gz", "checksum": "sha256:..." }
  ],
  "metadata": {
    "database_version": "PostgreSQL 16.1",
    "tables_backed_up": 48
  }
}
```

---

## Gestão de Espaço

### Política de Retenção GFS (Grandfather-Father-Son)

O DataGuardian implementa a política **GFS** para gestão de backups antigos:

```
Últimos 7 dias    → mantém TODOS os backups (daily)
Últimos 28 dias   → mantém apenas o backup de domingo de cada semana (weekly)
Último 1 ano      → mantém apenas o backup do dia 1 de cada mês (monthly)
Após 1 ano        → deletado conforme configuração de keep_monthly
```

**Configuração de exemplo:**

```json
{
  "retention_policy": {
    "keep_daily": 7,
    "keep_weekly": 4,
    "keep_monthly": 12,
    "auto_delete": true
  }
}
```

Com essa configuração, o espaço máximo teórico ocupado por um job seria:
- 7 backups diários
- 4 backups semanais
- 12 backups mensais
- **Total: 23 backups simultâneos no storage**

### Alertas de Espaço

O sistema emite notificações quando:

| Condição                                  | Tipo                | Severidade  |
|-------------------------------------------|---------------------|-------------|
| Storage > 80% de `max_size_gb` (local)   | `storage_full`      | `warning`   |
| Storage inatingível                        | `storage_unreachable`| `critical` |
| Espaço insuficiente para novo backup      | `storage_full`      | `critical`  |
