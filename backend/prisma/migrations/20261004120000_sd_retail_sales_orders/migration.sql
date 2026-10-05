-- AlterTable
ALTER TABLE "sd_sales_orders" ADD COLUMN     "changeAmount" DECIMAL(65,30),
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PHP',
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "divisionId" TEXT,
ADD COLUMN     "paymentReceived" DECIMAL(65,30),
ADD COLUMN     "promoCode" TEXT,
ADD COLUMN     "shippingAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DECIMAL(65,30),
ADD COLUMN     "totalAmount" DECIMAL(65,30),
ALTER COLUMN "companyId" DROP NOT NULL,
ALTER COLUMN "warehouseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sd_sales_order_lines" ADD COLUMN     "description" TEXT,
ADD COLUMN     "lineTotal" DECIMAL(65,30),
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(65,30),
ALTER COLUMN "materialId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "sd_sales_orders_idempotencyKey_key" ON "sd_sales_orders"("idempotencyKey");

-- CreateIndex
CREATE INDEX "sd_sales_orders_channel_createdAt_idx" ON "sd_sales_orders"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "sd_sales_orders_createdAt_idx" ON "sd_sales_orders"("createdAt");

