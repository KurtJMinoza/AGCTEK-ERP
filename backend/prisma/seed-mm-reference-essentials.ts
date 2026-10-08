import type { PrismaClient } from '@prisma/client'

/**
 * Essential MM-01 reference data only: material types, categories, units of measure
 * and global UOM conversions. Idempotent (upsert by code); restores soft-deleted rows.
 */

const MATERIAL_TYPES = [
    { code: 'MERCHANDISE', name: 'Merchandise', description: 'Goods bought and resold without transformation.' },
    { code: 'FINISHED_GOOD', name: 'Finished Good', description: 'Products ready for sale.' },
    { code: 'RAW_MATERIAL', name: 'Raw Material', description: 'Inputs consumed to produce other materials.' },
    { code: 'RETURNABLE', name: 'Returnable Container', description: 'Containers exchanged or returned by customers, e.g. LPG cylinders.' },
    { code: 'PACKAGING', name: 'Packaging', description: 'Packaging used to ship or store goods.' },
    { code: 'CONSUMABLE', name: 'Consumable', description: 'Operating supplies consumed internally.' },
    { code: 'SPARE_PART', name: 'Spare Part', description: 'Parts for maintaining equipment and vehicles.' },
]

const CATEGORY_TREE: { code: string; name: string; children: { code: string; name: string }[] }[] = [
    {
        code: 'RETAIL',
        name: 'Retail Goods',
        children: [
            { code: 'RET_VITAMINS', name: 'Vitamins' },
            { code: 'RET_BAGS', name: 'Bags' },
            { code: 'RET_ACCESSORIES', name: 'Accessories' },
            { code: 'RET_GENERAL', name: 'General Goods' },
        ],
    },
    {
        code: 'LPG',
        name: 'LPG',
        children: [
            { code: 'LPG_GAS', name: 'LPG Gas (Refill)' },
            { code: 'LPG_CYLINDER', name: 'LPG Cylinders' },
            { code: 'LPG_ACCESSORY', name: 'LPG Accessories' },
        ],
    },
    {
        code: 'APPLIANCES',
        name: 'Home Appliances',
        children: [
            { code: 'APP_COOLING', name: 'Cooling' },
            { code: 'APP_LAUNDRY', name: 'Laundry' },
            { code: 'APP_KITCHEN', name: 'Kitchen' },
        ],
    },
    {
        code: 'OPERATING',
        name: 'Operating Supplies',
        children: [
            { code: 'OPS_PACKAGING', name: 'Packaging Materials' },
            { code: 'OPS_CONSUMABLES', name: 'Consumables' },
            { code: 'OPS_SPARE_PARTS', name: 'Spare Parts' },
        ],
    },
]

const UOMS = [
    { code: 'PCS', name: 'Piece', symbol: 'pcs' },
    { code: 'SET', name: 'Set', symbol: 'set' },
    { code: 'DZ', name: 'Dozen', symbol: 'dz' },
    { code: 'PACK', name: 'Pack', symbol: 'pk' },
    { code: 'BOX', name: 'Box', symbol: 'box' },
    { code: 'CTN', name: 'Carton', symbol: 'ctn' },
    { code: 'BTL', name: 'Bottle', symbol: 'btl' },
    { code: 'BAG', name: 'Bag', symbol: 'bag' },
    { code: 'CYL', name: 'Cylinder', symbol: 'cyl' },
    { code: 'KG', name: 'Kilogram', symbol: 'kg' },
    { code: 'G', name: 'Gram', symbol: 'g' },
    { code: 'L', name: 'Liter', symbol: 'L' },
    { code: 'ML', name: 'Milliliter', symbol: 'mL' },
    { code: 'M', name: 'Meter', symbol: 'm' },
]

/** Universal factors only (1 from = factor to); pack sizes such as BOX→PCS belong on the material. */
const CONVERSIONS = [
    { from: 'DZ', to: 'PCS', factor: 12 },
    { from: 'KG', to: 'G', factor: 1000 },
    { from: 'L', to: 'ML', factor: 1000 },
]

export async function seedMmReferenceEssentials(prisma: PrismaClient) {
    for (const [i, t] of MATERIAL_TYPES.entries()) {
        await prisma.mmMaterialType.upsert({
            where: { code: t.code },
            update: { name: t.name, description: t.description, sortOrder: i + 1, isActive: true, deletedAt: null },
            create: { ...t, sortOrder: i + 1 },
        })
    }

    let sortOrder = 1
    let categoryCount = 0
    for (const parent of CATEGORY_TREE) {
        const p = await prisma.mmMaterialCategory.upsert({
            where: { code: parent.code },
            update: { name: parent.name, parentId: null, sortOrder, isActive: true, deletedAt: null },
            create: { code: parent.code, name: parent.name, sortOrder },
        })
        sortOrder++
        categoryCount++
        for (const child of parent.children) {
            await prisma.mmMaterialCategory.upsert({
                where: { code: child.code },
                update: { name: child.name, parentId: p.id, sortOrder, isActive: true, deletedAt: null },
                create: { code: child.code, name: child.name, parentId: p.id, sortOrder },
            })
            sortOrder++
            categoryCount++
        }
    }

    for (const [i, u] of UOMS.entries()) {
        await prisma.mmUom.upsert({
            where: { code: u.code },
            update: { name: u.name, symbol: u.symbol, sortOrder: i + 1, isActive: true, deletedAt: null },
            create: { ...u, sortOrder: i + 1 },
        })
    }

    const uomByCode = new Map(
        (await prisma.mmUom.findMany({ where: { code: { in: UOMS.map((u) => u.code) } } })).map((u) => [u.code, u.id]),
    )
    for (const c of CONVERSIONS) {
        const fromUomId = uomByCode.get(c.from)!
        const toUomId = uomByCode.get(c.to)!
        const existing = await prisma.mmUomConversion.findFirst({
            where: { fromUomId, toUomId, materialId: null },
        })
        if (existing) {
            await prisma.mmUomConversion.update({
                where: { id: existing.id },
                data: { factor: c.factor, deletedAt: null },
            })
        } else {
            await prisma.mmUomConversion.create({
                data: { fromUomId, toUomId, factor: c.factor, materialId: null },
            })
        }
    }

    console.log(
        `MM reference essentials: ${MATERIAL_TYPES.length} material types, ${categoryCount} categories, ` +
            `${UOMS.length} UOMs, ${CONVERSIONS.length} conversions`,
    )
}
