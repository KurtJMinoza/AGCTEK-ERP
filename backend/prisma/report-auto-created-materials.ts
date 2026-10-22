/**
 * Audit: materials that were AUTO-CREATED by the Product Catalog bug.
 *
 * The Product Catalog used to create a Material Master row for every
 * variant. Those rows are real materials with real stock references, so they
 * are NEVER deleted automatically. This report classifies them so an
 * authorized user can decide what to archive.
 *
 * Usage:
 *   npx ts-node --project prisma/tsconfig.seed.json prisma/report-auto-created-materials.ts
 *   npx ts-node --project prisma/tsconfig.seed.json prisma/report-auto-created-materials.ts --json
 *   npx ts-node --project prisma/tsconfig.seed.json prisma/report-auto-created-materials.ts --archive <materialId> [...]
 *
 * Rules:
 *   - materials WITH inventory are never archived
 *   - materials WITH transaction history are never archived
 *   - materials referenced by orders / warehouse records are never archived
 *   - only confirmed-unused materials may be archived (status -> ARCHIVED)
 *   - the audit history of the material is preserved
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type Row = {
    materialId: string
    materialCode: string
    materialName: string
    companyId: string | null
    status: string
    onHandQty: number
    reservedQty: number
    hasInventory: boolean
    hasTransactions: boolean
    hasOrderReference: boolean
    linkedVariantId: string | null
    linkedProductSku: string | null
    linkedVariantSku: string | null
    balanceRows: number
    transactionRows: number
    auditRows: number
}

const num = (value: unknown) => Number(value ?? 0)

async function collect(): Promise<Row[]> {
    const materials = await prisma.mmMaterial.findMany({
        where: { catalogSource: 'AUTO_CREATED' },
        select: {
            id: true,
            materialCode: true,
            materialName: true,
            companyId: true,
            status: true,
            onHandQty: true,
            reservedQty: true,
            catalogVariantId: true,
        },
        orderBy: { materialCode: 'asc' },
    })

    const rows: Row[] = []
    for (const material of materials) {
        const [balances, transactions, audits, variant] = await Promise.all([
            prisma.mmInventoryBalance.count({
                where: { materialId: material.id },
            }),
            prisma.mmInventoryTransaction.count({
                where: { materialId: material.id },
            }),
            prisma.mmMaterialAudit.count({
                where: { materialId: material.id },
            }),
            material.catalogVariantId
                ? prisma.sdProductVariant.findUnique({
                      where: { id: material.catalogVariantId },
                      select: {
                          id: true,
                          sku: true,
                          product: { select: { sku: true } },
                      },
                  })
                : Promise.resolve(null),
        ])

        // The material may also be linked through a variant row (the bulk
        // options/variants path links both ways).
        const linkedVariants = await prisma.sdProductVariant.findMany({
            where: { materialId: material.id, isActive: true },
            select: {
                id: true,
                sku: true,
                product: { select: { sku: true } },
            },
        })
        const linkedVariant = variant ?? linkedVariants[0] ?? null

        const orderReferences = await prisma.sdSalesOrderLine.count({
            where: { materialId: material.id },
        })
        const reservationReferences = await prisma.mmInventoryReservation.count(
            { where: { materialId: material.id } },
        )
        const pickingReferences = await prisma.wmPickingTask.count({
            where: { materialId: material.id },
        })

        const hasInventory =
            balances > 0 ||
            num(material.onHandQty) !== 0 ||
            num(material.reservedQty) !== 0
        const hasTransactions = transactions > 0
        const hasOrderReference =
            orderReferences > 0 ||
            reservationReferences > 0 ||
            pickingReferences > 0

        rows.push({
            materialId: material.id,
            materialCode: material.materialCode,
            materialName: material.materialName,
            companyId: material.companyId,
            status: material.status,
            onHandQty: num(material.onHandQty),
            reservedQty: num(material.reservedQty),
            hasInventory,
            hasTransactions,
            hasOrderReference,
            linkedVariantId: linkedVariant?.id ?? null,
            linkedProductSku: linkedVariant?.product?.sku ?? null,
            linkedVariantSku: linkedVariant?.sku ?? null,
            balanceRows: balances,
            transactionRows: transactions,
            auditRows: audits,
        })
    }
    return rows
}

function classify(row: Row) {
    if (row.hasInventory) return 'HAS INVENTORY — do not archive'
    if (row.hasTransactions) return 'HAS TRANSACTION HISTORY — do not archive'
    if (row.hasOrderReference)
        return 'REFERENCED BY ORDERS / WAREHOUSE — do not archive'
    if (row.linkedVariantId) return 'LINKED TO A VARIANT — review the link'
    return 'UNUSED — safe to archive'
}

async function archive(ids: string[]) {
    for (const id of ids) {
        const material = await prisma.mmMaterial.findUnique({
            where: { id },
            select: {
                id: true,
                materialCode: true,
                materialName: true,
                onHandQty: true,
                reservedQty: true,
            },
        })
        if (!material) {
            console.log(`  SKIP  ${id} — not found`)
            continue
        }
        const [balances, transactions, orders] = await Promise.all([
            prisma.mmInventoryBalance.count({ where: { materialId: id } }),
            prisma.mmInventoryTransaction.count({
                where: { materialId: id },
            }),
            prisma.sdSalesOrderLine.count({ where: { materialId: id } }),
        ])
        if (
            balances > 0 ||
            transactions > 0 ||
            orders > 0 ||
            num(material.onHandQty) !== 0 ||
            num(material.reservedQty) !== 0
        ) {
            console.log(
                `  SKIP  ${material.materialCode} — it has inventory, transactions or order references`,
            )
            continue
        }
        // Archive (never delete) and keep the audit history.
        await prisma.mmMaterial.update({
            where: { id },
            data: { status: 'ARCHIVED' },
        })
        console.log(`  ARCHIVED ${material.materialCode} (${material.materialName})`)
    }
}

async function main() {
    const args = process.argv.slice(2)
    const asJson = args.includes('--json')
    const archiveIndex = args.indexOf('--archive')
    const archiveIds =
        archiveIndex >= 0
            ? args.slice(archiveIndex + 1).filter((a) => !a.startsWith('--'))
            : []

    if (archiveIds.length) {
        console.log('Archiving confirmed-unused auto-created materials:')
        await archive(archiveIds)
        console.log('Done. The audit history of every material is preserved.')
        return
    }

    const rows = await collect()
    if (asJson) {
        console.log(JSON.stringify(rows, null, 2))
        return
    }

    console.log(
        `\nAuto-created materials (catalogSource = AUTO_CREATED): ${rows.length}\n`,
    )
    if (rows.length === 0) {
        console.log('Nothing to review.')
        return
    }
    for (const row of rows) {
        console.log(
            `${row.materialCode}  ${row.materialName}\n` +
                `    id=${row.materialId}  status=${row.status}  onHand=${row.onHandQty}  reserved=${row.reservedQty}\n` +
                `    balances=${row.balanceRows} transactions=${row.transactionRows} audits=${row.auditRows}\n` +
                `    variant=${row.linkedVariantSku ?? '—'} (product ${row.linkedProductSku ?? '—'})\n` +
                `    -> ${classify(row)}\n`,
        )
    }
    const groups = {
        inventory: rows.filter((r) => r.hasInventory).length,
        transactions: rows.filter((r) => !r.hasInventory && r.hasTransactions)
            .length,
        orderReferences: rows.filter(
            (r) =>
                !r.hasInventory &&
                !r.hasTransactions &&
                r.hasOrderReference,
        ).length,
        linked: rows.filter(
            (r) =>
                !r.hasInventory &&
                !r.hasTransactions &&
                !r.hasOrderReference &&
                r.linkedVariantId,
        ).length,
        unused: rows.filter(
            (r) =>
                !r.hasInventory &&
                !r.hasTransactions &&
                !r.hasOrderReference &&
                !r.linkedVariantId,
        ).length,
    }
    console.log('\nSummary')
    console.log(`  with inventory              : ${groups.inventory}`)
    console.log(`  with transaction history     : ${groups.transactions}`)
    console.log(`  referenced by orders         : ${groups.orderReferences}`)
    console.log(`  linked to a variant          : ${groups.linked}`)
    console.log(`  unused (archivable)          : ${groups.unused}`)
    console.log(
        '\nNothing is deleted by this script. Archive confirmed-unused rows with:\n' +
            '  npx ts-node --project prisma/tsconfig.seed.json prisma/report-auto-created-materials.ts --archive <materialId> [...]',
    )
}

main()
    .catch((err) => {
        console.error('Report failed:', err)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
