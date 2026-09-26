CREATE TABLE IF NOT EXISTS "mm_domain_event_outbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" TEXT NOT NULL DEFAULT 'v1',
    "companyId" TEXT NOT NULL,
    "plantId" TEXT,
    "sourceModule" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "causationId" TEXT,
    "actorId" TEXT,
    "envelope" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "mm_domain_event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_domain_event_outbox_eventId_key" ON "mm_domain_event_outbox"("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "mm_domain_event_outbox_dedupeKey_key" ON "mm_domain_event_outbox"("dedupeKey");
CREATE INDEX IF NOT EXISTS "mm_domain_event_outbox_status_createdAt_idx" ON "mm_domain_event_outbox"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "mm_domain_event_outbox_correlationId_idx" ON "mm_domain_event_outbox"("correlationId");
CREATE INDEX IF NOT EXISTS "mm_domain_event_outbox_eventType_sourceEntityType_sourceEntityId_idx" ON "mm_domain_event_outbox"("eventType", "sourceEntityType", "sourceEntityId");

CREATE TABLE IF NOT EXISTS "mm_event_consumer_receipts" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventId" TEXT,
    "eventType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "metadata" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mm_event_consumer_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_event_consumer_receipts_consumerId_dedupeKey_key" ON "mm_event_consumer_receipts"("consumerId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "mm_event_consumer_receipts_consumerId_status_idx" ON "mm_event_consumer_receipts"("consumerId", "status");
