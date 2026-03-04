DO $$
BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'restore_drill_success';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'restore_drill_failed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "AccessScopeResourceType" ADD VALUE 'restore_drill_job';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE "RestoreDrillExecutionStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE "restore_drill_jobs" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "datasource_id" TEXT NOT NULL,
  "storage_location_id" TEXT,
  "schedule_cron" VARCHAR(100) NOT NULL,
  "schedule_timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
  "max_backup_age_hours" INTEGER NOT NULL DEFAULT 168,
  "run_on_manual" BOOLEAN NOT NULL DEFAULT true,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_execution_at" TIMESTAMP(3),
  "next_execution_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "restore_drill_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restore_drill_executions" (
  "id" TEXT NOT NULL,
  "drill_job_id" TEXT NOT NULL,
  "datasource_id" TEXT NOT NULL,
  "storage_location_id" TEXT,
  "status" "RestoreDrillExecutionStatus" NOT NULL DEFAULT 'queued',
  "trigger_source" VARCHAR(20) NOT NULL,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "duration_seconds" INTEGER,
  "backup_execution_id" TEXT,
  "restore_execution_id" TEXT,
  "error_message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "restore_drill_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "restore_drill_jobs_next_execution_at_idx" ON "restore_drill_jobs"("next_execution_at");
CREATE INDEX "restore_drill_jobs_datasource_id_idx" ON "restore_drill_jobs"("datasource_id");
CREATE INDEX "restore_drill_jobs_storage_location_id_idx" ON "restore_drill_jobs"("storage_location_id");
CREATE INDEX "restore_drill_executions_drill_job_id_created_at_idx" ON "restore_drill_executions"("drill_job_id", "created_at" DESC);
CREATE INDEX "restore_drill_executions_status_idx" ON "restore_drill_executions"("status");
CREATE INDEX "restore_drill_executions_restore_execution_id_idx" ON "restore_drill_executions"("restore_execution_id");
CREATE INDEX "restore_drill_executions_backup_execution_id_idx" ON "restore_drill_executions"("backup_execution_id");

ALTER TABLE "restore_drill_jobs"
  ADD CONSTRAINT "restore_drill_jobs_datasource_id_fkey"
  FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "restore_drill_jobs"
  ADD CONSTRAINT "restore_drill_jobs_storage_location_id_fkey"
  FOREIGN KEY ("storage_location_id") REFERENCES "storage_locations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "restore_drill_executions"
  ADD CONSTRAINT "restore_drill_executions_drill_job_id_fkey"
  FOREIGN KEY ("drill_job_id") REFERENCES "restore_drill_jobs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "restore_drill_executions"
  ADD CONSTRAINT "restore_drill_executions_datasource_id_fkey"
  FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "restore_drill_executions"
  ADD CONSTRAINT "restore_drill_executions_storage_location_id_fkey"
  FOREIGN KEY ("storage_location_id") REFERENCES "storage_locations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
