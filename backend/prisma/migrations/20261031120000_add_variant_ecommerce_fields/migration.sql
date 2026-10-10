-- DropForeignKey
ALTER TABLE "mm_purchase_orders" DROP CONSTRAINT "mm_purchase_orders_supplierId_fkey";

-- AlterTable
ALTER TABLE "sd_product_option_values" ADD COLUMN     "imageUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "swatchColor" TEXT;

-- AlterTable
ALTER TABLE "sd_product_options" ADD COLUMN     "displayStyle" TEXT NOT NULL DEFAULT 'BUTTON';

-- AlterTable
ALTER TABLE "sd_product_variants" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "sd_product_variants_productId_isActive_idx" ON "sd_product_variants"("productId", "isActive");

-- CreateIndex
CREATE INDEX "sd_product_variants_productId_sortOrder_idx" ON "sd_product_variants"("productId", "sortOrder");

-- AddForeignKey
ALTER TABLE "mm_purchase_orders" ADD CONSTRAINT "mm_purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "mm_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

