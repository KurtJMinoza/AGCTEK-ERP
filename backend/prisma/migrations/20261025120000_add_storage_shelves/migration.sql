-- AlterTable
ALTER TABLE "wm_storage_bins" ADD COLUMN     "shelfId" TEXT;

-- CreateTable
CREATE TABLE "wm_storage_shelves" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "storageSectionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "wm_storage_shelves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wm_storage_shelves_storageSectionId_code_key" ON "wm_storage_shelves"("storageSectionId", "code");

-- CreateIndex
CREATE INDEX "wm_storage_bins_shelfId_idx" ON "wm_storage_bins"("shelfId");

-- AddForeignKey
ALTER TABLE "wm_storage_shelves" ADD CONSTRAINT "wm_storage_shelves_storageSectionId_fkey" FOREIGN KEY ("storageSectionId") REFERENCES "wm_storage_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wm_storage_bins" ADD CONSTRAINT "wm_storage_bins_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "wm_storage_shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;
