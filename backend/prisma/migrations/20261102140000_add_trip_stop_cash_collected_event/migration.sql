-- Driver "Cash Received" at a COD stop is audited as a trip stop event.
ALTER TYPE "TripStopEventType" ADD VALUE IF NOT EXISTS 'CASH_COLLECTED';
