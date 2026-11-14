/**
 * Adds UNRESTRICTED stock to one material through InventoryPostingService
 * (ADJUSTMENT_IN, reason OPENING_STOCK) — the same engine the app uses, so the
 * ledger, balance, valuation and events stay consistent. The stock lands in
 * the warehouse/bin that already holds the material (else its default
 * warehouse). Uses the compiled backend: run `npm run build` first.
 *
 *   cd backend && node scripts/seed-mm-add-stock.cjs MAT-000028 5 [runKey]
 *
 * Idempotent per (material, quantity, runKey); pass a new runKey to add again.
 */
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/app.module')
const { PrismaService } = require('../dist/prisma/prisma.service')
const { InventoryPostingService } = require('../dist/mm/inventory/inventory-posting.service')
const { InventoryAvailabilityService } = require('../dist/mm/inventory/inventory-availability.service')

async function main() {
    const [materialCode, qtyArg, runKey = 'seed-1'] = process.argv.slice(2)
    const quantity = Number(qtyArg)
    if (!materialCode || !(quantity > 0)) {
        throw new Error('Usage: node scripts/seed-mm-add-stock.cjs <materialCode> <quantity> [runKey]')
    }

    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
    try {
        const prisma = app.get(PrismaService)
        const posting = app.get(InventoryPostingService)
        const availability = app.get(InventoryAvailabilityService)

        const material = await prisma.mmMaterial.findFirst({
            where: { materialCode, deletedAt: null },
            select: { id: true, materialName: true, companyId: true, defaultWarehouseId: true, baseUomId: true, standardCost: true },
        })
        if (!material) throw new Error(`Material ${materialCode} not found`)
        if (!material.companyId) throw new Error(`Material ${materialCode} has no company`)

        const holder = await prisma.mmInventoryBalance.findFirst({
            where: { materialId: material.id, companyId: material.companyId, stockStatus: 'UNRESTRICTED' },
            orderBy: { quantity: 'desc' },
            select: { warehouseId: true, storageBinId: true },
        })
        const warehouseId = holder?.warehouseId ?? material.defaultWarehouseId
        if (!warehouseId) throw new Error(`No warehouse holds ${materialCode} and it has no default warehouse`)

        const now = new Date().toISOString()
        const txn = await posting.postTransaction({
            companyId: material.companyId,
            warehouseId,
            storageBinId: holder?.storageBinId ?? undefined,
            materialId: material.id,
            stockStatus: 'UNRESTRICTED',
            movementType: 'ADJUSTMENT_IN',
            quantity,
            uomId: material.baseUomId,
            unitCost: Number(material.standardCost ?? 0),
            postingDate: now,
            documentDate: now,
            sourceModule: 'SEED',
            sourceDocumentType: 'STOCK_SEED',
            sourceDocumentId: material.id,
            reasonCode: 'OPENING_STOCK',
            idempotencyKey: `seed-add-stock:${material.id}:${quantity}:${runKey}`,
            createdBy: 'seed',
        })
        const totals = await availability.syncMaterialMasterFromLedger(material.id)
        console.log(`Posted ${txn.transactionNumber}: +${quantity} ${materialCode} (${material.materialName})`)
        console.log('Ledger totals now:', JSON.stringify(totals))
    } finally {
        await app.close()
    }
}

main().catch((err) => {
    console.error(err.message ?? err)
    process.exit(1)
})
