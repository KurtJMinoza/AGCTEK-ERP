-- Phase 8: Returns, Disposal, Batch Genealogy and Serial Traceability

-- Shelf life / expiry foundation
ALTER TABLE "mm_batches" ADD COLUMN IF NOT EXISTS "shelfLifeDays" INTEGER;
CREATE INDEX IF NOT EXISTS "mm_batches_expiryDate_idx" ON "mm_batches"("expiryDate");

ALTER TABLE "mm_materials" ADD COLUMN IF NOT EXISTS "defaultShelfLifeDays" INTEGER;
ALTER TABLE "mm_materials" ADD COLUMN IF NOT EXISTS "autoBlockExpired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "mm_returns_disposal_config" ADD COLUMN IF NOT EXISTS "autoBlockExpired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mm_returns_disposal_config" ADD COLUMN IF NOT EXISTS "expiredBlockStockStatus" TEXT NOT NULL DEFAULT 'EXPIRED';

-- Supplier return close
ALTER TABLE "mm_supplier_returns" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- Disposal as DisposalRequest bridge
ALTER TABLE "mm_disposals" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- Customer return extras
ALTER TABLE "mm_customer_returns" ADD COLUMN IF NOT EXISTS "sdReturnRequestRef" TEXT;
ALTER TABLE "mm_customer_returns" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- QI → supplier return FK
CREATE INDEX IF NOT EXISTS "mm_quality_decisions_supplierReturnId_idx" ON "mm_quality_decisions"("supplierReturnId");

DO $$ BEGIN
  ALTER TABLE "mm_quality_decisions"
    ADD CONSTRAINT "mm_quality_decisions_supplierReturnId_fkey"
    FOREIGN KEY ("supplierReturnId") REFERENCES "mm_supplier_returns"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Traceability composite indexes on ledger
CREATE INDEX IF NOT EXISTS "mm_inventory_transactions_batchId_postingDate_idx"
  ON "mm_inventory_transactions"("batchId", "postingDate");
CREATE INDEX IF NOT EXISTS "mm_inventory_transactions_serialNumberId_postingDate_idx"
  ON "mm_inventory_transactions"("serialNumberId", "postingDate");

-- Canonical customer return child docs
CREATE TABLE IF NOT EXISTS "mm_customer_return_intakes" (
    "id" TEXT NOT NULL,
    "legacyCustomerReturnId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT,
    "carrierRef" TEXT,
    "packageCount" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_customer_return_intakes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_customer_return_intakes_legacyCustomerReturnId_key"
  ON "mm_customer_return_intakes"("legacyCustomerReturnId");
CREATE INDEX IF NOT EXISTS "mm_customer_return_intakes_companyId_idx"
  ON "mm_customer_return_intakes"("companyId");
CREATE INDEX IF NOT EXISTS "mm_customer_return_intakes_warehouseId_idx"
  ON "mm_customer_return_intakes"("warehouseId");

DO $$ BEGIN
  ALTER TABLE "mm_customer_return_intakes"
    ADD CONSTRAINT "mm_customer_return_intakes_legacyCustomerReturnId_fkey"
    FOREIGN KEY ("legacyCustomerReturnId") REFERENCES "mm_customer_returns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "mm_return_inspections" (
    "id" TEXT NOT NULL,
    "legacyCustomerReturnId" TEXT NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectedBy" TEXT,
    "result" TEXT,
    "lotNotes" TEXT,
    "decisionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_return_inspections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_return_inspections_legacyCustomerReturnId_idx"
  ON "mm_return_inspections"("legacyCustomerReturnId");

DO $$ BEGIN
  ALTER TABLE "mm_return_inspections"
    ADD CONSTRAINT "mm_return_inspections_legacyCustomerReturnId_fkey"
    FOREIGN KEY ("legacyCustomerReturnId") REFERENCES "mm_customer_returns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "mm_return_dispositions" (
    "id" TEXT NOT NULL,
    "legacyCustomerReturnId" TEXT NOT NULL,
    "customerReturnLineId" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "uomId" TEXT NOT NULL,
    "batchId" TEXT,
    "serialNumberId" TEXT,
    "disposition" TEXT NOT NULL,
    "stockStatus" TEXT,
    "scrapTransactionId" TEXT,
    "disposalId" TEXT,
    "inventoryTxnId" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_return_dispositions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_return_dispositions_legacyCustomerReturnId_idx"
  ON "mm_return_dispositions"("legacyCustomerReturnId");
CREATE INDEX IF NOT EXISTS "mm_return_dispositions_customerReturnLineId_idx"
  ON "mm_return_dispositions"("customerReturnLineId");
CREATE INDEX IF NOT EXISTS "mm_return_dispositions_materialId_idx"
  ON "mm_return_dispositions"("materialId");

DO $$ BEGIN
  ALTER TABLE "mm_return_dispositions"
    ADD CONSTRAINT "mm_return_dispositions_legacyCustomerReturnId_fkey"
    FOREIGN KEY ("legacyCustomerReturnId") REFERENCES "mm_customer_returns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "mm_scrap_transactions" (
    "id" TEXT NOT NULL,
    "scrapNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "legacyDisposalId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedBy" TEXT,
    "idempotencyKey" TEXT,
    "inventoryTxnIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_scrap_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_scrap_transactions_scrapNumber_key"
  ON "mm_scrap_transactions"("scrapNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "mm_scrap_transactions_legacyDisposalId_key"
  ON "mm_scrap_transactions"("legacyDisposalId");
CREATE UNIQUE INDEX IF NOT EXISTS "mm_scrap_transactions_idempotencyKey_key"
  ON "mm_scrap_transactions"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "mm_scrap_transactions_companyId_idx"
  ON "mm_scrap_transactions"("companyId");
CREATE INDEX IF NOT EXISTS "mm_scrap_transactions_warehouseId_idx"
  ON "mm_scrap_transactions"("warehouseId");

DO $$ BEGIN
  ALTER TABLE "mm_scrap_transactions"
    ADD CONSTRAINT "mm_scrap_transactions_legacyDisposalId_fkey"
    FOREIGN KEY ("legacyDisposalId") REFERENCES "mm_disposals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
