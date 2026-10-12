-- Preserve the HRIS employee number on the ERP identity used for task assignment.
ALTER TABLE "User" ADD COLUMN "employeeCode" TEXT;

CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");
