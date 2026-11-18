-- CRM outbound email hub (Communications › Emails): drafts, sent, attachments.
CREATE TABLE "crm_email_messages" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "fromEmail" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT,
    "customerId" TEXT,
    "opportunityId" TEXT,
    "quotationId" TEXT,
    "quotationRevision" INTEGER,
    "templateKey" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_email_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_email_messages_status_sentAt_idx" ON "crm_email_messages"("status", "sentAt");
CREATE INDEX "crm_email_messages_createdBy_status_idx" ON "crm_email_messages"("createdBy", "status");
CREATE INDEX "crm_email_messages_quotationId_idx" ON "crm_email_messages"("quotationId");
CREATE INDEX "crm_email_messages_customerId_idx" ON "crm_email_messages"("customerId");
CREATE INDEX "crm_email_messages_opportunityId_idx" ON "crm_email_messages"("opportunityId");

ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "crm_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_quotationId_fkey"
    FOREIGN KEY ("quotationId") REFERENCES "sd_quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "crm_email_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT,
    "quotationDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_email_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_email_attachments_messageId_idx" ON "crm_email_attachments"("messageId");

ALTER TABLE "crm_email_attachments" ADD CONSTRAINT "crm_email_attachments_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "crm_email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_email_attachments" ADD CONSTRAINT "crm_email_attachments_quotationDocumentId_fkey"
    FOREIGN KEY ("quotationDocumentId") REFERENCES "sd_quotation_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
