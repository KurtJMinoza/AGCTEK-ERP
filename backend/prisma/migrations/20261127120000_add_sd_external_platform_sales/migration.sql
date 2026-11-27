-- SD External Platform Sales: configurable sales sources + manual transaction entry

-- ── Sales Sources (configurable channel/platform labels) ──
CREATE TABLE "sd_sales_sources" (
    "id"          TEXT NOT NULL,
    "code"        TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "badgeColor"  TEXT,
    "origin"      TEXT NOT NULL DEFAULT 'USER',
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "createdBy"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sd_sales_sources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sd_sales_sources_code_key" ON "sd_sales_sources"("code");
CREATE INDEX "sd_sales_sources_isActive_sortOrder_idx" ON "sd_sales_sources"("isActive", "sortOrder");

-- ── External Platform Transaction (header) ──
CREATE TABLE "sd_ext_platform_transactions" (
    "id"                   TEXT NOT NULL,
    "transactionNumber"    TEXT NOT NULL,
    "salesSourceId"        TEXT NOT NULL,
    "externalPlatformName" TEXT,
    "externalOrderRef"     TEXT,
    "transactionDate"      DATE NOT NULL,
    "companyId"            TEXT NOT NULL,
    "branchId"             TEXT,
    "customerId"           TEXT,
    "customerName"         TEXT,
    "currency"             TEXT NOT NULL DEFAULT 'PHP',
    "status"               TEXT NOT NULL DEFAULT 'DRAFT',
    "subtotal"             DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountTotal"        DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxTotal"             DECIMAL(18,4) NOT NULL DEFAULT 0,
    "grandTotal"           DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paymentMethod"        TEXT,
    "settlementReference"  TEXT,
    "platformFees"         DECIMAL(18,4) NOT NULL DEFAULT 0,
    "remarks"              TEXT,
    "isCompanyInventory"   BOOLEAN NOT NULL DEFAULT true,
    "createdBy"            TEXT,
    "approvedBy"           TEXT,
    "approvedAt"           TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sd_ext_platform_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sd_ext_platform_transactions_transactionNumber_key"
    ON "sd_ext_platform_transactions"("transactionNumber");
CREATE UNIQUE INDEX "sd_ext_platform_transactions_salesSourceId_companyId_externalOrderRef_key"
    ON "sd_ext_platform_transactions"("salesSourceId", "companyId", "externalOrderRef");
CREATE INDEX "sd_ext_platform_transactions_companyId_status_idx"
    ON "sd_ext_platform_transactions"("companyId", "status");
CREATE INDEX "sd_ext_platform_transactions_salesSourceId_transactionDate_idx"
    ON "sd_ext_platform_transactions"("salesSourceId", "transactionDate");
CREATE INDEX "sd_ext_platform_transactions_transactionDate_idx"
    ON "sd_ext_platform_transactions"("transactionDate");
CREATE INDEX "sd_ext_platform_transactions_branchId_idx"
    ON "sd_ext_platform_transactions"("branchId");

-- ── External Platform Transaction Lines ──
CREATE TABLE "sd_ext_platform_transaction_lines" (
    "id"                TEXT NOT NULL,
    "transactionId"     TEXT NOT NULL,
    "lineNumber"        INTEGER NOT NULL,
    "materialId"        TEXT NOT NULL,
    "materialCode"      TEXT,
    "materialName"      TEXT,
    "sku"               TEXT,
    "description"       TEXT,
    "quantity"          DECIMAL(18,4) NOT NULL,
    "uomId"            TEXT,
    "unitPrice"        DECIMAL(18,4) NOT NULL,
    "discount"         DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineSubtotal"     DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxClassification" TEXT,
    "taxCodeId"        TEXT,
    "taxCode"          TEXT,
    "taxRate"          DECIMAL(18,6),
    "calculationMethod" TEXT,
    "taxableAmount"    DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxAmount"        DECIMAL(18,4) NOT NULL DEFAULT 0,
    "exemptAmount"     DECIMAL(18,4) NOT NULL DEFAULT 0,
    "zeroRatedAmount"  DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netAmount"        DECIMAL(18,4) NOT NULL DEFAULT 0,
    "grossAmount"      DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sd_ext_platform_transaction_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sd_ext_platform_transaction_lines_transactionId_lineNumber_key"
    ON "sd_ext_platform_transaction_lines"("transactionId", "lineNumber");
CREATE INDEX "sd_ext_platform_transaction_lines_materialId_idx"
    ON "sd_ext_platform_transaction_lines"("materialId");

-- ── Foreign keys ──
ALTER TABLE "sd_ext_platform_transactions"
    ADD CONSTRAINT "sd_ext_platform_transactions_salesSourceId_fkey"
    FOREIGN KEY ("salesSourceId") REFERENCES "sd_sales_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sd_ext_platform_transactions"
    ADD CONSTRAINT "sd_ext_platform_transactions_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sd_ext_platform_transactions"
    ADD CONSTRAINT "sd_ext_platform_transactions_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sd_ext_platform_transactions"
    ADD CONSTRAINT "sd_ext_platform_transactions_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sd_ext_platform_transaction_lines"
    ADD CONSTRAINT "sd_ext_platform_transaction_lines_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "sd_ext_platform_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sd_ext_platform_transaction_lines"
    ADD CONSTRAINT "sd_ext_platform_transaction_lines_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sd_ext_platform_transaction_lines"
    ADD CONSTRAINT "sd_ext_platform_transaction_lines_uomId_fkey"
    FOREIGN KEY ("uomId") REFERENCES "mm_uoms"("id") ON UPDATE CASCADE;

-- ── Sequence for EPT transaction numbers ──
CREATE SEQUENCE IF NOT EXISTS "sd_ext_platform_tx_number_seq" AS INTEGER START WITH 1;

-- ── Seed default sales sources ──
INSERT INTO "sd_sales_sources" ("id", "code", "name", "description", "badgeColor", "origin", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('ss_pos',            'POS',             'POS',                'Point of Sale',                          'blue',   'SYSTEM', true, 1, NOW(), NOW()),
    ('ss_own_ecommerce',  'OWN_ECOMMERCE',   'Own E-Commerce',     'Company-owned online store',             'indigo', 'SYSTEM', true, 2, NOW(), NOW()),
    ('ss_shopee',         'SHOPEE',           'Shopee',             'Shopee marketplace',                     'orange', 'SYSTEM', true, 3, NOW(), NOW()),
    ('ss_lazada',         'LAZADA',           'Lazada',             'Lazada marketplace',                     'purple', 'SYSTEM', true, 4, NOW(), NOW()),
    ('ss_tiktok',         'TIKTOK_SHOP',      'TikTok Shop',        'TikTok Shop marketplace',                'pink',   'SYSTEM', true, 5, NOW(), NOW()),
    ('ss_fb_marketplace', 'FB_MARKETPLACE',   'Facebook Marketplace','Facebook Marketplace',                  'sky',    'SYSTEM', true, 6, NOW(), NOW()),
    ('ss_distributor',    'DISTRIBUTOR',       'Distributor',        'Sales through distributors',             'teal',   'SYSTEM', true, 7, NOW(), NOW()),
    ('ss_reseller',       'RESELLER',          'Reseller',           'Sales through resellers',               'amber',  'SYSTEM', true, 8, NOW(), NOW()),
    ('ss_other',          'OTHER',             'Other',              'Other external platforms',               'gray',   'SYSTEM', true, 99, NOW(), NOW());
