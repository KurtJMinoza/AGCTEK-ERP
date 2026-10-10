/**
 * Test-data seed: gives the SD catalog real MM stock so the SD→MM handoff
 * (confirm → ATP → reservation) has something to allocate.
 *
 * Idempotent. Creates:
 *   - company AGCTEK + branch BR-HQ + MAIN warehouse (+ storage topology)
 *   - reference masters (PCS UOM, PHP, moving-average valuation class,
 *     MERCHANDISE material type, SD_CATALOG category)
 *   - one MM material per ACTIVE SdProduct (materialCode = `SD-<sku>`)
 *   - an ACTIVE SdProductMaterialAssignment (product → material)
 *   - UNRESTRICTED opening stock in MAIN (balance + matching ledger txn)
 *
 * Stock is written as an opening-balance ledger pair, mirroring the existing
 * seed convention in `seed-mm-full.ts`. Runtime stock changes still go through
 * `InventoryPostingService`; this script only bootstraps test data.
 *
 *   cd backend && npm run prisma:seed-sd-mm-stock
 */
import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { seedMmOrgAndWarehouseStructure } from './seed-mm-org-warehouse-structure'

const STOCK_QTY = 1000
const OPENING_TXN_PREFIX = 'SEED-SDSTOCK'

type UpsertStockArgs = {
    companyId: string
    warehouseId: string
    storageBinId?: string | null
    materialId: string
    uomId: string
    quantity: number
    unitCost?: number
    transactionNumber: string
}

/** Opening-balance pair (balance + immutable ledger row), idempotent by txn number. */
async function upsertStock(prisma: PrismaClient, args: UpsertStockArgs) {
    const qty = new Decimal(args.quantity)
    const unitCost = new Decimal(args.unitCost ?? 0)
    const now = new Date()
    const storageBinId = args.storageBinId ?? null

    const existingBal = await prisma.mmInventoryBalance.findFirst({
        where: {
            companyId: args.companyId,
            warehouseId: args.warehouseId,
            storageBinId,
            materialId: args.materialId,
            batchId: null,
            serialNumberId: null,
            stockStatus: 'UNRESTRICTED',
        },
    })
    if (existingBal) {
        await prisma.mmInventoryBalance.update({
            where: { id: existingBal.id },
            data: {
                quantity: qty,
                availableQuantity: qty,
            },
        })
    } else {
        await prisma.mmInventoryBalance.create({
            data: {
                companyId: args.companyId,
                warehouseId: args.warehouseId,
                storageBinId,
                materialId: args.materialId,
                stockStatus: 'UNRESTRICTED',
                quantity: qty,
                reservedQuantity: 0,
                availableQuantity: qty,
            },
        })
    }

    const existingTxn = await prisma.mmInventoryTransaction.findUnique({
        where: { transactionNumber: args.transactionNumber },
    })
    if (!existingTxn) {
        await prisma.mmInventoryTransaction.create({
            data: {
                transactionNumber: args.transactionNumber,
                companyId: args.companyId,
                warehouseId: args.warehouseId,
                storageBinId,
                materialId: args.materialId,
                stockStatus: 'UNRESTRICTED',
                movementType: 'RECEIPT',
                quantity: qty,
                baseQuantity: qty,
                signedQuantity: qty,
                uomId: args.uomId,
                unitCost,
                totalCost: qty.mul(unitCost),
                postingDate: now,
                documentDate: now,
                sourceModule: 'SEED',
                sourceDocumentType: 'OPENING_BALANCE',
                remarks: 'SD catalog test stock',
                createdBy: 'seed',
            },
        })
    }
}

export async function seedSdMmTestStock(prisma: PrismaClient, quantity = STOCK_QTY) {
    console.log('Seeding SD → MM test stock …')

    const org = await seedMmOrgAndWarehouseStructure(prisma)
    const companyId = org.company.id
    const warehouseId = org.mainWarehouse.id

    // ── Reference masters ───────────────────────────────────────────
    const pcs = await prisma.mmUom.upsert({
        where: { code: 'PCS' },
        update: { isActive: true, deletedAt: null },
        create: { code: 'PCS', name: 'Piece', symbol: 'pcs', sortOrder: 1 },
    })
    const php = await prisma.mmCurrency.upsert({
        where: { code: 'PHP' },
        update: {},
        create: { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
    })
    const valuationClass = await prisma.mmValuationClass.upsert({
        where: { code: 'MOVING_AVERAGE' },
        update: {},
        create: { code: 'MOVING_AVERAGE', name: 'Moving Average' },
    })
    const materialType = await prisma.mmMaterialType.upsert({
        where: { code: 'MERCHANDISE' },
        update: { name: 'Merchandise', deletedAt: null },
        create: { code: 'MERCHANDISE', name: 'Merchandise', sortOrder: 7 },
    })
    const category = await prisma.mmMaterialCategory.upsert({
        where: { code: 'SD_CATALOG' },
        update: { name: 'SD Catalog Items', deletedAt: null },
        create: { code: 'SD_CATALOG', name: 'SD Catalog Items', sortOrder: 90 },
    })

    const products = await prisma.sdProduct.findMany({
        where: { isActive: true },
        orderBy: [{ divisionId: 'asc' }, { sortOrder: 'asc' }, { sku: 'asc' }],
    })

    let count = 0
    for (const product of products) {
        const materialCode = `SD-${product.sku}`
        const cost = new Decimal(product.price ?? 0)

        const material = await prisma.mmMaterial.upsert({
            where: { materialCode },
            update: {
                materialName: product.name,
                sku: product.sku,
                status: 'ACTIVE',
                baseUomId: pcs.id,
                salesUomId: pcs.id,
                purchaseUomId: pcs.id,
                standardCost: cost,
                companyId,
                defaultWarehouseId: warehouseId,
                deletedAt: null,
            },
            create: {
                materialCode,
                materialName: product.name,
                sku: product.sku,
                description: `SD catalog ${product.divisionId} — ${product.sku}`,
                materialTypeId: materialType.id,
                materialCategoryId: category.id,
                baseUomId: pcs.id,
                salesUomId: pcs.id,
                purchaseUomId: pcs.id,
                status: 'ACTIVE',
                standardCost: cost,
                inventoryManaged: true,
                purchasable: true,
                sellable: true,
                companyId,
                defaultWarehouseId: warehouseId,
                currencyId: php.id,
                valuationClassId: valuationClass.id,
                valuationMethod: 'MOVING_AVERAGE',
            },
        })

        // Keep the commercial + stock UOM identical so conversion is 1:1.
        if (product.salesUomId !== pcs.id) {
            await prisma.sdProduct.update({
                where: { id: product.id },
                data: { salesUomId: pcs.id },
            })
        }

        // Explicit product → material assignment (no unique constraint → findFirst).
        const existingAssignment =
            await prisma.sdProductMaterialAssignment.findFirst({
                where: { productId: product.id, companyId },
            })
        if (existingAssignment) {
            await prisma.sdProductMaterialAssignment.update({
                where: { id: existingAssignment.id },
                data: {
                    materialId: material.id,
                    divisionId: product.divisionId,
                    salesUomId: pcs.id,
                    materialUomId: pcs.id,
                    status: 'ACTIVE',
                    inventoryRelevant: true,
                    atpRelevant: true,
                    reservationRelevant: true,
                    effectiveTo: null,
                },
            })
        } else {
            await prisma.sdProductMaterialAssignment.create({
                data: {
                    productId: product.id,
                    materialId: material.id,
                    companyId,
                    divisionId: product.divisionId,
                    salesUomId: pcs.id,
                    materialUomId: pcs.id,
                    status: 'ACTIVE',
                },
            })
        }

        await upsertStock(prisma, {
            companyId,
            warehouseId,
            materialId: material.id,
            uomId: pcs.id,
            quantity,
            unitCost: Number(cost),
            transactionNumber: `${OPENING_TXN_PREFIX}-${product.sku}`,
        })

        // Keep the commercial on-hand (catalog) aligned with the seeded ledger.
        await prisma.mmMaterial.update({
            where: { id: material.id },
            data: { onHandQty: new Decimal(quantity) },
        })

        count++
    }

    console.log(
        `  ${count} SD product(s) → materials with ${quantity} PCS UNRESTRICTED stock in ${org.mainWarehouse.code}.`,
    )
    return { companyId, warehouseId, products: count, quantity }
}

async function main() {
    const prisma = new PrismaClient()
    try {
        await seedSdMmTestStock(prisma)
    } finally {
        await prisma.$disconnect()
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}
