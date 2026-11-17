-- POS walk-in customers are created with a name only, so the email of a
-- Customer Master record becomes optional.
ALTER TABLE "sd_customers" ALTER COLUMN "email" DROP NOT NULL;
