-- Stored PDF snapshot per quotation revision (the exact bytes emailed to the customer).
CREATE TABLE "sd_quotation_documents" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "byteSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_quotation_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sd_quotation_documents_storageKey_key" ON "sd_quotation_documents"("storageKey");
CREATE UNIQUE INDEX "sd_quotation_documents_quotationId_revision_key" ON "sd_quotation_documents"("quotationId", "revision");

ALTER TABLE "sd_quotation_documents" ADD CONSTRAINT "sd_quotation_documents_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "sd_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Editable cover-email templates (SD quotation scope only).
CREATE TABLE "sd_email_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "module" TEXT NOT NULL DEFAULT 'QUOTATION',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sd_email_templates_key_key" ON "sd_email_templates"("key");
CREATE INDEX "sd_email_templates_module_isActive_idx" ON "sd_email_templates"("module", "isActive");

-- Last successful cover-email delivery of the quotation revision.
ALTER TABLE "sd_quotations" ADD COLUMN "lastEmailedAt" TIMESTAMP(3);

INSERT INTO "sd_email_templates" ("id", "key", "name", "subject", "bodyText", "module", "isDefault", "isActive", "updatedAt")
VALUES
    (
        'tpl_quotation_sent',
        'quotation_sent',
        'Quotation sent',
        'Quotation {{quotationNumber}} rev {{revision}} from {{companyName}}',
        $body$Dear {{customerName}},

Thank you for the opportunity to quote. Please find our quotation {{quotationNumber}} rev {{revision}} attached.

Quotation summary:
- Total: {{amount}} {{currency}}
- Valid until: {{validUntil}}

If you have any questions, reply to this email and we will be glad to help.

Best regards,
{{repName}}
{{companyName}}$body$,
        'QUOTATION',
        true,
        true,
        CURRENT_TIMESTAMP
    ),
    (
        'tpl_quotation_resent',
        'quotation_resent',
        'Quotation resent',
        'Updated copy: quotation {{quotationNumber}} rev {{revision}}',
        $body$Dear {{customerName}},

As requested, we are resending quotation {{quotationNumber}} rev {{revision}}.

Quotation summary:
- Total: {{amount}} {{currency}}
- Valid until: {{validUntil}}

The PDF quotation is attached.

Best regards,
{{repName}}
{{companyName}}$body$,
        'QUOTATION',
        false,
        true,
        CURRENT_TIMESTAMP
    );
