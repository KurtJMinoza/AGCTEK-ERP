-- CRM ticket ↔ SD customer return (RMA handoff). One ticket per return; snapshots for lists.
ALTER TABLE "crm_tickets" ADD COLUMN "sdReturnRequestId" TEXT,
ADD COLUMN "salesOrderId" TEXT,
ADD COLUMN "returnRequestNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "crm_tickets_sdReturnRequestId_key" ON "crm_tickets"("sdReturnRequestId");

-- CreateIndex
CREATE INDEX "crm_tickets_salesOrderId_idx" ON "crm_tickets"("salesOrderId");

-- AddForeignKey
ALTER TABLE "crm_tickets" ADD CONSTRAINT "crm_tickets_sdReturnRequestId_fkey" FOREIGN KEY ("sdReturnRequestId") REFERENCES "sd_return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
