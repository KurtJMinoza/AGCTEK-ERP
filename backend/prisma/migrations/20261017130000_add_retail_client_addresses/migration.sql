-- Customer-owned delivery locations. Coordinates are the authoritative pin
-- selected by the shopper; geocoded fields are optional because a pin may be
-- valid even when the provider cannot identify a complete postal address.
CREATE TABLE "RetailClientAddress" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "addressType" TEXT NOT NULL,
    "formattedAddress" TEXT,
    "addressLine" TEXT,
    "barangayOrNeighborhood" TEXT,
    "cityOrMunicipality" TEXT,
    "provinceOrState" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "additionalInfo" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailClientAddress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RetailClientAddress_latitude_check" CHECK ("latitude" >= -90 AND "latitude" <= 90),
    CONSTRAINT "RetailClientAddress_longitude_check" CHECK ("longitude" >= -180 AND "longitude" <= 180)
);

ALTER TABLE "RetailClientAddress"
    ADD CONSTRAINT "RetailClientAddress_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "RetailClient"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "RetailClientAddress_clientId_createdAt_idx"
    ON "RetailClientAddress"("clientId", "createdAt");
CREATE INDEX "RetailClientAddress_clientId_isDefault_idx"
    ON "RetailClientAddress"("clientId", "isDefault");

-- Prisma cannot represent this partial unique index. It is the DB-side
-- invariant behind the service's lock-and-switch default-address flow.
CREATE UNIQUE INDEX "RetailClientAddress_one_default_per_client"
    ON "RetailClientAddress"("clientId") WHERE "isDefault" = true;
