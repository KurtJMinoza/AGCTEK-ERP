-- Shopper (RetailClient) recipient + idempotency key for event-driven notifications.
ALTER TABLE "Notification" ADD COLUMN "retailClientId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_retailClientId_isRead_createdAt_idx" ON "Notification"("retailClientId", "isRead", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_retailClientId_fkey"
    FOREIGN KEY ("retailClientId") REFERENCES "RetailClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
