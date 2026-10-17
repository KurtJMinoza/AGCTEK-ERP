-- CreateTable
CREATE TABLE "sd_pricing_conditions" (
    "id" TEXT NOT NULL,
    "conditionCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "productId" TEXT,
    "minQuantity" DECIMAL(18,3),
    "customerType" TEXT NOT NULL DEFAULT 'ALL',
    "valueType" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "promoCode" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_pricing_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sd_pricing_conditions_conditionCode_key" ON "sd_pricing_conditions"("conditionCode");

-- CreateIndex
CREATE INDEX "sd_pricing_conditions_conditionType_validFrom_idx" ON "sd_pricing_conditions"("conditionType", "validFrom");

-- CreateIndex
CREATE INDEX "sd_pricing_conditions_productId_idx" ON "sd_pricing_conditions"("productId");

-- AddForeignKey
ALTER TABLE "sd_pricing_conditions" ADD CONSTRAINT "sd_pricing_conditions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "sd_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
