-- Phase 1: Inventory core hardening schema additions

ALTER TABLE "mm_inventory_transactions" ADD COLUMN IF NOT EXISTS "sourceBinId" TEXT;
ALTER TABLE "mm_inventory_transactions" ADD COLUMN IF NOT EXISTS "destinationBinId" TEXT;
ALTER TABLE "mm_inventory_transactions" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE "mm_inventory_balances" ADD COLUMN IF NOT EXISTS "plantId" TEXT;

CREATE INDEX IF NOT EXISTS "mm_inventory_transactions_storageBinId_idx" ON "mm_inventory_transactions"("storageBinId");
CREATE INDEX IF NOT EXISTS "mm_inventory_transactions_batchId_idx" ON "mm_inventory_transactions"("batchId");
CREATE INDEX IF NOT EXISTS "mm_inventory_transactions_serialNumberId_idx" ON "mm_inventory_transactions"("serialNumberId");
CREATE INDEX IF NOT EXISTS "mm_inventory_transactions_stockStatus_idx" ON "mm_inventory_transactions"("stockStatus");
CREATE INDEX IF NOT EXISTS "mm_inventory_transactions_movementType_idx" ON "mm_inventory_transactions"("movementType");
CREATE INDEX IF NOT EXISTS "mm_inventory_transactions_sourceDocumentType_sourceDocumentId_idx" ON "mm_inventory_transactions"("sourceDocumentType", "sourceDocumentId");
CREATE INDEX IF NOT EXISTS "mm_inventory_transactions_companyId_warehouseId_materialId_idx" ON "mm_inventory_transactions"("companyId", "warehouseId", "materialId");
CREATE INDEX IF NOT EXISTS "mm_inventory_transactions_companyId_plantId_idx" ON "mm_inventory_transactions"("companyId", "plantId");

CREATE INDEX IF NOT EXISTS "mm_inventory_balances_storageBinId_idx" ON "mm_inventory_balances"("storageBinId");
CREATE INDEX IF NOT EXISTS "mm_inventory_balances_batchId_idx" ON "mm_inventory_balances"("batchId");
CREATE INDEX IF NOT EXISTS "mm_inventory_balances_serialNumberId_idx" ON "mm_inventory_balances"("serialNumberId");
CREATE INDEX IF NOT EXISTS "mm_inventory_balances_stockStatus_idx" ON "mm_inventory_balances"("stockStatus");
CREATE INDEX IF NOT EXISTS "mm_inventory_balances_companyId_idx" ON "mm_inventory_balances"("companyId");
CREATE INDEX IF NOT EXISTS "mm_inventory_balances_companyId_warehouseId_materialId_idx" ON "mm_inventory_balances"("companyId", "warehouseId", "materialId");
CREATE INDEX IF NOT EXISTS "mm_inventory_balances_companyId_plantId_idx" ON "mm_inventory_balances"("companyId", "plantId");

ALTER TABLE "mm_inventory_transactions" ADD CONSTRAINT "mm_inventory_transactions_sourceBinId_fkey" FOREIGN KEY ("sourceBinId") REFERENCES "wm_storage_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mm_inventory_transactions" ADD CONSTRAINT "mm_inventory_transactions_destinationBinId_fkey" FOREIGN KEY ("destinationBinId") REFERENCES "wm_storage_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
