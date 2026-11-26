/**
 * Idempotent seed for product-import UM/Category pairs:
 *   PC  → ACCESSORIES
 *   SET → WATCHES
 *
 *   cd backend && node scripts/seed-uom-categories-pc-set.cjs
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const UOMS = [
    { code: 'PC', name: 'Piece', symbol: 'pc' },
    { code: 'SET', name: 'Set', symbol: 'set' },
]

const CATEGORIES = [
    { code: 'ACCESSORIES', name: 'Accessories' },
    { code: 'WATCHES', name: 'Watches' },
]

async function upsertUom(u, sortOrder) {
    const row = await prisma.mmUom.upsert({
        where: { code: u.code },
        update: {
            name: u.name,
            symbol: u.symbol,
            isActive: true,
            deletedAt: null,
            sortOrder,
        },
        create: { ...u, sortOrder, isActive: true },
        select: { id: true, code: true, name: true },
    })
    console.log(`UOM  ${row.code} (${row.name})`)
    return row
}

async function upsertCategory(c, sortOrder) {
    const byCode = await prisma.mmMaterialCategory.findFirst({
        where: { code: { equals: c.code, mode: 'insensitive' } },
    })
    if (byCode) {
        const row = await prisma.mmMaterialCategory.update({
            where: { id: byCode.id },
            data: {
                code: c.code,
                name: c.name,
                isActive: true,
                deletedAt: null,
                sortOrder,
            },
            select: { id: true, code: true, name: true },
        })
        console.log(`CAT  ${row.code} (${row.name}) [by code]`)
        return row
    }

    // Prefer remapping the existing name-matched row (e.g. CAT-000007 Accessories)
    // so import by ACCESSORIES/WATCHES stays unambiguous.
    const byName = await prisma.mmMaterialCategory.findFirst({
        where: {
            name: { equals: c.name, mode: 'insensitive' },
            deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
    })
    if (byName) {
        const row = await prisma.mmMaterialCategory.update({
            where: { id: byName.id },
            data: {
                code: c.code,
                name: c.name,
                isActive: true,
                deletedAt: null,
                sortOrder,
            },
            select: { id: true, code: true, name: true },
        })
        console.log(`CAT  ${row.code} (${row.name}) [remapped from ${byName.code}]`)
        return row
    }

    const row = await prisma.mmMaterialCategory.create({
        data: {
            code: c.code,
            name: c.name,
            sortOrder,
            isActive: true,
        },
        select: { id: true, code: true, name: true },
    })
    console.log(`CAT  ${row.code} (${row.name}) [created]`)
    return row
}

async function main() {
    let order = 1
    for (const u of UOMS) {
        await upsertUom(u, order++)
    }
    for (const c of CATEGORIES) {
        await upsertCategory(c, order++)
    }

    // Verify import resolvers would find them
    for (const value of ['PC', 'SET', 'ACCESSORIES', 'WATCHES']) {
        const uom = await prisma.mmUom.findFirst({
            where: {
                deletedAt: null,
                isActive: true,
                OR: [
                    { code: { equals: value, mode: 'insensitive' } },
                    { name: { equals: value, mode: 'insensitive' } },
                ],
            },
            select: { code: true },
        })
        const cat = await prisma.mmMaterialCategory.findFirst({
            where: {
                deletedAt: null,
                isActive: true,
                OR: [
                    { code: { equals: value, mode: 'insensitive' } },
                    { name: { equals: value, mode: 'insensitive' } },
                ],
            },
            select: { code: true, name: true },
        })
        if (uom) console.log(`resolve UM "${value}" → ${uom.code}`)
        if (cat) console.log(`resolve Category "${value}" → ${cat.code} (${cat.name})`)
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
