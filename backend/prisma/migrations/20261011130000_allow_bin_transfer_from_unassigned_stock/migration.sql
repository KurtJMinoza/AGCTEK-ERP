-- Bin transfers from warehouse-level (bin-less) stock.
-- Legacy goods receipts could post stock with no storage bin; that stock is
-- on hand but not pickable (allocation has no bin to pick from), which broke
-- fulfillment with "No pickable stock location". Allow the OUT leg of a bin
-- transfer to source such stock so it can be moved into a pickable bin
-- through the standard posting engine.
ALTER TABLE "mm_bin_transfer_lines"
    ALTER COLUMN "sourceBinId" DROP NOT NULL;
