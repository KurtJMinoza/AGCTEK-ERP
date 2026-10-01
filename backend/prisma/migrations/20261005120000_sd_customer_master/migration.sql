-- CreateTable
CREATE TABLE "sd_customers" (
    "id" TEXT NOT NULL,
    "customerNumber" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "availableCredit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sd_customers_customerNumber_key" ON "sd_customers"("customerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sd_customers_email_key" ON "sd_customers"("email");

-- CreateIndex
CREATE INDEX "sd_customers_status_idx" ON "sd_customers"("status");

-- CreateIndex
CREATE INDEX "sd_customers_companyName_idx" ON "sd_customers"("companyName");
