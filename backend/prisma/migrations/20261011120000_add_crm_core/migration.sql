-- CRM core: extends SdCustomer (SD remains the customer master). No changes to existing tables.

-- CreateTable
CREATE TABLE "crm_profiles" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'BRONZE',
    "churnScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "ownerUserId" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_leads" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'OTHER',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "assignedTo" TEXT,
    "score" INTEGER,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_opportunities" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "stage" TEXT NOT NULL DEFAULT 'PROSPECTING',
    "probability" INTEGER,
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "assignedTo" TEXT,
    "sdSalesOrderId" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tickets" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "assignedTo" TEXT,
    "rmaReference" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_ticket_comments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_loyalty_accounts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'BRONZE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_loyalty_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_loyalty_transactions" (
    "id" TEXT NOT NULL,
    "loyaltyAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_profiles_customerId_key" ON "crm_profiles"("customerId");

-- CreateIndex
CREATE INDEX "crm_profiles_tier_idx" ON "crm_profiles"("tier");

-- CreateIndex
CREATE INDEX "crm_profiles_ownerUserId_idx" ON "crm_profiles"("ownerUserId");

-- CreateIndex
CREATE INDEX "crm_leads_status_idx" ON "crm_leads"("status");

-- CreateIndex
CREATE INDEX "crm_leads_customerId_idx" ON "crm_leads"("customerId");

-- CreateIndex
CREATE INDEX "crm_leads_assignedTo_idx" ON "crm_leads"("assignedTo");

-- CreateIndex
CREATE INDEX "crm_leads_email_idx" ON "crm_leads"("email");

-- CreateIndex
CREATE INDEX "crm_opportunities_customerId_idx" ON "crm_opportunities"("customerId");

-- CreateIndex
CREATE INDEX "crm_opportunities_stage_idx" ON "crm_opportunities"("stage");

-- CreateIndex
CREATE INDEX "crm_opportunities_assignedTo_idx" ON "crm_opportunities"("assignedTo");

-- CreateIndex
CREATE INDEX "crm_opportunities_leadId_idx" ON "crm_opportunities"("leadId");

-- CreateIndex
CREATE INDEX "crm_tickets_customerId_idx" ON "crm_tickets"("customerId");

-- CreateIndex
CREATE INDEX "crm_tickets_status_idx" ON "crm_tickets"("status");

-- CreateIndex
CREATE INDEX "crm_tickets_priority_idx" ON "crm_tickets"("priority");

-- CreateIndex
CREATE INDEX "crm_tickets_assignedTo_idx" ON "crm_tickets"("assignedTo");

-- CreateIndex
CREATE INDEX "crm_ticket_comments_ticketId_createdAt_idx" ON "crm_ticket_comments"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_loyalty_accounts_customerId_key" ON "crm_loyalty_accounts"("customerId");

-- CreateIndex
CREATE INDEX "crm_loyalty_transactions_loyaltyAccountId_createdAt_idx" ON "crm_loyalty_transactions"("loyaltyAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_loyalty_transactions_referenceType_referenceId_idx" ON "crm_loyalty_transactions"("referenceType", "referenceId");

-- AddForeignKey
ALTER TABLE "crm_profiles" ADD CONSTRAINT "crm_profiles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tickets" ADD CONSTRAINT "crm_tickets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_ticket_comments" ADD CONSTRAINT "crm_ticket_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "crm_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_loyalty_accounts" ADD CONSTRAINT "crm_loyalty_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_loyalty_transactions" ADD CONSTRAINT "crm_loyalty_transactions_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "crm_loyalty_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
