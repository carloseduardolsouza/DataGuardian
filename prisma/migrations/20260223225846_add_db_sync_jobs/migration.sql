-- CreateEnum
CREATE TYPE "SyncOverwriteDirection" AS ENUM ('source_to_target', 'target_to_source');

-- CreateEnum
CREATE TYPE "SyncExecutionStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "database_sync_jobs" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "source_datasource_id" TEXT NOT NULL,
    "target_datasource_id" TEXT NOT NULL,
    "storage_location_id" TEXT NOT NULL,
    "schedule_cron" VARCHAR(100) NOT NULL,
    "schedule_timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "overwrite_direction" "SyncOverwriteDirection" NOT NULL DEFAULT 'source_to_target',
    "drop_existing" BOOLEAN NOT NULL DEFAULT true,
    "run_on_manual" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_execution_at" TIMESTAMP(3),
    "next_execution_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "database_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "database_sync_executions" (
    "id" TEXT NOT NULL,
    "sync_job_id" TEXT NOT NULL,
    "source_datasource_id" TEXT NOT NULL,
    "target_datasource_id" TEXT NOT NULL,
    "status" "SyncExecutionStatus" NOT NULL DEFAULT 'queued',
    "trigger_source" VARCHAR(20) NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "backup_execution_id" TEXT,
    "restore_execution_id" TEXT,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "database_sync_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "database_sync_jobs_next_execution_at_idx" ON "database_sync_jobs"("next_execution_at");

-- CreateIndex
CREATE INDEX "database_sync_jobs_source_datasource_id_idx" ON "database_sync_jobs"("source_datasource_id");

-- CreateIndex
CREATE INDEX "database_sync_jobs_target_datasource_id_idx" ON "database_sync_jobs"("target_datasource_id");

-- CreateIndex
CREATE INDEX "database_sync_jobs_storage_location_id_idx" ON "database_sync_jobs"("storage_location_id");

-- CreateIndex
CREATE INDEX "database_sync_executions_sync_job_id_created_at_idx" ON "database_sync_executions"("sync_job_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "database_sync_executions_status_idx" ON "database_sync_executions"("status");

-- CreateIndex
CREATE INDEX "database_sync_executions_backup_execution_id_idx" ON "database_sync_executions"("backup_execution_id");

-- CreateIndex
CREATE INDEX "database_sync_executions_restore_execution_id_idx" ON "database_sync_executions"("restore_execution_id");

-- AddForeignKey
ALTER TABLE "database_sync_jobs" ADD CONSTRAINT "database_sync_jobs_source_datasource_id_fkey" FOREIGN KEY ("source_datasource_id") REFERENCES "datasources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "database_sync_jobs" ADD CONSTRAINT "database_sync_jobs_target_datasource_id_fkey" FOREIGN KEY ("target_datasource_id") REFERENCES "datasources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "database_sync_jobs" ADD CONSTRAINT "database_sync_jobs_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "database_sync_executions" ADD CONSTRAINT "database_sync_executions_sync_job_id_fkey" FOREIGN KEY ("sync_job_id") REFERENCES "database_sync_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "database_sync_executions" ADD CONSTRAINT "database_sync_executions_source_datasource_id_fkey" FOREIGN KEY ("source_datasource_id") REFERENCES "datasources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "database_sync_executions" ADD CONSTRAINT "database_sync_executions_target_datasource_id_fkey" FOREIGN KEY ("target_datasource_id") REFERENCES "datasources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
