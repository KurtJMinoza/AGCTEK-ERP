-- CreateTable
CREATE TABLE "crm_messages" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT,
    "leadId" TEXT,
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "metadata" JSONB,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_messages_parent_check" CHECK (num_nonnulls("opportunityId", "leadId") >= 1)
);

-- CreateIndex
CREATE INDEX "crm_messages_opportunityId_createdAt_idx" ON "crm_messages"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_messages_leadId_createdAt_idx" ON "crm_messages"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "crm_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;