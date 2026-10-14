-- Storefront shoppers (RetailClient) can review products from delivered orders.
-- Existing ERP-user reviews keep their userId; shopper reviews set retailClientId.

ALTER TABLE "product_reviews" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "product_reviews" ADD COLUMN "retailClientId" TEXT;
ALTER TABLE "product_reviews" ADD COLUMN "salesOrderId" TEXT;

-- One review per shopper per product (NULL retailClientId rows are not constrained).
CREATE UNIQUE INDEX "product_reviews_retailClientId_productId_key" ON "product_reviews"("retailClientId", "productId");

CREATE INDEX "product_reviews_salesOrderId_idx" ON "product_reviews"("salesOrderId");

ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_retailClientId_fkey" FOREIGN KEY ("retailClientId") REFERENCES "RetailClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_one_author_check" CHECK (("userId" IS NOT NULL) <> ("retailClientId" IS NOT NULL));
