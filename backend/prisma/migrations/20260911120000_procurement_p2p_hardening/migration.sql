-- Procurement P2P hardening (MM-06 Phase 2)

ALTER TABLE "mm_suppliers" ADD COLUMN IF NOT EXISTS "sourcingType" TEXT;

ALTER TABLE "mm_supplier_documents" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "mm_supplier_documents" ADD COLUMN IF NOT EXISTS "isRequiredForPurchasing" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "mm_supplier_documents_expiresAt_idx" ON "mm_supplier_documents"("expiresAt");

ALTER TABLE "mm_purchase_requisitions" ADD COLUMN IF NOT EXISTS "budgetValidatedAt" TIMESTAMP(3);

ALTER TABLE "mm_supplier_quotation_lines" ADD COLUMN IF NOT EXISTS "pricingTiers" JSONB;

ALTER TABLE "mm_purchase_contract_lines" ADD COLUMN IF NOT EXISTS "contractQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_purchase_contract_lines" ADD COLUMN IF NOT EXISTS "releasedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "mm_purchase_orders" ADD COLUMN IF NOT EXISTS "purchaseContractId" TEXT;
ALTER TABLE "mm_purchase_orders" ADD COLUMN IF NOT EXISTS "contractReleaseId" TEXT;
ALTER TABLE "mm_purchase_orders" ADD COLUMN IF NOT EXISTS "revisionNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "mm_purchase_orders" ADD COLUMN IF NOT EXISTS "budgetValidatedAt" TIMESTAMP(3);
ALTER TABLE "mm_purchase_orders" ADD COLUMN IF NOT EXISTS "commitmentRecordedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_purchase_orders_contractReleaseId_key" ON "mm_purchase_orders"("contractReleaseId");
CREATE INDEX IF NOT EXISTS "mm_purchase_orders_purchaseContractId_idx" ON "mm_purchase_orders"("purchaseContractId");

ALTER TABLE "mm_purchase_orders" ADD CONSTRAINT "mm_purchase_orders_purchaseContractId_fkey"
  FOREIGN KEY ("purchaseContractId") REFERENCES "mm_purchase_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_purchase_contract_releases" (
    "id" TEXT NOT NULL,
    "releaseNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RELEASED',
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_purchase_contract_releases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_purchase_contract_releases_releaseNumber_key" ON "mm_purchase_contract_releases"("releaseNumber");
CREATE INDEX IF NOT EXISTS "mm_purchase_contract_releases_contractId_idx" ON "mm_purchase_contract_releases"("contractId");
CREATE INDEX IF NOT EXISTS "mm_purchase_contract_releases_releasedAt_idx" ON "mm_purchase_contract_releases"("releasedAt");

ALTER TABLE "mm_purchase_contract_releases" ADD CONSTRAINT "mm_purchase_contract_releases_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "mm_purchase_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_purchase_contract_release_lines" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "contractLineId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    CONSTRAINT "mm_purchase_contract_release_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_purchase_contract_release_lines_releaseId_idx" ON "mm_purchase_contract_release_lines"("releaseId");
CREATE INDEX IF NOT EXISTS "mm_purchase_contract_release_lines_contractLineId_idx" ON "mm_purchase_contract_release_lines"("contractLineId");

ALTER TABLE "mm_purchase_contract_release_lines" ADD CONSTRAINT "mm_purchase_contract_release_lines_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "mm_purchase_contract_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mm_purchase_contract_release_lines" ADD CONSTRAINT "mm_purchase_contract_release_lines_contractLineId_fkey"
  FOREIGN KEY ("contractLineId") REFERENCES "mm_purchase_contract_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mm_purchase_orders" ADD CONSTRAINT "mm_purchase_orders_contractReleaseId_fkey"
  FOREIGN KEY ("contractReleaseId") REFERENCES "mm_purchase_contract_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_purchase_contract_audits" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "performedBy" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,
    CONSTRAINT "mm_purchase_contract_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_purchase_contract_audits_contractId_idx" ON "mm_purchase_contract_audits"("contractId");
CREATE INDEX IF NOT EXISTS "mm_purchase_contract_audits_performedAt_idx" ON "mm_purchase_contract_audits"("performedAt");

ALTER TABLE "mm_purchase_contract_audits" ADD CONSTRAINT "mm_purchase_contract_audits_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "mm_purchase_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_purchase_commitments" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currencyId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "createdBy" TEXT,
    CONSTRAINT "mm_purchase_commitments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_purchase_commitments_purchaseOrderId_idx" ON "mm_purchase_commitments"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "mm_purchase_commitments_companyId_idx" ON "mm_purchase_commitments"("companyId");
CREATE INDEX IF NOT EXISTS "mm_purchase_commitments_status_idx" ON "mm_purchase_commitments"("status");

ALTER TABLE "mm_purchase_commitments" ADD CONSTRAINT "mm_purchase_commitments_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "mm_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_purchase_order_revisions" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "revisedBy" TEXT,
    "revisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_purchase_order_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_purchase_order_revisions_purchaseOrderId_revisionNumber_key"
  ON "mm_purchase_order_revisions"("purchaseOrderId", "revisionNumber");
CREATE INDEX IF NOT EXISTS "mm_purchase_order_revisions_purchaseOrderId_idx" ON "mm_purchase_order_revisions"("purchaseOrderId");

ALTER TABLE "mm_purchase_order_revisions" ADD CONSTRAINT "mm_purchase_order_revisions_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "mm_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_quotation_comparisons" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "comparedBy" TEXT,
    "comparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criteria" JSONB,
    "results" JSONB NOT NULL,
    "selectedQuotationId" TEXT,
    "selectionReason" TEXT,
    CONSTRAINT "mm_quotation_comparisons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_quotation_comparisons_rfqId_idx" ON "mm_quotation_comparisons"("rfqId");
CREATE INDEX IF NOT EXISTS "mm_quotation_comparisons_comparedAt_idx" ON "mm_quotation_comparisons"("comparedAt");

ALTER TABLE "mm_quotation_comparisons" ADD CONSTRAINT "mm_quotation_comparisons_rfqId_fkey"
  FOREIGN KEY ("rfqId") REFERENCES "mm_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
