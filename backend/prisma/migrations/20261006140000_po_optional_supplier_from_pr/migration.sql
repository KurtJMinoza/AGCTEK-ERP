-- Allow draft PO from PR without supplier; supplier required at submit/send.
ALTER TABLE "mm_purchase_orders" ALTER COLUMN "supplierId" DROP NOT NULL;
