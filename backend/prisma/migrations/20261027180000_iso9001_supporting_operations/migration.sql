-- ISO 9001 supporting operations: barcode registry, RFID, scan sessions, overrides, controlled documents

ALTER TABLE "mm_barcodes"
  ADD COLUMN IF NOT EXISTS "companyId" TEXT,
  ADD COLUMN IF NOT EXISTS "entityType" TEXT NOT NULL DEFAULT 'MATERIAL',
  ADD COLUMN IF NOT EXISTS "entityId" TEXT,
  ADD COLUMN IF NOT EXISTS "uomId" TEXT,
  ADD COLUMN IF NOT EXISTS "packagingQuantity" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "batchId" TEXT,
  ADD COLUMN IF NOT EXISTS "serialNumberId" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

UPDATE "mm_barcodes" b
SET "companyId" = m."companyId",
    "entityId" = b."materialId"
FROM "mm_materials" m
WHERE b."materialId" = m.id
  AND (b."companyId" IS NULL OR b."entityId" IS NULL);

DROP INDEX IF EXISTS "mm_barcodes_barcodeValue_key";
CREATE UNIQUE INDEX IF NOT EXISTS "mm_barcodes_companyId_barcodeValue_key"
  ON "mm_barcodes"("companyId", "barcodeValue");

ALTER TABLE "mm_mobile_devices"
  ADD COLUMN IF NOT EXISTS "warehouseId" TEXT,
  ADD COLUMN IF NOT EXISTS "deviceType" TEXT DEFAULT 'MOBILE_PHONE',
  ADD COLUMN IF NOT EXISTS "revokedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "osInfo" TEXT;

ALTER TABLE "mm_scanner_events"
  ADD COLUMN IF NOT EXISTS "scanSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "sequenceNumber" INTEGER;

CREATE TABLE IF NOT EXISTS "mm_scan_sessions" (
  "id" TEXT NOT NULL,
  "sessionNumber" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userRole" TEXT,
  "mobileDeviceId" TEXT,
  "warehouseId" TEXT,
  "businessProcess" TEXT NOT NULL,
  "sourceDocumentType" TEXT,
  "sourceDocumentId" TEXT,
  "sourceTaskId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "offlineMode" BOOLEAN NOT NULL DEFAULT false,
  "syncStatus" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mm_scan_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_scan_sessions_sessionNumber_key" ON "mm_scan_sessions"("sessionNumber");
CREATE INDEX IF NOT EXISTS "mm_scan_sessions_companyId_idx" ON "mm_scan_sessions"("companyId");
CREATE INDEX IF NOT EXISTS "mm_scan_sessions_userId_idx" ON "mm_scan_sessions"("userId");
CREATE INDEX IF NOT EXISTS "mm_scan_sessions_status_idx" ON "mm_scan_sessions"("status");

CREATE TABLE IF NOT EXISTS "mm_rfid_tags" (
  "id" TEXT NOT NULL,
  "tagValue" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "materialId" TEXT,
  "batchId" TEXT,
  "serialNumberId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UNASSIGNED',
  "assignedAt" TIMESTAMP(3),
  "lastReadAt" TIMESTAMP(3),
  "lastWarehouseId" TEXT,
  "lastStorageBinId" TEXT,
  "lastReaderId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mm_rfid_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_rfid_tags_companyId_tagValue_key" ON "mm_rfid_tags"("companyId", "tagValue");
CREATE INDEX IF NOT EXISTS "mm_rfid_tags_serialNumberId_idx" ON "mm_rfid_tags"("serialNumberId");
CREATE INDEX IF NOT EXISTS "mm_rfid_tags_status_idx" ON "mm_rfid_tags"("status");

CREATE TABLE IF NOT EXISTS "mm_scan_overrides" (
  "id" TEXT NOT NULL,
  "overrideNumber" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "businessProcess" TEXT NOT NULL,
  "sourceDocumentType" TEXT,
  "sourceDocumentId" TEXT,
  "materialId" TEXT,
  "batchId" TEXT,
  "serialNumberId" TEXT,
  "reasonCode" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "supervisorRequired" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mm_scan_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_scan_overrides_overrideNumber_key" ON "mm_scan_overrides"("overrideNumber");
CREATE INDEX IF NOT EXISTS "mm_scan_overrides_companyId_status_idx" ON "mm_scan_overrides"("companyId", "status");

CREATE TABLE IF NOT EXISTS "mm_controlled_documents" (
  "id" TEXT NOT NULL,
  "documentNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "department" TEXT,
  "processArea" TEXT,
  "ownerUserId" TEXT,
  "currentRevision" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "effectiveDate" TIMESTAMP(3),
  "reviewDate" TIMESTAMP(3),
  "expirationDate" TIMESTAMP(3),
  "confidentialityLevel" TEXT,
  "retentionPeriodDays" INTEGER,
  "createdBy" TEXT,
  "approvedBy" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mm_controlled_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_controlled_documents_documentNumber_key" ON "mm_controlled_documents"("documentNumber");
CREATE INDEX IF NOT EXISTS "mm_controlled_documents_companyId_status_idx" ON "mm_controlled_documents"("companyId", "status");

CREATE TABLE IF NOT EXISTS "mm_controlled_document_versions" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "revisionNumber" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT,
  "fileSize" INTEGER NOT NULL,
  "fileChecksum" TEXT NOT NULL,
  "changeSummary" TEXT,
  "authorUserId" TEXT,
  "reviewerUserId" TEXT,
  "approverUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "approvedAt" TIMESTAMP(3),
  "effectiveDate" TIMESTAMP(3),
  "obsoleteDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mm_controlled_document_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_controlled_document_versions_documentId_revisionNumber_key"
  ON "mm_controlled_document_versions"("documentId", "revisionNumber");
CREATE INDEX IF NOT EXISTS "mm_controlled_document_versions_documentId_idx" ON "mm_controlled_document_versions"("documentId");

CREATE TABLE IF NOT EXISTS "mm_compliance_audit_entries" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "entityNumber" TEXT,
  "performedBy" TEXT,
  "performedByRole" TEXT,
  "previousValue" TEXT,
  "newValue" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mm_compliance_audit_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_compliance_audit_entries_companyId_performedAt_idx"
  ON "mm_compliance_audit_entries"("companyId", "performedAt");
