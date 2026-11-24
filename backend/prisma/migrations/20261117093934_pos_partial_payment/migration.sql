-- Phase A: POS partial payment, receivables, collections, employee loan items

-- New fields on sd_sales_orders
ALTER TABLE "sd_sales_orders" ADD COLUMN "outstandingBalance" DECIMAL(18,2) DEFAULT 0;
ALTER TABLE "sd_sales_orders" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "sd_sales_orders" ADD COLUMN "downPaymentType" TEXT;
ALTER TABLE "sd_sales_orders" ADD COLUMN "downPaymentPct" DECIMAL(5,2);
ALTER TABLE "sd_sales_orders" ADD COLUMN "downPaymentAmount" DECIMAL(18,2);

-- collectionId on sd_sales_order_payments
ALTER TABLE "sd_sales_order_payments" ADD COLUMN "collectionId" TEXT;

-- SdPosReceivable
CREATE TABLE "sd_pos_receivables" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "employeeId" TEXT,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pendingAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_pos_receivables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sd_pos_receivables_salesOrderId_key" ON "sd_pos_receivables"("salesOrderId");
CREATE INDEX "sd_pos_receivables_companyId_status_idx" ON "sd_pos_receivables"("companyId", "status");
CREATE INDEX "sd_pos_receivables_customerId_idx" ON "sd_pos_receivables"("customerId");

ALTER TABLE "sd_pos_receivables"
    ADD CONSTRAINT "sd_pos_receivables_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_pos_receivables"
    ADD CONSTRAINT "sd_pos_receivables_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SdPosCollection
CREATE TABLE "sd_pos_collections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "collectionNumber" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "posSessionId" TEXT,
    "collectedBy" TEXT,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_pos_collections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sd_pos_collections_collectionNumber_key" ON "sd_pos_collections"("collectionNumber");
CREATE UNIQUE INDEX "sd_pos_collections_idempotencyKey_key" ON "sd_pos_collections"("idempotencyKey");
CREATE INDEX "sd_pos_collections_companyId_createdAt_idx" ON "sd_pos_collections"("companyId", "createdAt");
CREATE INDEX "sd_pos_collections_receivableId_idx" ON "sd_pos_collections"("receivableId");
CREATE INDEX "sd_pos_collections_salesOrderId_idx" ON "sd_pos_collections"("salesOrderId");

ALTER TABLE "sd_pos_collections"
    ADD CONSTRAINT "sd_pos_collections_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_pos_collections"
    ADD CONSTRAINT "sd_pos_collections_receivableId_fkey"
    FOREIGN KEY ("receivableId") REFERENCES "sd_pos_receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sd_pos_collections"
    ADD CONSTRAINT "sd_pos_collections_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- collectionId FK on payments
CREATE INDEX "sd_sales_order_payments_collectionId_idx" ON "sd_sales_order_payments"("collectionId");
ALTER TABLE "sd_sales_order_payments"
    ADD CONSTRAINT "sd_sales_order_payments_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "sd_pos_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SdEmployeeLoanItem
CREATE TABLE "sd_employee_loan_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "salesOrderLineId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "sku" TEXT,
    "productName" TEXT,
    "variantName" TEXT,
    "barcode" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "loanAmount" DECIMAL(18,2) NOT NULL,
    "repaidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_employee_loan_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sd_employee_loan_items_companyId_idx" ON "sd_employee_loan_items"("companyId");
CREATE INDEX "sd_employee_loan_items_salesOrderId_idx" ON "sd_employee_loan_items"("salesOrderId");
CREATE INDEX "sd_employee_loan_items_customerId_status_idx" ON "sd_employee_loan_items"("customerId", "status");
CREATE INDEX "sd_employee_loan_items_employeeNumber_status_idx" ON "sd_employee_loan_items"("employeeNumber", "status");

ALTER TABLE "sd_employee_loan_items"
    ADD CONSTRAINT "sd_employee_loan_items_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_employee_loan_items"
    ADD CONSTRAINT "sd_employee_loan_items_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
