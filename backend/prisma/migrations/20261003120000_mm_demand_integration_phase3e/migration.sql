-- Phase 3E: Generic MM demand integration contract

ALTER TABLE "mm_planning_demands" ADD COLUMN "sourceModule" TEXT NOT NULL DEFAULT 'MM';
ALTER TABLE "mm_planning_demands" ADD COLUMN "sourceDocumentType" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "mm_planning_demands" ADD COLUMN "sourceDocumentLineId" TEXT;
ALTER TABLE "mm_planning_demands" ADD COLUMN "uomId" TEXT;
ALTER TABLE "mm_planning_demands" ADD COLUMN "demandReferenceKey" TEXT;
ALTER TABLE "mm_planning_demands" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100;

CREATE UNIQUE INDEX "mm_planning_demands_demandReferenceKey_key" ON "mm_planning_demands"("demandReferenceKey");
CREATE INDEX "mm_planning_demands_sourceModule_sourceDocumentType_sourceDocumentId_idx" ON "mm_planning_demands"("sourceModule", "sourceDocumentType", "sourceDocumentId");

ALTER TABLE "mm_planning_demands" ADD CONSTRAINT "mm_planning_demands_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "mm_uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
