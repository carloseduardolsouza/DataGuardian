-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('smtp', 'webhook', 'whatsapp');

-- CreateTable
CREATE TABLE "storage_health_checks" (
    "id" TEXT NOT NULL,
    "storage_location_id" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL,
    "latency_ms" INTEGER,
    "available_space_gb" DECIMAL(10,2),
    "error_message" TEXT,
    "metadata" JSONB,

    CONSTRAINT "storage_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "title_tpl" TEXT,
    "message_tpl" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storage_health_checks_storage_location_id_checked_at_idx" ON "storage_health_checks"("storage_location_id", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "storage_health_checks_checked_at_idx" ON "storage_health_checks"("checked_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_channel_type_version_key" ON "notification_templates"("channel", "type", "version");

-- CreateIndex
CREATE INDEX "notification_templates_channel_type_enabled_version_idx" ON "notification_templates"("channel", "type", "enabled", "version");

-- AddForeignKey
ALTER TABLE "storage_health_checks" ADD CONSTRAINT "storage_health_checks_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
