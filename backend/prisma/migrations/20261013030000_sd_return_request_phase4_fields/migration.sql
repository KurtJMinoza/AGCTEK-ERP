-- Phase 4: Sales Return module — refund + status stamp fields on customer
-- return requests (sd_return_requests).

-- AlterTable
ALTER TABLE "sd_return_requests" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "refundAmount" DECIMAL(18,2),
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedBy" TEXT,
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3);