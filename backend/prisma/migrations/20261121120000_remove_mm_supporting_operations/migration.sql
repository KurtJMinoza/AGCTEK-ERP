-- Remove the retired MM Supporting Operations modules:
-- Document Management, Audit Trail, Compliance Dashboard, and Workflow & Approvals.
-- Drops the controlled document and compliance audit tables, plus their permission resources.
-- Child permission resources and role grants are removed by ON DELETE CASCADE.

DELETE FROM "permission_resources"
WHERE "code" LIKE 'mm.supporting-operations%';

DROP TABLE IF EXISTS "mm_controlled_document_versions";
DROP TABLE IF EXISTS "mm_controlled_documents";
DROP TABLE IF EXISTS "mm_compliance_audit_entries";
