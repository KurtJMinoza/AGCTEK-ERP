-- DropForeignKey

-- AlterTable
ALTER TABLE "RetailCartItem" ADD COLUMN     "variantId" TEXT,
ADD COLUMN     "variantName" TEXT,
ADD COLUMN     "variantSku" TEXT;

-- AlterTable
ALTER TABLE "sd_sales_order_lines" ADD COLUMN     "variantBarcode" TEXT,
ADD COLUMN     "variantId" TEXT,
ADD COLUMN     "variantName" TEXT,
ADD COLUMN     "variantSku" TEXT;

-- CreateTable
CREATE TABLE "sd_product_options" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_product_option_values" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_product_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "price" DECIMAL(18,2) NOT NULL,
    "compareAtPrice" DECIMAL(18,2),
    "cost" DECIMAL(18,2),
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "weight" DECIMAL(65,30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "materialId" TEXT,
    "companyId" TEXT,
    "salesUomId" TEXT,
    "materialUomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_product_variant_option_values" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,

    CONSTRAINT "sd_product_variant_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sd_product_options_productId_sortOrder_idx" ON "sd_product_options"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "sd_product_options_productId_name_key" ON "sd_product_options"("productId", "name");

-- CreateIndex
CREATE INDEX "sd_product_option_values_optionId_sortOrder_idx" ON "sd_product_option_values"("optionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "sd_product_option_values_optionId_value_key" ON "sd_product_option_values"("optionId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "sd_product_variants_sku_key" ON "sd_product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "sd_product_variants_barcode_key" ON "sd_product_variants"("barcode");

-- CreateIndex
CREATE INDEX "sd_product_variants_materialId_idx" ON "sd_product_variants"("materialId");

-- CreateIndex
CREATE INDEX "sd_product_variants_barcode_idx" ON "sd_product_variants"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "sd_product_variants_productId_variantName_key" ON "sd_product_variants"("productId", "variantName");

-- CreateIndex
CREATE INDEX "sd_product_variant_option_values_optionValueId_idx" ON "sd_product_variant_option_values"("optionValueId");

-- CreateIndex
CREATE UNIQUE INDEX "sd_product_variant_option_values_variantId_optionValueId_key" ON "sd_product_variant_option_values"("variantId", "optionValueId");

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "sd_product_options" ADD CONSTRAINT "sd_product_options_productId_fkey" FOREIGN KEY ("productId") REFERENCES "sd_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_product_option_values" ADD CONSTRAINT "sd_product_option_values_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "sd_product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_product_variants" ADD CONSTRAINT "sd_product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "sd_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_product_variants" ADD CONSTRAINT "sd_product_variants_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_product_variants" ADD CONSTRAINT "sd_product_variants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_product_variants" ADD CONSTRAINT "sd_product_variants_salesUomId_fkey" FOREIGN KEY ("salesUomId") REFERENCES "mm_uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_product_variants" ADD CONSTRAINT "sd_product_variants_materialUomId_fkey" FOREIGN KEY ("materialUomId") REFERENCES "mm_uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_product_variant_option_values" ADD CONSTRAINT "sd_product_variant_option_values_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "sd_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_product_variant_option_values" ADD CONSTRAINT "sd_product_variant_option_values_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "sd_product_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

