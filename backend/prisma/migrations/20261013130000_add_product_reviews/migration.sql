-- Product reviews for the SD storefront (schema ships with the reviews PR
-- but the migration was not included — applied here for schema parity).
CREATE TABLE "product_reviews" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_reviews_productId_idx" ON "product_reviews"("productId");
CREATE INDEX "product_reviews_userId_idx" ON "product_reviews"("userId");

ALTER TABLE "product_reviews"
    ADD CONSTRAINT "product_reviews_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "sd_products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_reviews"
    ADD CONSTRAINT "product_reviews_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;