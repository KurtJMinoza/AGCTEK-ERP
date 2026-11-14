-- AlterTable
ALTER TABLE "fico_journal_entries" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT';
-- AlterTable
ALTER TABLE "fico_journal_entries" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT true;
-- AlterTable
ALTER TABLE "fico_journal_entries" ADD COLUMN "preparedBy" TEXT;
-- AlterTable
ALTER TABLE "fico_journal_entries" ADD COLUMN "preparedAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "fico_journal_entries" ADD COLUMN "reviewedBy" TEXT;
-- AlterTable
ALTER TABLE "fico_journal_entries" ADD COLUMN "reviewedAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "fico_journal_entries" ADD COLUMN "approvedBy" TEXT;
-- AlterTable
ALTER TABLE "fico_journal_entries" ADD COLUMN "approvedAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "fico_journal_entries" ADD COLUMN "rejectionReason" TEXT;
-- AlterTable
ALTER TABLE "fico_journal_entries" ADD COLUMN "rejectedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "fico_journal_entries_companyId_approvalStatus_idx" ON "fico_journal_entries"("companyId", "approvalStatus");
