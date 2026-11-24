-- CRM email inbound (MailDev): spam flag, provider ids, receivedAt, outbound smtpMessageId.
ALTER TABLE "crm_email_messages" ADD COLUMN "isSpam" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "crm_email_messages" ADD COLUMN "provider" TEXT;
ALTER TABLE "crm_email_messages" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "crm_email_messages" ADD COLUMN "smtpMessageId" TEXT;
ALTER TABLE "crm_email_messages" ADD COLUMN "receivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "crm_email_messages_providerMessageId_key" ON "crm_email_messages"("providerMessageId");
CREATE INDEX "crm_email_messages_direction_isSpam_receivedAt_idx" ON "crm_email_messages"("direction", "isSpam", "receivedAt");
CREATE INDEX "crm_email_messages_smtpMessageId_idx" ON "crm_email_messages"("smtpMessageId");
