-- AlterTable
ALTER TABLE "sd_sales_orders" ADD COLUMN     "quotationId" TEXT;

-- CreateTable
CREATE TABLE "sd_quotations" (
    "id" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "previousRevisionId" TEXT,
    "revisionReason" TEXT,
    "revisionNotes" TEXT,
    "crmOpportunityId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "divisionId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sentBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "convertedBy" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_quotation_lines" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sd_quotations_previousRevisionId_key" ON "sd_quotations"("previousRevisionId");

-- CreateIndex
CREATE INDEX "sd_quotations_crmOpportunityId_createdAt_idx" ON "sd_quotations"("crmOpportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "sd_quotations_customerId_idx" ON "sd_quotations"("customerId");

-- CreateIndex
CREATE INDEX "sd_quotations_status_validUntil_idx" ON "sd_quotations"("status", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "sd_quotations_quotationNumber_revision_key" ON "sd_quotations"("quotationNumber", "revision");

-- CreateIndex
CREATE INDEX "sd_quotation_lines_productId_idx" ON "sd_quotation_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "sd_quotation_lines_quotationId_lineNumber_key" ON "sd_quotation_lines"("quotationId", "lineNumber");

-- CreateIndex (a plain unique index allows many NULLs: orders created without a quotation)
CREATE UNIQUE INDEX "sd_sales_orders_quotationId_key" ON "sd_sales_orders"("quotationId");

-- AddForeignKey
ALTER TABLE "sd_sales_orders" ADD CONSTRAINT "sd_sales_orders_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "sd_quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_quotations" ADD CONSTRAINT "sd_quotations_previousRevisionId_fkey" FOREIGN KEY ("previousRevisionId") REFERENCES "sd_quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_quotations" ADD CONSTRAINT "sd_quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_quotation_lines" ADD CONSTRAINT "sd_quotation_lines_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "sd_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL that Prisma cannot model. WARNING: `prisma migrate diff` may propose
-- dropping the partial index below; remove that statement from any generated
-- migration. Do not drop it without reviewing the quotation concurrency rules.
-- ---------------------------------------------------------------------------

-- Quotation numbers (Q-000012). nextval is never rolled back, so aborted
-- creations leave gaps but can never produce duplicates. Revisions reuse the number.
CREATE SEQUENCE "sd_quotation_number_seq" AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

-- At most one active quotation per CRM opportunity.
CREATE UNIQUE INDEX "sd_quotations_one_active_per_opportunity"
    ON "sd_quotations" ("crmOpportunityId")
    WHERE "status" IN ('DRAFT', 'SENT', 'ACCEPTED');
