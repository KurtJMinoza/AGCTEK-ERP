/** One-off: material-scoped PCS/BTL/EA → L for SKU-LUBE-1L */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const ALTS = [
  { from: 'PCS', factor: 1 },
  { from: 'BTL', factor: 1 },
  { from: 'EA', factor: 1 },
]

async function main() {
  const mat = await prisma.mmMaterial.findFirst({
    where: { materialCode: 'SKU-LUBE-1L', deletedAt: null },
  })
  if (!mat) throw new Error('SKU-LUBE-1L not found')

  const uomByCode = Object.fromEntries(
    (await prisma.mmUom.findMany({ where: { deletedAt: null } })).map((u) => [
      u.code,
      u,
    ]),
  )
  const base = uomByCode.L
  if (!base) throw new Error('L UOM not found')

  for (const alt of ALTS) {
    const fromUom = uomByCode[alt.from]
    if (!fromUom) {
      console.warn('Skip missing UOM', alt.from)
      continue
    }
    const existing = await prisma.mmUomConversion.findFirst({
      where: {
        fromUomId: fromUom.id,
        toUomId: mat.baseUomId,
        materialId: mat.id,
      },
    })
    if (existing) {
      await prisma.mmUomConversion.update({
        where: { id: existing.id },
        data: { factor: alt.factor, deletedAt: null },
      })
      console.log('Updated', alt.from, '→ L')
    } else {
      await prisma.mmUomConversion.create({
        data: {
          fromUomId: fromUom.id,
          toUomId: mat.baseUomId,
          factor: alt.factor,
          materialId: mat.id,
        },
      })
      console.log('Created', alt.from, '→ L for', mat.materialCode)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
