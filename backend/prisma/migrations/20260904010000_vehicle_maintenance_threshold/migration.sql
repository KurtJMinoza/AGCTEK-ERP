-- Rename max odometer → maintenance service threshold (same column semantics, clearer name)
ALTER TABLE "Vehicle" RENAME COLUMN "maxOdometerKm" TO "maintenanceThresholdKm";
