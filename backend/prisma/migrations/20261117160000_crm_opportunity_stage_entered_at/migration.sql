-- Stall clock: when the opportunity entered its current stage.
-- Existing rows backfill from createdAt (no prior stage history).
ALTER TABLE "crm_opportunities" ADD COLUMN "stageEnteredAt" TIMESTAMP(3);

UPDATE "crm_opportunities"
SET "stageEnteredAt" = "createdAt"
WHERE "stageEnteredAt" IS NULL;

ALTER TABLE "crm_opportunities"
ALTER COLUMN "stageEnteredAt" SET NOT NULL,
ALTER COLUMN "stageEnteredAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "crm_opportunities_stage_stageEnteredAt_idx"
ON "crm_opportunities"("stage", "stageEnteredAt");
