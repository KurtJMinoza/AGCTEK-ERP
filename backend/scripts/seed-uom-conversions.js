/**
 * Re-seed global UOM conversion factors (materialId = null).
 * Safe to run after purge-mm-data.js if conversions were lost.
 */
const { PrismaClient } = require('@prisma/client')

const conversions = [
  { from: 'DZ', to: 'PCS', factor: 12 },
  { from: 'GRO', to: 'PCS', factor: 144 },
  { from: 'GRO', to: 'DZ', factor: 12 },
  { from: 'PR', to: 'PCS', factor: 2 },
  { from: 'EA', to: 'PCS', factor: 1 },
  { from: 'PACK', to: 'PCS', factor: 10 },
  { from: 'BOX', to: 'PCS', factor: 12 },
  { from: 'BOX', to: 'PACK', factor: 1 },
  { from: 'CTN', to: 'BOX', factor: 10 },
  { from: 'CTN', to: 'PCS', factor: 120 },
  { from: 'CASE', to: 'PCS', factor: 24 },
  { from: 'PAL', to: 'CTN', factor: 20 },
  { from: 'PAL', to: 'BOX', factor: 200 },
  { from: 'REAM', to: 'PCS', factor: 500 },
  { from: 'BDL', to: 'PCS', factor: 10 },
  { from: 'G', to: 'MG', factor: 1000 },
  { from: 'KG', to: 'G', factor: 1000 },
  { from: 'KG', to: 'MG', factor: 1_000_000 },
  { from: 'TON', to: 'KG', factor: 1000 },
  { from: 'LB', to: 'OZ', factor: 16 },
  { from: 'KG', to: 'LB', factor: 2.20462 },
  { from: 'LB', to: 'KG', factor: 0.453592 },
  { from: 'L', to: 'ML', factor: 1000 },
  { from: 'GAL', to: 'QT', factor: 4 },
  { from: 'QT', to: 'PT', factor: 2 },
  { from: 'GAL', to: 'L', factor: 3.78541 },
  { from: 'L', to: 'GAL', factor: 0.264172 },
  { from: 'CBM', to: 'L', factor: 1000 },
  { from: 'CM', to: 'MM', factor: 10 },
  { from: 'M', to: 'CM', factor: 100 },
  { from: 'M', to: 'MM', factor: 1000 },
  { from: 'KM', to: 'M', factor: 1000 },
  { from: 'FT', to: 'IN', factor: 12 },
  { from: 'YD', to: 'FT', factor: 3 },
  { from: 'M', to: 'FT', factor: 3.28084 },
  { from: 'IN', to: 'CM', factor: 2.54 },
  { from: 'SQM', to: 'SQFT', factor: 10.7639 },
  { from: 'SQFT', to: 'SQM', factor: 0.092903 },
  { from: 'DAY', to: 'HR', factor: 24 },
  { from: 'WK', to: 'DAY', factor: 7 },
  { from: 'MO', to: 'DAY', factor: 30 },
]

const prisma = new PrismaClient()

async function main() {
  const uomByCode = Object.fromEntries(
    (await prisma.mmUom.findMany({ where: { deletedAt: null } })).map((u) => [
      u.code,
      u,
    ]),
  )

  let created = 0
  let updated = 0
  for (const c of conversions) {
    const fromUom = uomByCode[c.from]
    const toUom = uomByCode[c.to]
    if (!fromUom || !toUom) continue

    const existing = await prisma.mmUomConversion.findFirst({
      where: {
        fromUomId: fromUom.id,
        toUomId: toUom.id,
        materialId: null,
      },
    })

    if (existing) {
      await prisma.mmUomConversion.update({
        where: { id: existing.id },
        data: { factor: c.factor, deletedAt: null },
      })
      updated++
    } else {
      await prisma.mmUomConversion.create({
        data: {
          fromUomId: fromUom.id,
          toUomId: toUom.id,
          factor: c.factor,
          materialId: null,
        },
      })
      created++
    }
  }

  const total = await prisma.mmUomConversion.count()
  console.log(
    `UOM conversions: ${created} created, ${updated} updated, ${total} total.`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
