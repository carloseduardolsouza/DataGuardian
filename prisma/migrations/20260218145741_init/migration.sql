-- CreateEnum
CREATE TYPE "DatasourceType" AS ENUM ('postgres', 'mysql', 'mongodb', 'sqlserver', 'sqlite', 'files');

-- CreateEnum
CREATE TYPE "DatasourceStatus" AS ENUM ('healthy', 'warning', 'critical', 'unknown');

-- CreateEnum
CREATE TYPE "StorageLocationType" AS ENUM ('local', 's3', 'ssh', 'minio', 'backblaze');

-- CreateEnum
CREATE TYPE "StorageLocationStatus" AS ENUM ('healthy', 'full', 'unreachable');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "BackupType" AS ENUM ('full', 'incremental', 'differential');

-- CreateEnum
CREATE TYPE "HealthCheckStatus" AS ENUM ('ok', 'timeout', 'auth_failed', 'unreachable', 'error');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('backup_success', 'backup_failed', 'connection_lost', 'connection_restored', 'storage_full', 'storage_unreachable', 'health_degraded', 'cleanup_completed');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('datasource', 'backup_job', 'storage_location', 'system');

-- CreateTable
CREATE TABLE "datasources" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "DatasourceType" NOT NULL,
    "connection_config" JSONB NOT NULL,
    "status" "DatasourceStatus" NOT NULL DEFAULT 'unknown',
    "last_health_check_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datasources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_locations" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "StorageLocationType" NOT NULL,
    "config" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "available_space_gb" DECIMAL(10,2),
    "status" "StorageLocationStatus" NOT NULL DEFAULT 'healthy',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_jobs" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "datasource_id" TEXT NOT NULL,
    "storage_location_id" TEXT NOT NULL,
    "schedule_cron" VARCHAR(100) NOT NULL,
    "schedule_timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "retention_policy" JSONB NOT NULL,
    "backup_options" JSONB NOT NULL,
    "last_execution_at" TIMESTAMP(3),
    "next_execution_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_executions" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "datasource_id" TEXT NOT NULL,
    "storage_location_id" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'queued',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "size_bytes" BIGINT,
    "compressed_size_bytes" BIGINT,
    "backup_path" TEXT,
    "backup_type" "BackupType" NOT NULL DEFAULT 'full',
    "files_count" INTEGER,
    "error_message" TEXT,
    "error_stack" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_chunks" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "chunk_number" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_checks" (
    "id" TEXT NOT NULL,
    "datasource_id" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "HealthCheckStatus" NOT NULL,
    "latency_ms" INTEGER,
    "error_message" TEXT,
    "metadata" JSONB,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "entity_type" "NotificationEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "backup_jobs_next_execution_at_idx" ON "backup_jobs"("next_execution_at");

-- CreateIndex
CREATE INDEX "backup_executions_job_id_created_at_idx" ON "backup_executions"("job_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "backup_executions_status_idx" ON "backup_executions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "backup_chunks_execution_id_chunk_number_key" ON "backup_chunks"("execution_id", "chunk_number");

-- CreateIndex
CREATE INDEX "health_checks_datasource_id_checked_at_idx" ON "health_checks"("datasource_id", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_created_at_read_at_idx" ON "notifications"("created_at" DESC, "read_at");

-- AddForeignKey
ALTER TABLE "backup_jobs" ADD CONSTRAINT "backup_jobs_datasource_id_fkey" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_jobs" ADD CONSTRAINT "backup_jobs_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_executions" ADD CONSTRAINT "backup_executions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "backup_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_executions" ADD CONSTRAINT "backup_executions_datasource_id_fkey" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_executions" ADD CONSTRAINT "backup_executions_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_chunks" ADD CONSTRAINT "backup_chunks_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "backup_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_checks" ADD CONSTRAINT "health_checks_datasource_id_fkey" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
