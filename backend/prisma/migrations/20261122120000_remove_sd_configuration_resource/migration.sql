-- Remove the SD Configuration menu resource (Sales Organization, Document Types).
-- Child grants are removed by ON DELETE CASCADE.

DELETE FROM "permission_resources"
WHERE "code" = 'sd.configuration';
