-- AlterTable
ALTER TABLE "permission_resources" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "permission_resources_parentId_idx" ON "permission_resources"("parentId");

-- AddForeignKey
ALTER TABLE "permission_resources" ADD CONSTRAINT "permission_resources_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "permission_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
