-- Voided POS sales that predate the void transaction table get their reversal
-- entry, so the register history shows the void that follows each sale.
INSERT INTO "sd_pos_void_transactions" (
    "id",
    "voidNumber",
    "salesOrderId",
    "originalReceiptNumber",
    "companyId",
    "branchId",
    "posSessionId",
    "cashierUserId",
    "currency",
    "amount",
    "reason",
    "voidedBy",
    "createdAt"
)
SELECT
    'void_' || o."id",
    'V-' || COALESCE(o."receiptNumber", o."orderNumber"),
    o."id",
    o."receiptNumber",
    o."companyId",
    o."branchId",
    o."posSessionId",
    o."cashierUserId",
    COALESCE(o."currency", 'PHP'),
    -COALESCE(o."totalAmount", 0),
    COALESCE(o."voidReason", 'Voided sale'),
    o."voidedBy",
    COALESCE(o."voidedAt", o."updatedAt")
FROM "sd_sales_orders" o
LEFT JOIN "sd_pos_void_transactions" v
    ON v."salesOrderId" = o."id"
WHERE o."channel" = 'POS'
  AND o."voidedAt" IS NOT NULL
  AND v."id" IS NULL;
