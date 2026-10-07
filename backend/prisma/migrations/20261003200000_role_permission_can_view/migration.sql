-- AlterTable
ALTER TABLE "role_permissions" ADD COLUMN "canView" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: module access wherever the role already holds any grant
UPDATE "role_permissions" SET "canView" = true WHERE "canCreate" OR "canRead" OR "canUpdate" OR "canDelete";
