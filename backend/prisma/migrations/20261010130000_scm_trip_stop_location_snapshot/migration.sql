-- Trip stops snapshot their location source; legacy rows stay NULL and are inferred.
ALTER TABLE "TripStop" ADD COLUMN "locationKind" TEXT;
ALTER TABLE "TripStop" ADD COLUMN "locationSnapshotAt" TIMESTAMP(3);
