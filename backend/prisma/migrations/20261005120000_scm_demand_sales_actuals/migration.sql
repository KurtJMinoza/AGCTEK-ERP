-- Demand Plan: past sales actuals + baseline generation metadata (additive only)

ALTER TABLE "DemandPlanVersion"
    ADD COLUMN "lastGeneratedAt" TIMESTAMP(3),
    ADD COLUMN "lastGeneratedBy" TEXT,
    ADD COLUMN "generationParams" JSONB;

CREATE TABLE "DemandSalesActual" (
    "id" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'EA',
    "source" TEXT NOT NULL DEFAULT 'IMPORT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandSalesActual_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DemandSalesActual_productCode_locationCode_periodStart_key"
    ON "DemandSalesActual"("productCode", "locationCode", "periodStart");

CREATE INDEX "DemandSalesActual_locationCode_periodStart_idx"
    ON "DemandSalesActual"("locationCode", "periodStart");
