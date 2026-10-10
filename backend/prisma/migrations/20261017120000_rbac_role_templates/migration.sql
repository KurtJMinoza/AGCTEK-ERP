-- RBAC Stage 3: role templates. Templates are copied into roles once; they never grant access.

-- CreateTable
CREATE TABLE "role_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_template_permissions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_template_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_templates_code_key" ON "role_templates"("code");

-- CreateIndex
CREATE INDEX "role_template_permissions_resourceId_idx" ON "role_template_permissions"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "role_template_permissions_templateId_resourceId_key" ON "role_template_permissions"("templateId", "resourceId");

-- AddForeignKey
ALTER TABLE "role_template_permissions" ADD CONSTRAINT "role_template_permissions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "role_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_template_permissions" ADD CONSTRAINT "role_template_permissions_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "permission_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
