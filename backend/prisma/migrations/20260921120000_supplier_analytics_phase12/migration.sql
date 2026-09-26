-- Phase 12: Supplier Performance + MM Analytics (read-only analytics; no inventory mutation)

-- Ensure MM-13 / cache tables exist (idempotent)
CREATE TABLE IF NOT EXISTS "mm_supplier_score_weight_config" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deliveryWeight" INTEGER NOT NULL DEFAULT 25,
    "qualityWeight" INTEGER NOT NULL DEFAULT 25,
    "priceWeight" INTEGER NOT NULL DEFAULT 20,
    "quantityWeight" INTEGER NOT NULL DEFAULT 15,
    "serviceWeight" INTEGER NOT NULL DEFAULT 10,
    "complianceWeight" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_supplier_score_weight_config_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_supplier_score_weight_config_companyId_key"
  ON "mm_supplier_score_weight_config"("companyId");

CREATE TABLE IF NOT EXISTS "mm_supplier_alert_config" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scoreThreshold" DECIMAL(65,30) NOT NULL DEFAULT 70,
    "lateDeliveryRateThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0.25,
    "rejectionRateThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0.10,
    "shortageRateThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0.15,
    "priceVarianceThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0.10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_supplier_alert_config_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_supplier_alert_config_companyId_key"
  ON "mm_supplier_alert_config"("companyId");

CREATE TABLE IF NOT EXISTS "mm_supplier_evaluation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "onTimePct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lateDeliveryRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "avgDelayDays" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "qualityAcceptanceRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rejectionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "returnRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "leadTimeAccuracyPct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "priceVariancePct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "landedCostVariancePct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fillRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "shortageRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "overDeliveryRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "avgResponseHours" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "complianceRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "purchaseVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deliveryScore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "qualityScore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "priceScore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "quantityScore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "serviceScore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "complianceScore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "overallScore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deliveryWeight" INTEGER NOT NULL DEFAULT 25,
    "qualityWeight" INTEGER NOT NULL DEFAULT 25,
    "priceWeight" INTEGER NOT NULL DEFAULT 20,
    "quantityWeight" INTEGER NOT NULL DEFAULT 15,
    "serviceWeight" INTEGER NOT NULL DEFAULT 10,
    "complianceWeight" INTEGER NOT NULL DEFAULT 5,
    "sampleSizes" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_supplier_evaluation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_supplier_evaluation_companyId_supplierId_periodStart_periodEnd_key"
  ON "mm_supplier_evaluation"("companyId", "supplierId", "periodStart", "periodEnd");

CREATE TABLE IF NOT EXISTS "mm_supplier_alerts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL DEFAULT 'POOR_SCORE',
    "score" DECIMAL(65,30) NOT NULL,
    "threshold" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_supplier_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "mm_supplier_manual_assessments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "deliveryScore" DECIMAL(65,30),
    "qualityScore" DECIMAL(65,30),
    "priceScore" DECIMAL(65,30),
    "serviceScore" DECIMAL(65,30),
    "complianceScore" DECIMAL(65,30),
    "overallScore" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "assessedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_supplier_manual_assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "mm_dashboard_analytics_cache" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_dashboard_analytics_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_dashboard_analytics_cache_cacheKey_key"
  ON "mm_dashboard_analytics_cache"("cacheKey");
CREATE INDEX IF NOT EXISTS "mm_dashboard_analytics_cache_companyId_idx"
  ON "mm_dashboard_analytics_cache"("companyId");
CREATE INDEX IF NOT EXISTS "mm_dashboard_analytics_cache_expiresAt_idx"
  ON "mm_dashboard_analytics_cache"("expiresAt");
CREATE INDEX IF NOT EXISTS "mm_dashboard_analytics_cache_metricType_idx"
  ON "mm_dashboard_analytics_cache"("metricType");

-- Alter existing tables (when already created by prior schema push)
ALTER TABLE "mm_supplier_score_weight_config" ADD COLUMN IF NOT EXISTS "quantityWeight" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "mm_supplier_alert_config" ADD COLUMN IF NOT EXISTS "lateDeliveryRateThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0.25;
ALTER TABLE "mm_supplier_alert_config" ADD COLUMN IF NOT EXISTS "rejectionRateThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0.10;
ALTER TABLE "mm_supplier_alert_config" ADD COLUMN IF NOT EXISTS "shortageRateThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0.15;
ALTER TABLE "mm_supplier_alert_config" ADD COLUMN IF NOT EXISTS "priceVarianceThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0.10;

ALTER TABLE "mm_supplier_evaluation" ADD COLUMN IF NOT EXISTS "lateDeliveryRate" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_supplier_evaluation" ADD COLUMN IF NOT EXISTS "avgDelayDays" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_supplier_evaluation" ADD COLUMN IF NOT EXISTS "rejectionRate" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_supplier_evaluation" ADD COLUMN IF NOT EXISTS "landedCostVariancePct" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_supplier_evaluation" ADD COLUMN IF NOT EXISTS "fillRate" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_supplier_evaluation" ADD COLUMN IF NOT EXISTS "shortageRate" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_supplier_evaluation" ADD COLUMN IF NOT EXISTS "overDeliveryRate" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_supplier_evaluation" ADD COLUMN IF NOT EXISTS "quantityScore" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_supplier_evaluation" ADD COLUMN IF NOT EXISTS "quantityWeight" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "mm_supplier_alerts" ADD COLUMN IF NOT EXISTS "alertType" TEXT NOT NULL DEFAULT 'POOR_SCORE';
CREATE INDEX IF NOT EXISTS "mm_supplier_alerts_alertType_idx" ON "mm_supplier_alerts"("alertType");

DO $$ BEGIN
  ALTER TABLE "mm_supplier_score_weight_config"
    ADD CONSTRAINT "mm_supplier_score_weight_config_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_supplier_alert_config"
    ADD CONSTRAINT "mm_supplier_alert_config_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_dashboard_analytics_cache"
    ADD CONSTRAINT "mm_dashboard_analytics_cache_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
