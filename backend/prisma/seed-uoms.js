/**
 * Seed / refresh Units of Measure + standard conversions only.
 * Usage: node --require ts-node/register prisma/seed-uoms.ts
 * Or: npx ts-node prisma/seed-uoms.ts
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const uoms = [
    { code: 'PCS', name: 'Piece', symbol: 'pcs' },
    { code: 'EA', name: 'Each', symbol: 'ea' },
    { code: 'DZ', name: 'Dozen', symbol: 'dz' },
    { code: 'GRO', name: 'Gross (144)', symbol: 'gr' },
    { code: 'PR', name: 'Pair', symbol: 'pr' },
    { code: 'SET', name: 'Set', symbol: 'set' },
    { code: 'BOX', name: 'Box', symbol: 'box' },
    { code: 'CTN', name: 'Carton', symbol: 'ctn' },
    { code: 'CASE', name: 'Case', symbol: 'case' },
    { code: 'PAL', name: 'Pallet', symbol: 'pal' },
    { code: 'BAG', name: 'Bag', symbol: 'bag' },
    { code: 'BTL', name: 'Bottle', symbol: 'btl' },
    { code: 'CAN', name: 'Can', symbol: 'can' },
    { code: 'DRM', name: 'Drum', symbol: 'drm' },
    { code: 'PACK', name: 'Pack', symbol: 'pk' },
    { code: 'ROLL', name: 'Roll', symbol: 'roll' },
    { code: 'BDL', name: 'Bundle', symbol: 'bdl' },
    { code: 'REAM', name: 'Ream', symbol: 'ream' },
    { code: 'MG', name: 'Milligram', symbol: 'mg' },
    { code: 'G', name: 'Gram', symbol: 'g' },
    { code: 'KG', name: 'Kilogram', symbol: 'kg' },
    { code: 'TON', name: 'Metric Ton', symbol: 't' },
    { code: 'LB', name: 'Pound', symbol: 'lb' },
    { code: 'OZ', name: 'Ounce', symbol: 'oz' },
    { code: 'ML', name: 'Milliliter', symbol: 'mL' },
    { code: 'L', name: 'Liter', symbol: 'L' },
    { code: 'GAL', name: 'Gallon (US)', symbol: 'gal' },
    { code: 'QT', name: 'Quart (US)', symbol: 'qt' },
    { code: 'PT', name: 'Pint (US)', symbol: 'pt' },
    { code: 'CBM', name: 'Cubic Meter', symbol: 'm³' },
    { code: 'MM', name: 'Millimeter', symbol: 'mm' },
    { code: 'CM', name: 'Centimeter', symbol: 'cm' },
    { code: 'M', name: 'Meter', symbol: 'm' },
    { code: 'KM', name: 'Kilometer', symbol: 'km' },
    { code: 'IN', name: 'Inch', symbol: 'in' },
    { code: 'FT', name: 'Foot', symbol: 'ft' },
    { code: 'YD', name: 'Yard', symbol: 'yd' },
    { code: 'SQM', name: 'Square Meter', symbol: 'm²' },
    { code: 'SQFT', name: 'Square Foot', symbol: 'ft²' },
    { code: 'HR', name: 'Hour', symbol: 'hr' },
    { code: 'DAY', name: 'Day', symbol: 'day' },
    { code: 'WK', name: 'Week', symbol: 'wk' },
    { code: 'MO', name: 'Month', symbol: 'mo' },
]

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

async function main() {
    for (let i = 0; i < uoms.length; i++) {
        const u = uoms[i]
        await prisma.mmUom.upsert({
            where: { code: u.code },
            update: {
                name: u.name,
                symbol: u.symbol,
                sortOrder: i + 1,
                isActive: true,
                deletedAt: null,
            },
            create: { ...u, sortOrder: i + 1 },
        })
    }

    const all = await prisma.mmUom.findMany({ where: { deletedAt: null } })
    const byCode = Object.fromEntries(all.map((u) => [u.code, u]))

    let convCount = 0
    for (const c of conversions) {
        const fromUom = byCode[c.from]
        const toUom = byCode[c.to]
        if (!fromUom || !toUom) {
            console.warn('Skip conversion missing UOM', c.from, '→', c.to)
            continue
        }
        const existing = await prisma.mmUomConversion.findFirst({
            where: { fromUomId: fromUom.id, toUomId: toUom.id, materialId: null },
        })
        if (existing) {
            await prisma.mmUomConversion.update({
                where: { id: existing.id },
                data: { factor: c.factor, deletedAt: null },
            })
        } else {
            await prisma.mmUomConversion.create({
                data: {
                    fromUomId: fromUom.id,
                    toUomId: toUom.id,
                    factor: c.factor,
                    materialId: null,
                },
            })
        }
        convCount++
    }

    console.log(`OK: ${uoms.length} UOMs, ${convCount} conversions`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
