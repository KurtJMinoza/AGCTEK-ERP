-- Ticket lifecycle audit reuses the CRM feed table (SYSTEM rows).
ALTER TABLE "crm_messages" ADD COLUMN "ticketId" TEXT;
ALTER TABLE "crm_messages" DROP CONSTRAINT "crm_messages_parent_check";
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_parent_check"
    CHECK (num_nonnulls("opportunityId", "leadId", "ticketId") >= 1);
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "crm_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "crm_messages_ticketId_createdAt_idx" ON "crm_messages"("ticketId", "createdAt");

-- SD quotation lifecycle history (append-only).
CREATE TABLE "sd_quotation_events" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_quotation_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sd_quotation_events_quotationId_createdAt_idx" ON "sd_quotation_events"("quotationId", "createdAt");
ALTER TABLE "sd_quotation_events" ADD CONSTRAINT "sd_quotation_events_quotationId_fkey"
    FOREIGN KEY ("quotationId") REFERENCES "sd_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attachments on tickets and opportunities.
CREATE TABLE "crm_attachments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT,
    "opportunityId" TEXT,
    "fileName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "crm_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_attachments_parent_check" CHECK (num_nonnulls("ticketId", "opportunityId") = 1)
);
CREATE INDEX "crm_attachments_ticketId_createdAt_idx" ON "crm_attachments"("ticketId", "createdAt");
CREATE INDEX "crm_attachments_opportunityId_createdAt_idx" ON "crm_attachments"("opportunityId", "createdAt");
ALTER TABLE "crm_attachments" ADD CONSTRAINT "crm_attachments_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "crm_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_attachments" ADD CONSTRAINT "crm_attachments_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "crm_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
