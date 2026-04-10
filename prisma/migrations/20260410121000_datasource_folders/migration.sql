CREATE TABLE "datasource_folders" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datasource_folders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "datasources"
ADD COLUMN "folder_id" TEXT;

ALTER TABLE "datasources"
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "datasources_folder_id_idx" ON "datasources"("folder_id");

ALTER TABLE "datasources"
ADD CONSTRAINT "datasources_folder_id_fkey"
FOREIGN KEY ("folder_id") REFERENCES "datasource_folders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
