-- CreateTable
CREATE TABLE "fico_document_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "documentCategory" TEXT NOT NULL,
    "numberRangeId" TEXT,
    "numberAssignment" TEXT NOT NULL DEFAULT 'INTERNAL',
    "externalNumberAllowed" BOOLEAN NOT NULL DEFAULT false,
    "numberRangeRequired" BOOLEAN NOT NULL DEFAULT true,
    "allowedAccountTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "debitPostingAllowed" BOOLEAN NOT NULL DEFAULT true,
    "creditPostingAllowed" BOOLEAN NOT NULL DEFAULT true,
    "negativePostingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "reversalAllowed" BOOLEAN NOT NULL DEFAULT true,
    "reversalDocumentTypeId" TEXT,
    "originalDocumentReferenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "reversalReasonRequired" BOOLEAN NOT NULL DEFAULT false,
    "referenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "headerTextRequired" BOOLEAN NOT NULL DEFAULT false,
    "lineTextRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "remarks" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fico_document_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fico_document_types_companyId_status_idx" ON "fico_document_types"("companyId", "status");

-- CreateIndex
CREATE INDEX "fico_document_types_companyId_documentCategory_idx" ON "fico_document_types"("companyId", "documentCategory");

-- CreateIndex
CREATE INDEX "fico_document_types_numberRangeId_idx" ON "fico_document_types"("numberRangeId");

-- CreateIndex
CREATE INDEX "fico_document_types_reversalDocumentTypeId_idx" ON "fico_document_types"("reversalDocumentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "fico_document_types_companyId_code_key" ON "fico_document_types"("companyId", "code");

-- AddForeignKey
ALTER TABLE "fico_document_types" ADD CONSTRAINT "fico_document_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fico_document_types" ADD CONSTRAINT "fico_document_types_numberRangeId_fkey" FOREIGN KEY ("numberRangeId") REFERENCES "fico_number_ranges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fico_document_types" ADD CONSTRAINT "fico_document_types_reversalDocumentTypeId_fkey" FOREIGN KEY ("reversalDocumentTypeId") REFERENCES "fico_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
