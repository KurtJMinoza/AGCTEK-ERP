-- Add SD customer payment mode.
-- paymentMode: CASH | BANK_TRANSFER | LOAN_SALARY_DEDUCT — how a non-credit customer pays.
ALTER TABLE "sd_customers"
    ADD COLUMN "paymentMode" text NOT NULL DEFAULT 'CASH';
