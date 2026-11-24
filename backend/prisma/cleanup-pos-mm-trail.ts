import { PrismaClient, type PrismaClient as PrismaClientType } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { purgeInventoryTransactions } from './delete-inventory-ledger'

/**
 * Remove orphaned POS / sales-order MM trail left after order deletion:
 * goods issues, reservation headers, and ISSUE inventory movements.
 * Keeps seed / threshold adjustment receipts. Rebuilds balances from remaining ledger.
 *
 *   npx ts-node --project prisma/tsconfig.seed.json prisma/cleanup-pos-mm-trail.ts --dry-run
 *   npx ts-node --project prisma/tsconfig.seed.json prisma/cleanup-pos-mm-trail.ts
 */
const log = (msg: string) => console.log(msg)

async function rebuildBalancesFromLedger(prisma: PrismaClientType) {
    const txns = await prisma.mmInventoryTransaction.findMany({
        select: {
            companyId: true,
            plantId: true,
            warehouseId: true,
            storageBinId: true,
            materialId: true,
            batchId: true,
            serialNumberId: true,
            stockStatus: true,
            signedQuantity: true,
        },
    })

    type Key = string
    const agg = new Map<
        Key,
        {
            companyId: string
            plantId: string | null
            warehouseId: string
            storageBinId: string | null
            materialId: string
            batchId: string | null
            serialNumberId: string | null
            stockStatus: string
            qty: Decimal
        }
    >()

    for (const t of txns) {
        const key = [
            t.companyId,
            t.warehouseId,
            t.storageBinId ?? '',
            t.materialId,
            t.batchId ?? '',
            t.serialNumberId ?? '',
            t.stockStatus,
        ].join('|')
        const existing = agg.get(key)
        const signed = new Decimal(t.signedQuantity)
        if (existing) {
            existing.qty = existing.qty.plus(signed)
        } else {
            agg.set(key, {
                companyId: t.companyId,
                plantId: t.plantId,
                warehouseId: t.warehouseId,
                storageBinId: t.storageBinId,
                materialId: t.materialId,
                batchId: t.batchId,
                serialNumberId: t.serialNumberId,
                stockStatus: t.stockStatus,
                qty: signed,
            })
        }
    }

    await prisma.mmInventoryBalance.deleteMany({})
    for (const row of agg.values()) {
        const qty = row.qty
        if (qty.isZero()) continue
        await prisma.mmInventoryBalance.create({
            data: {
                companyId: row.companyId,
                plantId: row.plantId,
                warehouseId: row.warehouseId,
                storageBinId: row.storageBinId,
                materialId: row.materialId,
                batchId: row.batchId,
                serialNumberId: row.serialNumberId,
                stockStatus: row.stockStatus,
                quantity: qty,
                reservedQuantity: new Decimal(0),
                availableQuantity: qty,
            },
        })
    }

    // Sync material master on-hand / reserved from balances
    const materials = await prisma.mmMaterial.findMany({
        where: { deletedAt: null, companyId: { not: null } },
        select: { id: true, companyId: true, materialCode: true },
    })
    for (const m of materials) {
        const balances = await prisma.mmInventoryBalance.findMany({
            where: { companyId: m.companyId!, materialId: m.id },
            select: { stockStatus: true, quantity: true, reservedQuantity: true },
        })
        let onHand = new Decimal(0)
        let reserved = new Decimal(0)
        for (const b of balances) {
            onHand = onHand.plus(b.quantity)
            if (b.stockStatus === 'UNRESTRICTED') {
                reserved = reserved.plus(b.reservedQuantity)
            }
        }
        await prisma.mmMaterial.update({
            where: { id: m.id },
            data: { onHandQty: onHand, reservedQty: reserved },
        })
        if (!onHand.isZero() || !reserved.isZero()) {
            log(`  material ${m.materialCode}: onHand=${onHand} reserved=${reserved}`)
        }
    }
}

export async function cleanupPosMmTrail(
    prisma: PrismaClientType,
    dryRun = false,
) {
    log(dryRun ? '=== DRY RUN ===' : '=== DELETE ===')

    const reservations = await prisma.mmInventoryReservationHeader.findMany({
        select: {
            id: true,
            reservationNumber: true,
            status: true,
            sourceDocumentType: true,
        },
        orderBy: { reservationNumber: 'asc' },
    })
    const goodsIssues = await prisma.mmGoodsIssue.findMany({
        select: {
            id: true,
            documentNumber: true,
            status: true,
            sourceDocumentType: true,
            reservationHeaderId: true,
        },
        orderBy: { documentNumber: 'asc' },
    })
    const issueTxnCount = await prisma.mmInventoryTransaction.count({
        where: {
            OR: [
                { sourceDocumentType: 'GOODS_ISSUE' },
                { movementType: 'ISSUE' },
            ],
        },
    })
    const allTxnCount = await prisma.mmInventoryTransaction.count()

    log(`  reservations: ${reservations.length}`)
    for (const r of reservations) {
        log(`    ${r.reservationNumber} ${r.status} ${r.sourceDocumentType}`)
    }
    log(`  goods issues: ${goodsIssues.length}`)
    for (const g of goodsIssues) {
        log(`    ${g.documentNumber} ${g.status} ${g.sourceDocumentType ?? '-'}`)
    }
    log(`  inventory txns: ${allTxnCount} (ISSUE/GOODS_ISSUE: ${issueTxnCount})`)

    if (dryRun) {
        log(
            `Dry run: would delete ${goodsIssues.length} GI(s), ` +
                `${reservations.length} reservation(s), ` +
                `${issueTxnCount} issue movement(s), then rebuild balances.`,
        )
        return
    }

    const giIds = goodsIssues.map((g) => g.id)
    const resIds = reservations.map((r) => r.id)

    // 1) Purge inventory movements for goods issues
    if (giIds.length) {
        const rootTxns = await prisma.mmInventoryTransaction.findMany({
            where: {
                OR: [
                    { sourceDocumentType: 'GOODS_ISSUE', sourceDocumentId: { in: giIds } },
                    { movementType: 'ISSUE' },
                ],
            },
            select: { id: true },
        })
        log(`  purging ${rootTxns.length} inventory txn(s)…`)
        await purgeInventoryTransactions(
            prisma,
            rootTxns.map((t) => t.id),
        )
    }

    // 2) Accounting events for GI — posted docs are immutable (DB trigger).
    //    Only drop non-consumed events; leave posted FICO trail intact.
    if (giIds.length) {
        const removed = await prisma.mmAccountingEvent.deleteMany({
            where: {
                documentType: 'GOODS_ISSUE',
                documentId: { in: giIds },
                status: { in: ['PENDING', 'FAILED'] },
            },
        })
        log(`  accounting events removed (non-posted): ${removed.count}`)
        await prisma.shipment.updateMany({
            where: { goodsIssueId: { in: giIds } },
            data: { goodsIssueId: null },
        })
        await prisma.sdShipment.updateMany({
            where: { goodsIssueId: { in: giIds } },
            data: { goodsIssueId: null },
        })
    }

    // 4) Delete GI lines + headers (null reservation FKs first)
    if (giIds.length) {
        await prisma.mmGoodsIssue.updateMany({
            where: { id: { in: giIds } },
            data: { reservationHeaderId: null, reservationId: null, packageId: null },
        })
        await prisma.mmGoodsIssueLine.deleteMany({ where: { issueId: { in: giIds } } })
        await prisma.mmGoodsIssue.deleteMany({ where: { id: { in: giIds } } })
        log(`  deleted ${giIds.length} goods issue(s)`)
    }

    // 5) Clear reservation dependents then headers
    if (resIds.length) {
        await prisma.wmPickingTask.updateMany({
            where: { reservationHeaderId: { in: resIds } },
            data: { reservationHeaderId: null, reservationLineId: null, allocationLineId: null },
        })
        await prisma.mmStockTransferOrder.updateMany({
            where: { reservationHeaderId: { in: resIds } },
            data: { reservationHeaderId: null },
        }).catch(() => undefined)

        const allocations = await prisma.mmInventoryAllocation.findMany({
            where: { headerId: { in: resIds } },
            select: { id: true },
        })
        const allocIds = allocations.map((a) => a.id)
        if (allocIds.length) {
            await prisma.wmPickingTask.updateMany({
                where: { allocationLineId: { not: null } },
                data: { allocationLineId: null },
            })
            await prisma.mmInventoryAllocationLine.deleteMany({
                where: { allocationId: { in: allocIds } },
            })
            await prisma.mmInventoryAllocation.deleteMany({
                where: { id: { in: allocIds } },
            })
        }

        await prisma.mmInventoryReservation.updateMany({
            where: { reservationHeaderId: { in: resIds } },
            data: { reservationHeaderId: null, reservationLineId: null },
        })
        await prisma.mmInventoryReservation.deleteMany({
            where: {
                OR: [
                    { reservationHeaderId: { in: resIds } },
                    { sourceDocumentType: 'SALES_ORDER' },
                ],
            },
        })

        await prisma.mmInventoryReservationLine.deleteMany({
            where: { headerId: { in: resIds } },
        })
        await prisma.mmInventoryReservationHeader.deleteMany({
            where: { id: { in: resIds } },
        })
        log(`  deleted ${resIds.length} reservation header(s)`)
    }

    // Any leftover legacy reservations / open reserved qty
    const leftoverLegacy = await prisma.mmInventoryReservation.count()
    if (leftoverLegacy) {
        await prisma.mmInventoryReservation.deleteMany({})
        log(`  deleted ${leftoverLegacy} legacy reservation(s)`)
    }

    log('  rebuilding balances from remaining ledger…')
    await rebuildBalancesFromLedger(prisma)

    const left = {
        reservations: await prisma.mmInventoryReservationHeader.count(),
        goodsIssues: await prisma.mmGoodsIssue.count(),
        issueTxns: await prisma.mmInventoryTransaction.count({
            where: {
                OR: [
                    { sourceDocumentType: 'GOODS_ISSUE' },
                    { movementType: 'ISSUE' },
                ],
            },
        }),
        allTxns: await prisma.mmInventoryTransaction.count(),
    }
    log(
        `Done. left: reservations=${left.reservations} GI=${left.goodsIssues} ` +
            `issueTxns=${left.issueTxns} allTxns=${left.allTxns}`,
    )
}

if (require.main === module) {
    const prisma = new PrismaClient()
    cleanupPosMmTrail(prisma, process.argv.includes('--dry-run'))
        .catch((err: unknown) => {
            console.error(err)
            process.exitCode = 1
        })
        .finally(() => prisma.$disconnect())
}
