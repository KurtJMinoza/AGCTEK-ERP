-- Phase 04: MM document accounting posting status (physical ≠ financial)
ALTER TABLE "mm_goods_receipts" ADD COLUMN "accountingPostingStatus" TEXT NOT NULL DEFAULT 'NOT_FINANCIALLY_RELEVANT';
ALTER TABLE "mm_goods_issues" ADD COLUMN "accountingPostingStatus" TEXT NOT NULL DEFAULT 'NOT_FINANCIALLY_RELEVANT';
ALTER TABLE "mm_inventory_adjustments" ADD COLUMN "accountingPostingStatus" TEXT NOT NULL DEFAULT 'NOT_FINANCIALLY_RELEVANT';
ALTER TABLE "mm_supplier_returns" ADD COLUMN "accountingPostingStatus" TEXT NOT NULL DEFAULT 'NOT_FINANCIALLY_RELEVANT';
ALTER TABLE "mm_customer_returns" ADD COLUMN "accountingPostingStatus" TEXT NOT NULL DEFAULT 'NOT_FINANCIALLY_RELEVANT';
ALTER TABLE "mm_disposals" ADD COLUMN "accountingPostingStatus" TEXT NOT NULL DEFAULT 'NOT_FINANCIALLY_RELEVANT';