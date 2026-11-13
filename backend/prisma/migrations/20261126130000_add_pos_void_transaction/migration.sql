-- A void of a completed POS sale is a transaction of its own: the reversal
-- entry that follows the sale in the register history. At most one per sale.
CREATE TABLE "sd_pos_void_transactions" (
    "id" TEXT NOT NULL,
    "voidNumber" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "originalReceiptNumber" TEXT,
    "companyId" TEXT,
    "branchId" TEXT,
    "posSessionId" TEXT,
    "cashierUserId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "amount" DECIMAL(65,30) NOT NULL,
    "reason" TEXT NOT NULL,
    "voidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_pos_void_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sd_pos_void_transactions_salesOrderId_key" ON "sd_pos_void_transactions"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "sd_pos_void_transactions_companyId_voidNumber_key" ON "sd_pos_void_transactions"("companyId", "voidNumber");

-- CreateIndex
CREATE INDEX "sd_pos_void_transactions_companyId_createdAt_idx" ON "sd_pos_void_transactions"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "sd_pos_void_transactions_branchId_createdAt_idx" ON "sd_pos_void_transactions"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "sd_pos_void_transactions" ADD CONSTRAINT "sd_pos_void_transactions_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
