-- Link FICO AR open items to POS charge / unpaid POS sales (reuse pos-revenue journal; no second GL).
-- Also make sourceSalesInvoiceId nullable so POS rows need no SD invoice.

ALTER TABLE "fico_ar_documents"
    ALTER COLUMN "sourceSalesInvoiceId" DROP NOT NULL;

ALTER TABLE "fico_ar_documents"
    ADD COLUMN "sourceSalesOrderId" TEXT,
    ADD COLUMN "sourcePosReceivableId" TEXT;

CREATE UNIQUE INDEX "fico_ar_documents_sourceSalesOrderId_key"
    ON "fico_ar_documents"("sourceSalesOrderId");

CREATE UNIQUE INDEX "fico_ar_documents_sourcePosReceivableId_key"
    ON "fico_ar_documents"("sourcePosReceivableId");

ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_sourceSalesOrderId_fkey"
    FOREIGN KEY ("sourceSalesOrderId") REFERENCES "sd_sales_orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_sourcePosReceivableId_fkey"
    FOREIGN KEY ("sourcePosReceivableId") REFERENCES "sd_pos_receivables"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
