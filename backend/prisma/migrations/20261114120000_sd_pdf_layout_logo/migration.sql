-- Company logo (PNG / JPEG) drawn instead of the company name in quotation PDFs.
ALTER TABLE "sd_pdf_layout_profiles"
    ADD COLUMN "logoStorageKey" TEXT,
    ADD COLUMN "logoFileName" TEXT,
    ADD COLUMN "logoMimeType" TEXT,
    ADD COLUMN "logoByteSize" INTEGER,
    ADD COLUMN "logoUploadedAt" TIMESTAMP(3),
    ADD COLUMN "logoUploadedBy" TEXT,
    ADD COLUMN "logoVersion" INTEGER NOT NULL DEFAULT 0;
