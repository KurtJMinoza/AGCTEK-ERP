-- SCM Demand Plan: versions + horizon parameters, base-grain lines (extends DemandForecast), override audit.
-- Additive only: legacy DemandForecast rows keep versionId = NULL.

-- CreateEnum
CREATE TYPE "DemandPlanStatus" AS ENUM ('DRAFT', 'REVIEWED', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "DemandHorizonKind" AS ENUM ('OPERATIONAL', 'TACTICAL', 'STRATEGIC');

-- CreateEnum
CREATE TYPE "DemandPlanBucket" AS ENUM ('WEEK', 'MONTH', 'QUARTER');

-- CreateEnum
CREATE TYPE "DemandPlanGranularity" AS ENUM ('SKU', 'FAMILY');

-- CreateTable
CREATE TABLE "DemandPlanVersion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "DemandPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "horizonKind" "DemandHorizonKind" NOT NULL DEFAULT 'OPERATIONAL',
    "bucket" "DemandPlanBucket" NOT NULL DEFAULT 'WEEK',
    "viewLength" INTEGER NOT NULL DEFAULT 12,
    "freezeFencePeriods" INTEGER NOT NULL DEFAULT 2,
    "granularity" "DemandPlanGranularity" NOT NULL DEFAULT 'SKU',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "DemandPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandPlanAdjustment" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "forecastId" TEXT NOT NULL,
    "previousQty" DOUBLE PRECISION,
    "newQty" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "adjustedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandPlanAdjustment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "DemandForecast" ADD COLUMN     "adjustedQty" DOUBLE PRECISION,
ADD COLUMN     "adjustmentReason" TEXT,
ADD COLUMN     "consensusQty" DOUBLE PRECISION,
ADD COLUMN     "historicalQty" DOUBLE PRECISION,
ADD COLUMN     "productFamily" TEXT,
ADD COLUMN     "versionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DemandPlanVersion_code_key" ON "DemandPlanVersion"("code");

-- CreateIndex
CREATE INDEX "DemandPlanVersion_status_idx" ON "DemandPlanVersion"("status");

-- CreateIndex
CREATE INDEX "DemandPlanVersion_horizonKind_idx" ON "DemandPlanVersion"("horizonKind");

-- CreateIndex
CREATE INDEX "DemandPlanAdjustment_versionId_createdAt_idx" ON "DemandPlanAdjustment"("versionId", "createdAt");

-- CreateIndex
CREATE INDEX "DemandPlanAdjustment_forecastId_idx" ON "DemandPlanAdjustment"("forecastId");

-- CreateIndex
CREATE INDEX "DemandForecast_versionId_periodStart_idx" ON "DemandForecast"("versionId", "periodStart");

-- CreateIndex
CREATE INDEX "DemandForecast_versionId_productFamily_idx" ON "DemandForecast"("versionId", "productFamily");

-- CreateIndex
CREATE UNIQUE INDEX "DemandForecast_versionId_productCode_locationCode_periodSta_key" ON "DemandForecast"("versionId", "productCode", "locationCode", "periodStart");

-- AddForeignKey
ALTER TABLE "DemandForecast" ADD CONSTRAINT "DemandForecast_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DemandPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandPlanAdjustment" ADD CONSTRAINT "DemandPlanAdjustment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DemandPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandPlanAdjustment" ADD CONSTRAINT "DemandPlanAdjustment_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "DemandForecast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
