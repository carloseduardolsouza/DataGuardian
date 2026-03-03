-- CreateEnum
CREATE TYPE "AccessScopeSubjectType" AS ENUM ('user', 'role');

-- CreateEnum
CREATE TYPE "AccessScopeResourceType" AS ENUM ('datasource', 'storage_location', 'backup_job', 'db_sync_job');

-- CreateEnum
CREATE TYPE "AccessScopeEffect" AS ENUM ('allow', 'deny');

-- CreateTable
CREATE TABLE "access_scopes" (
    "id" TEXT NOT NULL,
    "subject_type" "AccessScopeSubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "permission_key" VARCHAR(120) NOT NULL,
    "resource_type" "AccessScopeResourceType" NOT NULL,
    "resource_id" TEXT NOT NULL,
    "effect" "AccessScopeEffect" NOT NULL DEFAULT 'allow',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_scopes_subject_type_subject_id_permission_key_resourc_key" ON "access_scopes"("subject_type", "subject_id", "permission_key", "resource_type", "resource_id", "effect");

-- CreateIndex
CREATE INDEX "access_scopes_subject_type_subject_id_idx" ON "access_scopes"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "access_scopes_permission_key_resource_type_idx" ON "access_scopes"("permission_key", "resource_type");

-- CreateIndex
CREATE INDEX "access_scopes_resource_id_idx" ON "access_scopes"("resource_id");
