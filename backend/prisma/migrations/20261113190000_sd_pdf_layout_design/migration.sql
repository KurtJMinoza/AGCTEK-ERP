-- Imported PDF design (letterhead / background) on quotation PDF layout profiles.
ALTER TABLE "sd_pdf_layout_profiles"
    ADD COLUMN "designStorageKey" TEXT,
    ADD COLUMN "designFileName" TEXT,
    ADD COLUMN "designByteSize" INTEGER,
    ADD COLUMN "designUploadedAt" TIMESTAMP(3),
    ADD COLUMN "designUploadedBy" TEXT,
    ADD COLUMN "designVersion" INTEGER NOT NULL DEFAULT 0;
