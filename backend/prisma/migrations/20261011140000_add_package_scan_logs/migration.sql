-- Packing scan audit trail: every barcode scan and manual adjustment is
-- recorded so the scanner-first packing screen can show a "Recently scanned"
-- feed and prove who counted what, when. Pending removal of the old
-- dropdown-only scan flow; the scan endpoint now validates package/item
-- membership, blocks over-scanning, and updates scannedQty atomically.
CREATE TABLE IF NOT EXISTS "wm_package_scan_logs" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "packageItemId" TEXT,
    "salesOrderId" TEXT,
    "packingSessionId" TEXT,
    "materialId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "scannedQuantity" DECIMAL(18,3) NOT NULL,
    "scannedByUserId" TEXT,
    "scannedByName" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanType" TEXT NOT NULL DEFAULT 'manual',
    "action" TEXT NOT NULL DEFAULT 'add',
    "reason" TEXT,
    "idempotencyKey" TEXT,

    CONSTRAINT "wm_package_scan_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wm_package_scan_logs_idempotencyKey_key" ON "wm_package_scan_logs"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "wm_package_scan_logs_packageId_scannedAt_idx" ON "wm_package_scan_logs"("packageId", "scannedAt");
CREATE INDEX IF NOT EXISTS "wm_package_scan_logs_packageItemId_idx" ON "wm_package_scan_logs"("packageItemId");
CREATE INDEX IF NOT EXISTS "wm_package_scan_logs_materialId_idx" ON "wm_package_scan_logs"("materialId");

ALTER TABLE "wm_package_scan_logs" ADD CONSTRAINT "wm_package_scan_logs_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "wm_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wm_package_scan_logs" ADD CONSTRAINT "wm_package_scan_logs_packageItemId_fkey" FOREIGN KEY ("packageItemId") REFERENCES "wm_package_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wm_package_scan_logs" ADD CONSTRAINT "wm_package_scan_logs_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
