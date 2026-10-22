-- Shop Gmail-only authentication: optional password, verified email, auth identities, OTP table.

ALTER TABLE "RetailClient" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "RetailClient" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "RetailClient" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "RetailClient" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "RetailClient" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "RetailClient_status_idx" ON "RetailClient"("status");

CREATE TABLE IF NOT EXISTS "RetailAuthIdentity" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT,
    "providerEmail" TEXT NOT NULL,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetailAuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RetailAuthIdentity_provider_providerUserId_key"
    ON "RetailAuthIdentity"("provider", "providerUserId");
CREATE INDEX IF NOT EXISTS "RetailAuthIdentity_clientId_idx" ON "RetailAuthIdentity"("clientId");
CREATE INDEX IF NOT EXISTS "RetailAuthIdentity_provider_providerEmail_idx"
    ON "RetailAuthIdentity"("provider", "providerEmail");

ALTER TABLE "RetailAuthIdentity" ADD CONSTRAINT "RetailAuthIdentity_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "RetailClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "RetailEmailOtp" (
    "id" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "requestIp" TEXT,
    "requestUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetailEmailOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RetailEmailOtp_emailNormalized_createdAt_idx"
    ON "RetailEmailOtp"("emailNormalized", "createdAt");
CREATE INDEX IF NOT EXISTS "RetailEmailOtp_emailNormalized_expiresAt_idx"
    ON "RetailEmailOtp"("emailNormalized", "expiresAt");
