-- CreateTable
CREATE TABLE "sd_sales_targets" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "salesTarget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "collectionQuota" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_sales_targets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_sales_targets_month_check" CHECK ("month" BETWEEN 1 AND 12)
);

-- CreateIndex
CREATE UNIQUE INDEX "sd_sales_targets_year_month_key" ON "sd_sales_targets"("year", "month");