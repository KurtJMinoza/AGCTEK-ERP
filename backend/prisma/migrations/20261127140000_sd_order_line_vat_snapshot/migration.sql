-- VAT snapshot per sales order line (POS), frozen at sale time. Additive only.
ALTER TABLE "sd_sales_order_lines"
    ADD COLUMN "taxClassification" TEXT,
    ADD COLUMN "taxCode"           TEXT,
    ADD COLUMN "taxRate"           DECIMAL(18,6),
    ADD COLUMN "taxTreatment"      TEXT,
    ADD COLUMN "taxAmount"         DECIMAL(18,4) NOT NULL DEFAULT 0,
    ADD COLUMN "taxableAmount"     DECIMAL(18,4);
