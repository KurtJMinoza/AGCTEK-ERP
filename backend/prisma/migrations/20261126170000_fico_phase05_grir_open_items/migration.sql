-- Phase 05: GR/IR line-level open-item subledger
CREATE TABLE "fico_grir_open_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT,
    "purchaseOrderId" TEXT,
    "purchaseOrderLineId" TEXT,
    "goodsReceiptId" TEXT NOT NULL,
    "goodsReceiptLineId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "plantId" TEXT,
    "warehouseId" TEXT,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'PHP',
    "receivedQuantity" DECIMAL(18,4) NOT NULL,
    "invoicedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "returnedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "receiptValuation" DECIMAL(18,4) NOT NULL,
    "invoiceValuation" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "clearedAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(18,4) NOT NULL,
    "goodsReceiptJournalEntryId" TEXT,
    "lastInvoiceJournalEntryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'GR_NOT_INVOICED',
    "receiptPostedAt" TIMESTAMP(3) NOT NULL,
    "lastClearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fico_grir_open_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fico_grir_open_items_goodsReceiptLineId_key" ON "fico_grir_open_items"("goodsReceiptLineId");
CREATE INDEX "fico_grir_open_items_companyId_status_idx" ON "fico_grir_open_items"("companyId", "status");
CREATE INDEX "fico_grir_open_items_companyId_supplierId_idx" ON "fico_grir_open_items"("companyId", "supplierId");
CREATE INDEX "fico_grir_open_items_companyId_reconciliationStatus_idx" ON "fico_grir_open_items"("companyId", "reconciliationStatus");
CREATE INDEX "fico_grir_open_items_purchaseOrderId_idx" ON "fico_grir_open_items"("purchaseOrderId");
CREATE INDEX "fico_grir_open_items_goodsReceiptId_idx" ON "fico_grir_open_items"("goodsReceiptId");

ALTER TABLE "fico_grir_open_items" ADD CONSTRAINT "fico_grir_open_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_grir_open_items" ADD CONSTRAINT "fico_grir_open_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "mm_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_grir_open_items" ADD CONSTRAINT "fico_grir_open_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "mm_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_grir_open_items" ADD CONSTRAINT "fico_grir_open_items_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "mm_purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_grir_open_items" ADD CONSTRAINT "fico_grir_open_items_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "mm_goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_grir_open_items" ADD CONSTRAINT "fico_grir_open_items_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "mm_goods_receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_grir_open_items" ADD CONSTRAINT "fico_grir_open_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;