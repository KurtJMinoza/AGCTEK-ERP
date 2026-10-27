-- ISO 9001 receiving: GR verification workflow, GR-linked variances, material receiving tolerances, audit trail

ALTER TABLE "mm_goods_receipts"
ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "submittedBy" TEXT,
ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "verifiedBy" TEXT,
ADD COLUMN IF NOT EXISTS "verificationNotes" TEXT;

ALTER TABLE "mm_receiving_variances"
ALTER COLUMN "receivingDocumentId" DROP NOT NULL;

ALTER TABLE "mm_receiving_variances"
ADD COLUMN IF NOT EXISTS "goodsReceiptId" TEXT,
ADD COLUMN IF NOT EXISTS "goodsReceiptLineId" TEXT,
ADD COLUMN IF NOT EXISTS "varianceNumber" TEXT,
ADD COLUMN IF NOT EXISTS "severity" TEXT DEFAULT 'MEDIUM',
ADD COLUMN IF NOT EXISTS "companyId" TEXT;

ALTER TABLE "mm_materials"
ADD COLUMN IF NOT EXISTS "receivingTolerancePct" DECIMAL(8,4),
ADD COLUMN IF NOT EXISTS "overReceiptTolerancePct" DECIMAL(8,4),
ADD COLUMN IF NOT EXISTS "underReceiptTolerancePct" DECIMAL(8,4),
ADD COLUMN IF NOT EXISTS "requiresCoa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "requiresSupplierCertificate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "damagePhotoRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "nonconformanceOnRejection" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "defaultQuarantineWarehouseId" TEXT,
ADD COLUMN IF NOT EXISTS "defaultQuarantineBinId" TEXT;

CREATE TABLE IF NOT EXISTS "mm_goods_receipt_audits" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "companyId" TEXT,
    CONSTRAINT "mm_goods_receipt_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_goods_receipt_audits_goodsReceiptId_idx"
ON "mm_goods_receipt_audits"("goodsReceiptId");

ALTER TABLE "mm_receiving_variances"
ADD CONSTRAINT "mm_receiving_variances_goodsReceiptId_fkey"
FOREIGN KEY ("goodsReceiptId") REFERENCES "mm_goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mm_receiving_variances"
ADD CONSTRAINT "mm_receiving_variances_goodsReceiptLineId_fkey"
FOREIGN KEY ("goodsReceiptLineId") REFERENCES "mm_goods_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "mm_receiving_variances_varianceNumber_key"
ON "mm_receiving_variances"("varianceNumber")
WHERE "varianceNumber" IS NOT NULL;
