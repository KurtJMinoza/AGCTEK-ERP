-- Default all materials and per-warehouse valuation rows to standard cost.
UPDATE "mm_materials"
SET "valuationMethod" = 'STANDARD_COST'
WHERE "valuationMethod" IS DISTINCT FROM 'STANDARD_COST';

UPDATE "mm_material_valuation" AS v
SET
  "valuationMethod" = 'STANDARD_COST',
  "standardCost" = COALESCE(m."standardCost", v."standardCost", 0)
FROM "mm_materials" AS m
WHERE m."id" = v."materialId"
  AND (
    v."valuationMethod" IS DISTINCT FROM 'STANDARD_COST'
    OR v."standardCost" IS DISTINCT FROM m."standardCost"
  );