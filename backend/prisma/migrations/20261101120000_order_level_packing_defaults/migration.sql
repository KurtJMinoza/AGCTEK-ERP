-- Default packing is order-level (per physical warehouse), not one package per
-- allocation/picking task.  Package type remains the physical carton type;
-- packageRole records whether a package is the automatic default or an
-- explicit split/manual package.

ALTER TABLE "wm_packing_sessions"
    ADD COLUMN IF NOT EXISTS "salesOrderId" TEXT;

ALTER TABLE "wm_packages"
    ADD COLUMN IF NOT EXISTS "salesOrderId" TEXT,
    ADD COLUMN IF NOT EXISTS "packageRole" TEXT NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "wm_packing_sessions"
    ADD CONSTRAINT "wm_packing_sessions_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wm_packages"
    ADD CONSTRAINT "wm_packages_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "wm_packing_sessions_salesOrderId_warehouseId_status_idx"
    ON "wm_packing_sessions"("salesOrderId", "warehouseId", "status");

CREATE INDEX IF NOT EXISTS "wm_packages_packingSessionId_idx"
    ON "wm_packages"("packingSessionId");

CREATE INDEX IF NOT EXISTS "wm_packages_salesOrderId_status_idx"
    ON "wm_packages"("salesOrderId", "status");

-- One open packing session is the authoritative default workspace for an order
-- in a warehouse.  Multiple warehouses legitimately require separate physical
-- packing workspaces and shipments.
CREATE UNIQUE INDEX IF NOT EXISTS "wm_packing_sessions_one_open_per_order_warehouse"
    ON "wm_packing_sessions"("salesOrderId", "warehouseId")
    WHERE "salesOrderId" IS NOT NULL AND "status" = 'OPEN';

-- An explicit split remains possible, but the automatic path can have only one
-- active DEFAULT package per packing session.  CANCELLED records remain as
-- history and do not block a corrective replacement.
CREATE UNIQUE INDEX IF NOT EXISTS "wm_packages_one_default_per_packing_session"
    ON "wm_packages"("packingSessionId")
    WHERE "packingSessionId" IS NOT NULL
      AND "packageRole" = 'DEFAULT'
      AND "status" <> 'CANCELLED';
