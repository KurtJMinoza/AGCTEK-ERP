-- Customer 360: birthday on SD customer master + CRM relationship rating with history.

ALTER TABLE "sd_customers" ADD COLUMN IF NOT EXISTS "birthDate" DATE;

CREATE TABLE IF NOT EXISTS "crm_customer_ratings" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "ratedBy" TEXT NOT NULL,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_customer_ratings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "crm_customer_rating_history" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "previousStars" INTEGER,
    "comment" TEXT,
    "ratedBy" TEXT NOT NULL,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_customer_rating_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "crm_customer_ratings_customerId_key"
    ON "crm_customer_ratings"("customerId");

CREATE INDEX IF NOT EXISTS "crm_customer_ratings_stars_idx"
    ON "crm_customer_ratings"("stars");

CREATE INDEX IF NOT EXISTS "crm_customer_rating_history_customerId_ratedAt_idx"
    ON "crm_customer_rating_history"("customerId", "ratedAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'crm_customer_ratings_customerId_fkey'
    ) THEN
        ALTER TABLE "crm_customer_ratings"
            ADD CONSTRAINT "crm_customer_ratings_customerId_fkey"
            FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'crm_customer_rating_history_customerId_fkey'
    ) THEN
        ALTER TABLE "crm_customer_rating_history"
            ADD CONSTRAINT "crm_customer_rating_history_customerId_fkey"
            FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
