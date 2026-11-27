-- Channel sale tax: POS vs marketplace can differ while MM material keeps one product tax.

ALTER TABLE "fico_company_accounting_settings"
    ADD COLUMN IF NOT EXISTS "posSaleTaxPolicy" TEXT NOT NULL DEFAULT 'FOLLOW_MATERIAL';

ALTER TABLE "sd_sales_sources"
    ADD COLUMN IF NOT EXISTS "saleTaxPolicy" TEXT NOT NULL DEFAULT 'FOLLOW_MATERIAL';