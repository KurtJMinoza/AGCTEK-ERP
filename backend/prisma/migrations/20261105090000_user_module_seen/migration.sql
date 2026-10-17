-- Per-user "last seen" timestamps for ERP navigation badges (new data since last visit).
CREATE TABLE "user_module_seen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_module_seen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_module_seen_userId_key_key" ON "user_module_seen"("userId", "key");

ALTER TABLE "user_module_seen" ADD CONSTRAINT "user_module_seen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
