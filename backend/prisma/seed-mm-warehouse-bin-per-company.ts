/**
 * Seed one warehouse per company and one storage bin per warehouse.
 *
 * Idempotent — safe to re-run:
 * - Company without a branch   → creates `BR-<code>` branch
 * - Company without a warehouse → creates `WH-<code>` warehouse
 * - Warehouse without any bin  → creates minimal WM topology
 *   (BULK_RACK storage type → A01 section → BIN-001 bin)
 *
 * Companies / warehouses that already have structure are left untouched.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function ensureBranch(company: { id: string; code: string; name: string }) {
    const existing = await prisma.branch.findFirst({
        where: { companyId: company.id, deletedAt: null },
    })
    if (existing) return existing
    const code = `BR-${company.code}`
    return prisma.branch.upsert({
        where: { companyId_code: { companyId: company.id, code } },
        update: {
            name: `${company.name} Branch`,
            status: 'ACTIVE',
            deletedAt: null,
        },
        create: {
            code,
            name: `${company.name} Branch`,
            companyId: company.id,
            status: 'ACTIVE',
        },
    })
}

async function ensureWarehouse(
    company: { id: string; code: string; name: string; address: string },
    branch: { id: string },
) {
    const existing = await prisma.warehouse.findFirst({
        where: { companyId: company.id, deletedAt: null },
    })
    if (existing) return { warehouse: existing, created: false }

    let code = `WH-${company.code}`
    for (let i = 2; ; i++) {
        const clash = await prisma.warehouse.findUnique({ where: { code } })
        if (!clash) break
        code = `WH-${company.code}-${i}`
    }
    const warehouse = await prisma.warehouse.create({
        data: {
            code,
            name: `${company.name} Warehouse`,
            companyId: company.id,
            branchId: branch.id,
            plantId: null,
            status: 'ACTIVE',
            timezone: 'Asia/Manila',
            address: company.address || null,
            warehouseType: 'GENERAL',
            defaultReceivingArea: 'RECEIVING',
            defaultShippingArea: 'SHIPPING',
        },
    })
    return { warehouse, created: true }
}

/** Ensure the warehouse has at least one bin (area → aisle → exact location). */
async function ensureBin(warehouse: { id: string; code: string }) {
    const binCount = await prisma.wmStorageBin.count({
        where: {
            storageSection: { storageType: { warehouseId: warehouse.id } },
        },
    })
    if (binCount > 0) return { created: false, code: null }

    let storageType = await prisma.wmStorageType.findFirst({
        where: { warehouseId: warehouse.id, code: 'BULK_RACK' },
    })
    if (!storageType) {
        storageType = await prisma.wmStorageType.create({
            data: {
                code: 'BULK_RACK',
                name: 'Bulk Rack Area',
                description: 'Primary pallet / rack storage',
                warehouseId: warehouse.id,
                putawayAllowed: true,
                pickingAllowed: true,
                status: 'ACTIVE',
            },
        })
    }

    let section = await prisma.wmStorageSection.findFirst({
        where: { storageTypeId: storageType.id, code: 'A01' },
    })
    if (!section) {
        section = await prisma.wmStorageSection.create({
            data: {
                code: 'A01',
                name: 'Aisle A01',
                description: `Bulk rack aisle for ${warehouse.code}`,
                storageTypeId: storageType.id,
                status: 'ACTIVE',
            },
        })
    }

    const binCode = 'BIN-001'
    const existing = await prisma.wmStorageBin.findFirst({
        where: { storageSectionId: section.id, code: binCode },
    })
    if (existing) return { created: false, code: existing.code }

    const bin = await prisma.wmStorageBin.create({
        data: {
            code: binCode,
            storageSectionId: section.id,
            barcode: `BIN-${warehouse.code}-001`,
            capacityQuantity: 120,
            capacityWeight: 600,
            capacityVolume: 2.5,
            weightUom: 'KG',
            volumeUom: 'CBM',
            status: 'ACTIVE',
        },
    })
    return { created: true, code: bin.code }
}

async function main() {
    const companies = await prisma.company.findMany({
        orderBy: { code: 'asc' },
    })
    console.log(`Companies found: ${companies.length}`)

    const report: Record<string, unknown>[] = []
    let warehousesCreated = 0
    let binsCreated = 0

    for (const company of companies) {
        const branch = await ensureBranch(company)
        const { warehouse, created } = await ensureWarehouse(company, branch)
        if (created) warehousesCreated++
        const bin = await ensureBin(warehouse)
        if (bin.created) binsCreated++

        report.push({
            company: { code: company.code, name: company.name },
            branch: branch.code,
            warehouse: { code: warehouse.code, binAdded: bin.created, binCode: bin.code },
        })
    }

    console.log(JSON.stringify(report, null, 2))
    console.log(`Summary: ${warehousesCreated} warehouse(s) created, ${binsCreated} bin(s) created.`)
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })