-- Shopper accounts are deliberately separate from ERP staff Users.
CREATE TABLE "RetailClient" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'PH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetailCartItem" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "product" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailCartItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetailClient_email_key" ON "RetailClient"("email");
CREATE INDEX "RetailClient_email_idx" ON "RetailClient"("email");
CREATE UNIQUE INDEX "RetailCartItem_clientId_sku_key" ON "RetailCartItem"("clientId", "sku");
CREATE INDEX "RetailCartItem_clientId_idx" ON "RetailCartItem"("clientId");

ALTER TABLE "RetailCartItem"
    ADD CONSTRAINT "RetailCartItem_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "RetailClient"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
