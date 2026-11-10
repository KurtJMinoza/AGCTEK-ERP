-- Add SD customer account type and credit fields.
-- customer_account_type: NON_CREDIT (cash, no credit limit) | CREDIT (credit limit, approval workflow)
-- customer_category: RETAIL | CORPORATE | EMPLOYEE | WHOLESALE
-- payment_terms: IMMEDIATE (pay now) | NET_30 (pay within terms)
-- credit_status: NOT_APPLICABLE (non-credit) | PENDING | APPROVED | SUSPENDED
--
-- The retired customer_type (RETAIL | B2B) column is backfilled into the new
-- columns then dropped: B2B -> CREDIT / PENDING, everything else -> NON_CREDIT / NOT_APPLICABLE.

ALTER TABLE "sd_customers"
    ADD COLUMN "customerAccountType" text NOT NULL DEFAULT 'NON_CREDIT',
    ADD COLUMN "customerCategory" text NOT NULL DEFAULT 'RETAIL',
    ADD COLUMN "paymentTerms" text NOT NULL DEFAULT 'IMMEDIATE',
    ADD COLUMN "creditStatus" text NOT NULL DEFAULT 'NOT_APPLICABLE';

UPDATE "sd_customers"
SET "customerAccountType" = 'CREDIT',
    "creditStatus" = 'PENDING'
WHERE "customerType" = 'B2B';

ALTER TABLE "sd_customers"
    DROP COLUMN "customerType";
