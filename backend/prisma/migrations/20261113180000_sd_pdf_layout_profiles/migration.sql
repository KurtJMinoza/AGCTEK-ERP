-- Quotation PDF layout profiles (CRM › Documents › PDF templates). `config` holds only layout
-- (showTin / showOpportunity / showPaymentTerms / marginTop / marginSide / disclaimer); missing or
-- invalid keys fall back to the built-in defaults in resolveQuotationPdfLayout().
CREATE TABLE "sd_pdf_layout_profiles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_pdf_layout_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sd_pdf_layout_profiles_key_key" ON "sd_pdf_layout_profiles"("key");
CREATE INDEX "sd_pdf_layout_profiles_isActive_idx" ON "sd_pdf_layout_profiles"("isActive");

-- Default profile = the original hard-coded quotation PDF.
INSERT INTO "sd_pdf_layout_profiles" ("id", "key", "name", "config", "isDefault", "isActive", "updatedAt")
VALUES (
    'pdf_layout_default',
    'default',
    'Default quotation',
    '{"showTin": true, "showOpportunity": true, "showPaymentTerms": true, "marginTop": 48, "marginSide": 48}',
    true,
    true,
    CURRENT_TIMESTAMP
);
