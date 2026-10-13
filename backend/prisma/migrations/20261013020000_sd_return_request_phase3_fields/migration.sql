-- Phase 2/3: SD Sales Return — eligibility + customer return request fields.
-- 1) Customer return requests (RET-...) gain the record fields required for
--    return handling and refund resolution (Phase 4 consumes refundStatus).
-- 2) Notification drift from the upstream pull (title/message/isRead) is
--    captured here so schema.prisma and the live DB stay in parity.
-- 3) Obsolete indexes produced by schema parity diff (fields no longer
--    indexed in the Prisma schema).

-- DropIndex
DROP INDEX "mm_customer_returns_damageReportId_idx";

-- DropIndex
DROP INDEX "sd_sales_order_lines_companyId_idx";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "message" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "target" SET DEFAULT '',
ALTER COLUMN "description" SET DEFAULT '';

-- AlterTable
ALTER TABLE "sd_return_requests" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "preferredResolution" TEXT,
ADD COLUMN     "refundStatus" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "warehouseId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");