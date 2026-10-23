-- Free-text section headings on SD quotations (not priced; product lines stay numbered 1..n).
CREATE TABLE "sd_quotation_sections" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "beforeLineNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_quotation_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sd_quotation_sections_quotationId_beforeLineNumber_key" ON "sd_quotation_sections"("quotationId", "beforeLineNumber");

-- AddForeignKey
ALTER TABLE "sd_quotation_sections" ADD CONSTRAINT "sd_quotation_sections_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "sd_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
