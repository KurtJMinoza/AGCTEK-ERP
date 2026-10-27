-- IDV (Identity & Document Verification) module tables

-- Verification policies (configurable per document type + company)
CREATE TABLE "idv_verification_policies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "documentType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "requiredChecks" JSONB NOT NULL DEFAULT '[]',
    "optionalChecks" JSONB NOT NULL DEFAULT '[]',
    "autoApproveRules" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "retentionDays" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idv_verification_policies_pkey" PRIMARY KEY ("id")
);

-- Verification sessions
CREATE TABLE "idv_verification_sessions" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "companyId" TEXT,
    "documentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "policyId" TEXT,
    "idempotencyKey" TEXT,
    "statusReason" TEXT,
    "statusNote" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idv_verification_sessions_pkey" PRIMARY KEY ("id")
);

-- Uploaded documents
CREATE TABLE "idv_documents" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'FULL',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileHash" TEXT,
    "captureMethod" TEXT NOT NULL DEFAULT 'UPLOAD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idv_documents_pkey" PRIMARY KEY ("id")
);

-- Document analysis results
CREATE TABLE "idv_document_analyses" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultPayload" JSONB,
    "confidenceScore" DECIMAL(5,4),
    "detectedDocumentType" TEXT,
    "extractedFields" JSONB,
    "qualityMetrics" JSONB,
    "processingMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idv_document_analyses_pkey" PRIMARY KEY ("id")
);

-- Liveness checks
CREATE TABLE "idv_liveness_checks" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "checkType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultPayload" JSONB,
    "confidenceScore" DECIMAL(5,4),
    "challengeType" TEXT,
    "challengePassed" BOOLEAN,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idv_liveness_checks_pkey" PRIMARY KEY ("id")
);

-- Signature checks
CREATE TABLE "idv_signature_checks" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "documentId" TEXT,
    "signatureType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "similarityScore" DECIMAL(5,4),
    "engineVersion" TEXT,
    "extractedSigKey" TEXT,
    "referenceSigKey" TEXT,
    "certificateInfo" JSONB,
    "chainTrusted" BOOLEAN,
    "timestampValid" BOOLEAN,
    "resultPayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idv_signature_checks_pkey" PRIMARY KEY ("id")
);

-- Issuer verifications
CREATE TABLE "idv_issuer_verifications" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "issuerCategory" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "isAuthentic" BOOLEAN,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idv_issuer_verifications_pkey" PRIMARY KEY ("id")
);

-- Verification decisions
CREATE TABLE "idv_verification_decisions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "decisionSource" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "policyVersion" INTEGER,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "evidenceSnapshot" JSONB,
    "reviewerId" TEXT,
    "reviewerComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idv_verification_decisions_pkey" PRIMARY KEY ("id")
);

-- Audit trail
CREATE TABLE "idv_verification_audit" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idv_verification_audit_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "idv_verification_policies_companyId_documentType_key" ON "idv_verification_policies"("companyId", "documentType");
CREATE UNIQUE INDEX "idv_verification_sessions_idempotencyKey_key" ON "idv_verification_sessions"("idempotencyKey");

-- Indexes: policies
CREATE INDEX "idv_verification_policies_documentType_idx" ON "idv_verification_policies"("documentType");

-- Indexes: sessions
CREATE INDEX "idv_verification_sessions_subjectType_subjectId_idx" ON "idv_verification_sessions"("subjectType", "subjectId");
CREATE INDEX "idv_verification_sessions_status_idx" ON "idv_verification_sessions"("status");
CREATE INDEX "idv_verification_sessions_companyId_idx" ON "idv_verification_sessions"("companyId");
CREATE INDEX "idv_verification_sessions_createdAt_idx" ON "idv_verification_sessions"("createdAt");

-- Indexes: documents
CREATE INDEX "idv_documents_sessionId_idx" ON "idv_documents"("sessionId");
CREATE INDEX "idv_documents_status_idx" ON "idv_documents"("status");

-- Indexes: analyses
CREATE INDEX "idv_document_analyses_sessionId_idx" ON "idv_document_analyses"("sessionId");
CREATE INDEX "idv_document_analyses_documentId_idx" ON "idv_document_analyses"("documentId");
CREATE INDEX "idv_document_analyses_analysisType_idx" ON "idv_document_analyses"("analysisType");

-- Indexes: liveness
CREATE INDEX "idv_liveness_checks_sessionId_idx" ON "idv_liveness_checks"("sessionId");

-- Indexes: signatures
CREATE INDEX "idv_signature_checks_sessionId_idx" ON "idv_signature_checks"("sessionId");

-- Indexes: issuer verifications
CREATE INDEX "idv_issuer_verifications_sessionId_idx" ON "idv_issuer_verifications"("sessionId");
CREATE INDEX "idv_issuer_verifications_providerCode_idx" ON "idv_issuer_verifications"("providerCode");

-- Indexes: decisions
CREATE INDEX "idv_verification_decisions_sessionId_idx" ON "idv_verification_decisions"("sessionId");
CREATE INDEX "idv_verification_decisions_decision_idx" ON "idv_verification_decisions"("decision");

-- Indexes: audit
CREATE INDEX "idv_verification_audit_sessionId_idx" ON "idv_verification_audit"("sessionId");
CREATE INDEX "idv_verification_audit_action_idx" ON "idv_verification_audit"("action");
CREATE INDEX "idv_verification_audit_actorId_idx" ON "idv_verification_audit"("actorId");
CREATE INDEX "idv_verification_audit_createdAt_idx" ON "idv_verification_audit"("createdAt");

-- Foreign keys
ALTER TABLE "idv_verification_policies" ADD CONSTRAINT "idv_verification_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idv_verification_sessions" ADD CONSTRAINT "idv_verification_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "idv_verification_sessions" ADD CONSTRAINT "idv_verification_sessions_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "idv_verification_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "idv_documents" ADD CONSTRAINT "idv_documents_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "idv_verification_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idv_document_analyses" ADD CONSTRAINT "idv_document_analyses_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "idv_verification_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idv_document_analyses" ADD CONSTRAINT "idv_document_analyses_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "idv_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idv_liveness_checks" ADD CONSTRAINT "idv_liveness_checks_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "idv_verification_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idv_signature_checks" ADD CONSTRAINT "idv_signature_checks_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "idv_verification_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idv_signature_checks" ADD CONSTRAINT "idv_signature_checks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "idv_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "idv_issuer_verifications" ADD CONSTRAINT "idv_issuer_verifications_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "idv_verification_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idv_verification_decisions" ADD CONSTRAINT "idv_verification_decisions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "idv_verification_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idv_verification_audit" ADD CONSTRAINT "idv_verification_audit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "idv_verification_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
