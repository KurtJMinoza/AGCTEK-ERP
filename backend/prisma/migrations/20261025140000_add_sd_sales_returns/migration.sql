-- AlterTable
ALTER TABLE "DamageReport" ADD COLUMN "sdSalesReturnId" TEXT;

-- CreateTable
CREATE TABLE "sd_sales_returns" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "damageReportId" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3),
    "authorizedBy" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "cancelBy" TEXT,
    "cancelAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_sales_return_lines" (
    "id" TEXT NOT NULL,
    "salesReturnId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "salesOrderLineId" TEXT NOT NULL,
    "materialId" TEXT,
    "sku" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "uomId" TEXT,
    "disposition" TEXT,

    CONSTRAINT "sd_sales_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_sales_return_audits" (
    "id" TEXT NOT NULL,
    "salesReturnId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT,
    "details" JSONB,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_sales_return_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sd_sales_returns_returnNumber_key" ON "sd_sales_returns"("returnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sd_sales_returns_damageReportId_key" ON "sd_sales_returns"("damageReportId");

-- CreateIndex
CREATE INDEX "sd_sales_returns_salesOrderId_idx" ON "sd_sales_returns"("salesOrderId");

-- CreateIndex
CREATE INDEX "sd_sales_returns_customerId_idx" ON "sd_sales_returns"("customerId");

-- CreateIndex
CREATE INDEX "sd_sales_returns_companyId_idx" ON "sd_sales_returns"("companyId");

-- CreateIndex
CREATE INDEX "sd_sales_returns_status_idx" ON "sd_sales_returns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sd_sales_return_lines_salesReturnId_lineNumber_key" ON "sd_sales_return_lines"("salesReturnId", "lineNumber");

-- CreateIndex
CREATE INDEX "sd_sales_return_lines_salesOrderLineId_idx" ON "sd_sales_return_lines"("salesOrderLineId");

-- CreateIndex
CREATE INDEX "sd_sales_return_lines_materialId_idx" ON "sd_sales_return_lines"("materialId");

-- CreateIndex
CREATE INDEX "sd_sales_return_audits_salesReturnId_performedAt_idx" ON "sd_sales_return_audits"("salesReturnId", "performedAt");

-- AddForeignKey
ALTER TABLE "sd_sales_returns" ADD CONSTRAINT "sd_sales_returns_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_sales_returns" ADD CONSTRAINT "sd_sales_returns_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_sales_returns" ADD CONSTRAINT "sd_sales_returns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_sales_return_lines" ADD CONSTRAINT "sd_sales_return_lines_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sd_sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_sales_return_lines" ADD CONSTRAINT "sd_sales_return_lines_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "sd_sales_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_sales_return_audits" ADD CONSTRAINT "sd_sales_return_audits_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sd_sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;