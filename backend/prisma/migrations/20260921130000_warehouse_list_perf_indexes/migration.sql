-- Performance indexes for warehouse list filters / org option lookups
CREATE INDEX IF NOT EXISTS "warehouses_companyId_idx" ON "warehouses"("companyId");
CREATE INDEX IF NOT EXISTS "warehouses_status_idx" ON "warehouses"("status");
CREATE INDEX IF NOT EXISTS "warehouses_deletedAt_idx" ON "warehouses"("deletedAt");
CREATE INDEX IF NOT EXISTS "warehouses_companyId_deletedAt_status_idx"
  ON "warehouses"("companyId", "deletedAt", "status");
