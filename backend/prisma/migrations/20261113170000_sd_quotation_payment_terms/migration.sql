-- Optional customer-facing payment terms printed on the quotation PDF (e.g. "50% on order, 50% on delivery").
ALTER TABLE "sd_quotations" ADD COLUMN "paymentTerms" TEXT;
