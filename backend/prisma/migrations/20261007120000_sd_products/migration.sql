-- CreateTable
CREATE TABLE "sd_products" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(18,2) NOT NULL,
    "originalPrice" DECIMAL(18,2),
    "category" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "badge" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sd_products_divisionId_sku_key" ON "sd_products"("divisionId", "sku");

-- CreateIndex
CREATE INDEX "sd_products_divisionId_isActive_sortOrder_idx" ON "sd_products"("divisionId", "isActive", "sortOrder");
