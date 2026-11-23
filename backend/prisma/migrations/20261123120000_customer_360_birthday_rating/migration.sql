-- Customer 360: birthday on SD master + CRM relationship rating snapshot/history.

ALTER TABLE "sd_customers" ADD COLUMN "birthDate" DATE;

ALTER TABLE "crm_profiles" ADD COLUMN "ratingStars" INTEGER;
ALTER TABLE "crm_profiles" ADD COLUMN "ratedAt" TIMESTAMP(3);
ALTER TABLE "crm_profiles" ADD COLUMN "ratedBy" TEXT;

CREATE TABLE "crm_customer_rating_events" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "previousStars" INTEGER,
    "ratedBy" TEXT NOT NULL,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_customer_rating_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_customer_rating_events_customerId_ratedAt_idx"
ON "crm_customer_rating_events"("customerId", "ratedAt");

ALTER TABLE "crm_customer_rating_events"
ADD CONSTRAINT "crm_customer_rating_events_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
