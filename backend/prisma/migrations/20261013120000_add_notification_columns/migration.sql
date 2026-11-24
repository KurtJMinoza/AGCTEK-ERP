-- Notification display fields + unread filter used by the notifications API.
-- (Schema ships in the same upstream change as User.employeeCode but was not
--  included in the committed migration — applied here for schema parity.)
ALTER TABLE "Notification" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Notification" ADD COLUMN "message" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Notification" ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");