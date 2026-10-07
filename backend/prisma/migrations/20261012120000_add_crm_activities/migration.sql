-- CreateTable
CREATE TABLE "crm_activities" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT,
    "leadId" TEXT,
    "ticketId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_activities_parent_check" CHECK (num_nonnulls("opportunityId", "leadId", "ticketId") >= 1)
);

-- CreateIndex
CREATE INDEX "crm_activities_opportunityId_dueAt_idx" ON "crm_activities"("opportunityId", "dueAt");

-- CreateIndex
CREATE INDEX "crm_activities_leadId_dueAt_idx" ON "crm_activities"("leadId", "dueAt");

-- CreateIndex
CREATE INDEX "crm_activities_ticketId_dueAt_idx" ON "crm_activities"("ticketId", "dueAt");

-- CreateIndex
CREATE INDEX "crm_activities_assignedTo_dueAt_idx" ON "crm_activities"("assignedTo", "dueAt");

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "crm_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "crm_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
