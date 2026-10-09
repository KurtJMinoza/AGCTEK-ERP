-- CreateTable
CREATE TABLE "DamageReport" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "shipmentLineId" TEXT,
    "salesOrderId" TEXT,
    "salesOrderStatus" TEXT NOT NULL DEFAULT 'UNRESOLVED',
    "reportedBy" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "damagedQuantity" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "photoUrls" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "customerReturnId" TEXT,
    "idempotencyKey" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DamageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageReportAudit" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "performedBy" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamageReportAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DamageReport_reference_key" ON "DamageReport"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "DamageReport_idempotencyKey_key" ON "DamageReport"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DamageReport_shipmentId_createdAt_idx" ON "DamageReport"("shipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "DamageReport_shipmentLineId_idx" ON "DamageReport"("shipmentLineId");

-- CreateIndex
CREATE INDEX "DamageReport_companyId_idx" ON "DamageReport"("companyId");

-- CreateIndex
CREATE INDEX "DamageReport_salesOrderId_idx" ON "DamageReport"("salesOrderId");

-- CreateIndex
CREATE INDEX "DamageReport_status_idx" ON "DamageReport"("status");

-- CreateIndex
CREATE INDEX "DamageReportAudit_reportId_performedAt_idx" ON "DamageReportAudit"("reportId", "performedAt");

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_shipmentLineId_fkey" FOREIGN KEY ("shipmentLineId") REFERENCES "ShipmentLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReportAudit" ADD CONSTRAINT "DamageReportAudit_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DamageReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;