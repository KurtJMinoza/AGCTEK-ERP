-- Phase 11: Barcode/RFID + Mobile Warehouse Execution
-- Scanner is an execution channel only — never posts inventory directly.

CREATE TABLE IF NOT EXISTS "mm_mobile_devices" (
    "id" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'WEB',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sessionToken" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_mobile_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_mobile_devices_deviceCode_key" ON "mm_mobile_devices"("deviceCode");
CREATE INDEX IF NOT EXISTS "mm_mobile_devices_companyId_idx" ON "mm_mobile_devices"("companyId");
CREATE INDEX IF NOT EXISTS "mm_mobile_devices_userId_idx" ON "mm_mobile_devices"("userId");
CREATE INDEX IF NOT EXISTS "mm_mobile_devices_status_idx" ON "mm_mobile_devices"("status");
CREATE INDEX IF NOT EXISTS "mm_mobile_devices_sessionToken_idx" ON "mm_mobile_devices"("sessionToken");

DO $$ BEGIN
  ALTER TABLE "mm_mobile_devices"
    ADD CONSTRAINT "mm_mobile_devices_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_mobile_devices"
    ADD CONSTRAINT "mm_mobile_devices_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enrich ScanEvent (MmScannerEvent bridge)
ALTER TABLE "mm_scanner_events" ADD COLUMN IF NOT EXISTS "mobileDeviceId" TEXT;
ALTER TABLE "mm_scanner_events" ADD COLUMN IF NOT EXISTS "conflictCode" TEXT;
ALTER TABLE "mm_scanner_events" ADD COLUMN IF NOT EXISTS "offlineQueued" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mm_scanner_events" ADD COLUMN IF NOT EXISTS "clientTimestamp" TIMESTAMP(3);
ALTER TABLE "mm_scanner_events" ADD COLUMN IF NOT EXISTS "syncQueueId" TEXT;
CREATE INDEX IF NOT EXISTS "mm_scanner_events_mobileDeviceId_idx" ON "mm_scanner_events"("mobileDeviceId");
CREATE INDEX IF NOT EXISTS "mm_scanner_events_conflictCode_idx" ON "mm_scanner_events"("conflictCode");

DO $$ BEGIN
  ALTER TABLE "mm_scanner_events"
    ADD CONSTRAINT "mm_scanner_events_mobileDeviceId_fkey"
    FOREIGN KEY ("mobileDeviceId") REFERENCES "mm_mobile_devices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "mm_mobile_sync_queue" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "mobileDeviceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "clientTimestamp" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "conflictCode" TEXT,
    "errorMessage" TEXT,
    "serverEventId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    CONSTRAINT "mm_mobile_sync_queue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_mobile_sync_queue_idempotencyKey_key"
  ON "mm_mobile_sync_queue"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "mm_mobile_sync_queue_deviceId_status_idx"
  ON "mm_mobile_sync_queue"("deviceId", "status");
CREATE INDEX IF NOT EXISTS "mm_mobile_sync_queue_mobileDeviceId_idx"
  ON "mm_mobile_sync_queue"("mobileDeviceId");
CREATE INDEX IF NOT EXISTS "mm_mobile_sync_queue_status_idx"
  ON "mm_mobile_sync_queue"("status");

DO $$ BEGIN
  ALTER TABLE "mm_mobile_sync_queue"
    ADD CONSTRAINT "mm_mobile_sync_queue_mobileDeviceId_fkey"
    FOREIGN KEY ("mobileDeviceId") REFERENCES "mm_mobile_devices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
