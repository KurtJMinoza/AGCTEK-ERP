-- CreateEnum
CREATE TYPE "PlanningBucketSize" AS ENUM ('DAY', 'WEEK');

-- CreateTable
CREATE TABLE "ScmPlanningSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "horizonWeeks" INTEGER NOT NULL DEFAULT 12,
    "bucketSize" "PlanningBucketSize" NOT NULL DEFAULT 'WEEK',
    "frozenZoneDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScmPlanningSettings_pkey" PRIMARY KEY ("id")
);

-- Seed singleton defaults
INSERT INTO "ScmPlanningSettings" ("id", "horizonWeeks", "bucketSize", "frozenZoneDays", "createdAt", "updatedAt")
VALUES ('default', 12, 'WEEK', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
