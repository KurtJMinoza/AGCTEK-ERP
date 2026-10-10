-- Payment method on sales orders (demo checkout payments)
ALTER TABLE "sd_sales_orders" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "sd_sales_orders" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT;
ALTER TABLE "sd_sales_orders" ADD COLUMN IF NOT EXISTS "paymentReference" TEXT;
ALTER TABLE "sd_sales_orders" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT;
ALTER TABLE "sd_sales_orders" ADD COLUMN IF NOT EXISTS "isDemoPayment" BOOLEAN NOT NULL DEFAULT false;

-- Demo checkout payment records (no real gateways connected)
CREATE TABLE IF NOT EXISTS "sd_sales_order_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentProvider" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "referenceNumber" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "paidAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sd_sales_order_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "sd_sales_order_payments_companyId_status_idx" ON "sd_sales_order_payments"("companyId", "status");
CREATE INDEX IF NOT EXISTS "sd_sales_order_payments_salesOrderId_idx" ON "sd_sales_order_payments"("salesOrderId");
ALTER TABLE "sd_sales_order_payments" ADD CONSTRAINT "sd_sales_order_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_sales_order_payments" ADD CONSTRAINT "sd_sales_order_payments_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;