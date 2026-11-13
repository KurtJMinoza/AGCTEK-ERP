-- Retail POS: cashier shifts, split tenders, held sales, receipt and tax fields.
-- Non-destructive: additive columns + new tables; the per-order payment unique
-- constraint is relaxed so one sale can carry several tenders.

DROP INDEX IF EXISTS "sd_sales_order_payments_salesOrderId_key";

ALTER TABLE "sd_sales_orders"
    ADD COLUMN "taxAmount" DECIMAL(18, 4),
    ADD COLUMN "posSessionId" TEXT,
    ADD COLUMN "cashierUserId" TEXT,
    ADD COLUMN "receiptNumber" TEXT;

CREATE INDEX "sd_sales_orders_posSessionId_idx" ON "sd_sales_orders"("posSessionId");
CREATE UNIQUE INDEX "sd_sales_orders_companyId_receiptNumber_key" ON "sd_sales_orders"("companyId", "receiptNumber");

ALTER TABLE "sd_sales_order_payments"
    ADD COLUMN "tenderAmount" DECIMAL(18, 4) NOT NULL DEFAULT 0,
    ADD COLUMN "changeAmount" DECIMAL(18, 4) NOT NULL DEFAULT 0,
    ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
    ADD COLUMN "posSessionId" TEXT,
    ADD COLUMN "idempotencyKey" TEXT,
    ADD COLUMN "bankName" TEXT,
    ADD COLUMN "transactionDate" TIMESTAMP(3),
    ADD COLUMN "employeeNumber" TEXT,
    ADD COLUMN "payrollReference" TEXT,
    ADD COLUMN "collectedBy" TEXT;

CREATE INDEX "sd_sales_order_payments_salesOrderId_idx" ON "sd_sales_order_payments"("salesOrderId");
CREATE INDEX "sd_sales_order_payments_posSessionId_idx" ON "sd_sales_order_payments"("posSessionId");
CREATE UNIQUE INDEX "sd_sales_order_payments_idempotencyKey_key" ON "sd_sales_order_payments"("idempotencyKey");

CREATE TABLE "sd_pos_sessions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "terminalCode" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "openingCash" DECIMAL(18, 4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "expectedCash" DECIMAL(18, 4),
    "countedCash" DECIMAL(18, 4),
    "varianceCash" DECIMAL(18, 4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_pos_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sd_pos_sessions_companyId_status_idx" ON "sd_pos_sessions"("companyId", "status");
CREATE INDEX "sd_pos_sessions_branchId_status_idx" ON "sd_pos_sessions"("branchId", "status");

ALTER TABLE "sd_pos_sessions"
    ADD CONSTRAINT "sd_pos_sessions_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sd_pos_holds" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "posSessionId" TEXT,
    "customerName" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "sd_pos_holds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sd_pos_holds_companyId_status_idx" ON "sd_pos_holds"("companyId", "status");
CREATE INDEX "sd_pos_holds_branchId_createdAt_idx" ON "sd_pos_holds"("branchId", "createdAt");

ALTER TABLE "sd_pos_holds"
    ADD CONSTRAINT "sd_pos_holds_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sd_pos_holds"
    ADD CONSTRAINT "sd_pos_holds_posSessionId_fkey"
    FOREIGN KEY ("posSessionId") REFERENCES "sd_pos_sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sd_sales_orders"
    ADD CONSTRAINT "sd_sales_orders_posSessionId_fkey"
    FOREIGN KEY ("posSessionId") REFERENCES "sd_pos_sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sd_sales_order_payments"
    ADD CONSTRAINT "sd_sales_order_payments_posSessionId_fkey"
    FOREIGN KEY ("posSessionId") REFERENCES "sd_pos_sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
