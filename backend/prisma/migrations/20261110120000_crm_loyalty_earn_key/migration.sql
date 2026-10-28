-- One EARN per business source (e.g. one per sales order, whether a mock earn or a paid invoice).
ALTER TABLE "crm_loyalty_transactions" ADD COLUMN "earnKey" TEXT;

UPDATE "crm_loyalty_transactions"
SET "earnKey" = "referenceType" || ':' || "referenceId"
WHERE "type" = 'EARN' AND "referenceType" IS NOT NULL AND "referenceId" IS NOT NULL;

CREATE UNIQUE INDEX "crm_loyalty_transactions_earnKey_key" ON "crm_loyalty_transactions"("earnKey");
