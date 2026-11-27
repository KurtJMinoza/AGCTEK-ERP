-- Snapshot MM batch expiry on external platform sale lines (reporting + audit).
ALTER TABLE "sd_ext_platform_transaction_lines" ADD COLUMN "expiryDate" DATE;