-- Phase 7/8: Refund record (sd_refunds) + Credit memo (sd_credit_memos).
-- Refund status flow: PENDING_REFUND → APPROVED → PAID | FAILED. Credit memos
-- link to the ORIGINAL sales invoice, which is never deleted or overwritten.

-- CreateTable
CREATE TABLE "sd_refunds" (
    "id" TEXT NOT NULL,
    "refundNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "salesInvoiceId" TEXT,
    "returnRequestId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "refundMethod" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" TEXT NOT NULL DEFAULT 'PENDING_REFUND',
    "returnQuantity" DECIMAL(18,2) NOT NULL,
    "returnReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "failReason" TEXT,
    "failedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_credit_memos" (
    "id" TEXT NOT NULL,
    "creditMemoNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "salesInvoiceId" TEXT,
    "refundId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "returnQuantity" DECIMAL(18,2) NOT NULL,
    "returnReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_credit_memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sd_refunds_refundNumber_key" ON "sd_refunds"("refundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sd_refunds_returnRequestId_key" ON "sd_refunds"("returnRequestId");

-- CreateIndex
CREATE INDEX "sd_refunds_companyId_status_idx" ON "sd_refunds"("companyId", "status");

-- CreateIndex
CREATE INDEX "sd_refunds_salesOrderId_idx" ON "sd_refunds"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "sd_credit_memos_creditMemoNumber_key" ON "sd_credit_memos"("creditMemoNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sd_credit_memos_refundId_key" ON "sd_credit_memos"("refundId");

-- CreateIndex
CREATE INDEX "sd_credit_memos_companyId_status_idx" ON "sd_credit_memos"("companyId", "status");

-- CreateIndex
CREATE INDEX "sd_credit_memos_salesOrderId_idx" ON "sd_credit_memos"("salesOrderId");

-- AddForeignKey
ALTER TABLE "sd_refunds" ADD CONSTRAINT "sd_refunds_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "sd_return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_credit_memos" ADD CONSTRAINT "sd_credit_memos_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "sd_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;