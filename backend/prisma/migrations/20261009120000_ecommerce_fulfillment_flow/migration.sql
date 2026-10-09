-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShipmentStatus" ADD VALUE 'DISPATCHED';
ALTER TYPE "ShipmentStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "ShipmentLine" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "wm_packages" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "wm_packing_sessions" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "wm_picking_tasks" ADD COLUMN     "salesOrderId" TEXT,
ADD COLUMN     "salesOrderLineId" TEXT;

-- CreateTable
CREATE TABLE "sd_sales_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "shippingAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refundedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_sales_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "salesOrderLineId" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT NOT NULL,
    "variantName" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "lineTotal" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "sd_sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_return_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "conditionNote" TEXT,
    "photos" JSONB,
    "mmCustomerReturnId" TEXT,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_return_request_lines" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "salesOrderLineId" TEXT NOT NULL,
    "variantId" TEXT,
    "materialId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "reason" TEXT,
    "conditionNote" TEXT,
    "disposition" TEXT,

    CONSTRAINT "sd_return_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sd_sales_invoices_invoiceNumber_key" ON "sd_sales_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "sd_sales_invoices_companyId_status_idx" ON "sd_sales_invoices"("companyId", "status");

-- CreateIndex
CREATE INDEX "sd_sales_invoices_shipmentId_idx" ON "sd_sales_invoices"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "sd_sales_invoices_salesOrderId_key" ON "sd_sales_invoices"("salesOrderId");

-- CreateIndex
CREATE INDEX "sd_sales_invoice_lines_salesOrderLineId_idx" ON "sd_sales_invoice_lines"("salesOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "sd_sales_invoice_lines_invoiceId_salesOrderLineId_key" ON "sd_sales_invoice_lines"("invoiceId", "salesOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "sd_return_requests_requestNumber_key" ON "sd_return_requests"("requestNumber");

-- CreateIndex
CREATE INDEX "sd_return_requests_companyId_status_idx" ON "sd_return_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "sd_return_requests_salesOrderId_idx" ON "sd_return_requests"("salesOrderId");

-- CreateIndex
CREATE INDEX "sd_return_request_lines_salesOrderLineId_idx" ON "sd_return_request_lines"("salesOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "sd_return_request_lines_returnRequestId_salesOrderLineId_key" ON "sd_return_request_lines"("returnRequestId", "salesOrderLineId");

-- CreateIndex
CREATE INDEX "Shipment_companyId_status_idx" ON "Shipment"("companyId", "status");

-- CreateIndex
CREATE INDEX "wm_packages_companyId_status_idx" ON "wm_packages"("companyId", "status");

-- CreateIndex
CREATE INDEX "wm_packing_sessions_companyId_status_idx" ON "wm_packing_sessions"("companyId", "status");

-- CreateIndex
CREATE INDEX "wm_picking_tasks_salesOrderId_idx" ON "wm_picking_tasks"("salesOrderId");

-- CreateIndex
CREATE INDEX "wm_picking_tasks_salesOrderLineId_idx" ON "wm_picking_tasks"("salesOrderLineId");

-- AddForeignKey
ALTER TABLE "wm_picking_tasks" ADD CONSTRAINT "wm_picking_tasks_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wm_picking_tasks" ADD CONSTRAINT "wm_picking_tasks_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "sd_sales_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_sales_invoices" ADD CONSTRAINT "sd_sales_invoices_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_sales_invoice_lines" ADD CONSTRAINT "sd_sales_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sd_sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_sales_invoice_lines" ADD CONSTRAINT "sd_sales_invoice_lines_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "sd_sales_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_return_requests" ADD CONSTRAINT "sd_return_requests_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_return_request_lines" ADD CONSTRAINT "sd_return_request_lines_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "sd_return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_return_request_lines" ADD CONSTRAINT "sd_return_request_lines_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "sd_sales_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

