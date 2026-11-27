/**
 * Hard-delete SO-000001, SO-000002, POS-000001 and their MM inventory trail.
 *
 * - Ecommerce: cancel/release reservations (restores reserved qty)
 * - POS: reverse posted GI via InventoryPostingService, then drop reservation trail
 * - Hard-delete SD order graph (orders only; customers kept)
 *
 *   npx ts-node --transpile-only --project prisma/tsconfig.seed.json prisma/cleanup-kurt-orders-nov27.ts
 */
import { NestFactory } from '@nestjs/core'
import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { AppModule } from '../src/app.module'
import { GoodsIssueService } from '../src/mm/stock-ops/goods-issue.service'
import { ReservationEngineService } from '../src/mm/inventory/reservation-allocation/reservation-engine.service'
import { InventoryPostingService } from '../src/mm/inventory/inventory-posting.service'
import { purgeInventoryTransactions } from './delete-inventory-ledger'

const ORDER_NUMBERS = ['SO-000001', 'SO-000002', 'POS-000001'] as const

const log = (msg: string) => console.log(msg)

async function deleteMmTrailForHeaders(
    prisma: PrismaClient,
    headerIds: string[],
    giIds: string[],
) {
    if (!headerIds.length && !giIds.length) return

    if (giIds.length) {
        await prisma.shipment
            .updateMany({
                where: { goodsIssueId: { in: giIds } },
                data: { goodsIssueId: null },
            })
            .catch(() => undefined)
        await prisma.sdShipment
            .updateMany({
                where: { goodsIssueId: { in: giIds } },
                data: { goodsIssueId: null },
            })
            .catch(() => undefined)

        await prisma.mmAccountingEvent.deleteMany({
            where: {
                documentType: 'GOODS_ISSUE',
                documentId: { in: giIds },
                status: { in: ['PENDING', 'FAILED'] },
            },
        })

        await prisma.mmGoodsIssue.updateMany({
            where: { id: { in: giIds } },
            data: {
                reservationHeaderId: null,
                reservationId: null,
                packageId: null,
            },
        })
        await prisma.mmGoodsIssueLine.deleteMany({
            where: { issueId: { in: giIds } },
        })
        await prisma.mmGoodsIssue.deleteMany({ where: { id: { in: giIds } } })
        log(`  deleted ${giIds.length} goods issue(s)`)
    }

    if (!headerIds.length) return

    const picks = await prisma.wmPickingTask.findMany({
        where: { reservationHeaderId: { in: headerIds } },
        select: { id: true, warehouseTaskId: true },
    })
    const pickIds = picks.map((p) => p.id)
    const wtIds = picks
        .map((p) => p.warehouseTaskId)
        .filter((id): id is string => Boolean(id))

    if (pickIds.length) {
        await prisma.wmPickingTask.deleteMany({ where: { id: { in: pickIds } } })
        log(`  deleted ${pickIds.length} picking task(s)`)
    }
    if (wtIds.length) {
        await prisma.wmWarehouseTask.deleteMany({ where: { id: { in: wtIds } } })
        log(`  deleted ${wtIds.length} warehouse task(s)`)
    }

    const allocations = await prisma.mmInventoryAllocation.findMany({
        where: { headerId: { in: headerIds } },
        select: { id: true },
    })
    const allocIds = allocations.map((a) => a.id)
    if (allocIds.length) {
        await prisma.mmInventoryAllocationLine.deleteMany({
            where: { allocationId: { in: allocIds } },
        })
        await prisma.mmInventoryAllocation.deleteMany({
            where: { id: { in: allocIds } },
        })
        log(`  deleted ${allocIds.length} allocation(s)`)
    }

    await prisma.mmInventoryReservation.updateMany({
        where: { reservationHeaderId: { in: headerIds } },
        data: { reservationHeaderId: null, reservationLineId: null },
    })
    await prisma.mmInventoryReservation.deleteMany({
        where: { reservationHeaderId: { in: headerIds } },
    })
    await prisma.mmInventoryReservationLine.deleteMany({
        where: { headerId: { in: headerIds } },
    })
    await prisma.mmInventoryReservationHeader.deleteMany({
        where: { id: { in: headerIds } },
    })
    log(`  deleted ${headerIds.length} reservation header(s)`)
}

async function deleteOrders(prisma: PrismaClient, orderIds: string[]) {
    const returnRequests = await prisma.sdReturnRequest.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: { id: true },
    })
    const returnRequestIds = returnRequests.map((r) => r.id)
    const salesReturns = await prisma.sdSalesReturn.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: { id: true },
    })
    const salesReturnIds = salesReturns.map((r) => r.id)
    const invoices = await prisma.sdSalesInvoice.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: { id: true },
    })
    const invoiceIds = invoices.map((i) => i.id)
    const refunds = returnRequestIds.length
        ? await prisma.sdRefund.findMany({
              where: { returnRequestId: { in: returnRequestIds } },
              select: { id: true },
          })
        : []
    const refundIds = refunds.map((r) => r.id)
    const mmReturns = salesReturnIds.length
        ? await prisma.mmCustomerReturn.findMany({
              where: { sdSalesReturnId: { in: salesReturnIds } },
              select: { id: true },
          })
        : []
    const mmReturnIds = mmReturns.map((r) => r.id)

    await prisma.$transaction(async (tx) => {
        if (refundIds.length) {
            await tx.sdCreditMemo.deleteMany({
                where: { refundId: { in: refundIds } },
            })
            await tx.sdRefund.deleteMany({ where: { id: { in: refundIds } } })
        }
        if (returnRequestIds.length) {
            await tx.crmTicket.updateMany({
                where: { sdReturnRequestId: { in: returnRequestIds } },
                data: { sdReturnRequestId: null },
            })
            await tx.sdReturnRequestLine.deleteMany({
                where: { returnRequestId: { in: returnRequestIds } },
            })
            await tx.sdReturnRequest.deleteMany({
                where: { id: { in: returnRequestIds } },
            })
        }
        if (mmReturnIds.length) {
            await tx.mmCustomerReturnAudit.deleteMany({
                where: { returnId: { in: mmReturnIds } },
            })
            await tx.mmCustomerReturnLine.deleteMany({
                where: { returnId: { in: mmReturnIds } },
            })
            await tx.mmCustomerReturn.deleteMany({
                where: { id: { in: mmReturnIds } },
            })
        }
        if (salesReturnIds.length) {
            await tx.sdSalesReturnAudit.deleteMany({
                where: { salesReturnId: { in: salesReturnIds } },
            })
            await tx.sdSalesReturnLine.deleteMany({
                where: { salesReturnId: { in: salesReturnIds } },
            })
            await tx.sdSalesReturn.deleteMany({
                where: { id: { in: salesReturnIds } },
            })
        }
        if (invoiceIds.length) {
            await tx.sdSalesInvoiceLine.deleteMany({
                where: { invoiceId: { in: invoiceIds } },
            })
            await tx.sdSalesInvoice.deleteMany({
                where: { id: { in: invoiceIds } },
            })
        }

        await tx.sdShipment.deleteMany({
            where: { salesOrderId: { in: orderIds } },
        })
        await tx.wmPackageItem.deleteMany({
            where: { package: { salesOrderId: { in: orderIds } } },
        })
        await tx.wmPackageScanLog.deleteMany({
            where: { salesOrderId: { in: orderIds } },
        })
        await tx.wmPackage.deleteMany({
            where: { salesOrderId: { in: orderIds } },
        })
        await tx.wmPackingSession.deleteMany({
            where: { salesOrderId: { in: orderIds } },
        })
        await tx.wmPickingTask.updateMany({
            where: { salesOrderId: { in: orderIds } },
            data: { salesOrderId: null, salesOrderLineId: null },
        })
        await tx.productReview.deleteMany({
            where: { salesOrderId: { in: orderIds } },
        })
        await tx.sdSalesOrder.deleteMany({ where: { id: { in: orderIds } } })
    })
}

async function main() {
    const prisma = new PrismaClient()
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    })

    try {
        const goodsIssues = app.get(GoodsIssueService)
        const reservations = app.get(ReservationEngineService)
        const posting = app.get(InventoryPostingService)

        const orders = await prisma.sdSalesOrder.findMany({
            where: { orderNumber: { in: [...ORDER_NUMBERS] } },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                channel: true,
            },
            orderBy: { orderNumber: 'asc' },
        })
        if (!orders.length) {
            log('No target orders found.')
            return
        }
        for (const o of orders) {
            log(`  order ${o.orderNumber} ${o.status} ${o.channel}`)
        }
        const orderIds = orders.map((o) => o.id)

        const headers = await prisma.mmInventoryReservationHeader.findMany({
            where: { sourceDocumentId: { in: orderIds } },
            select: {
                id: true,
                reservationNumber: true,
                status: true,
                sourceDocumentId: true,
            },
        })
        const headerIds = headers.map((h) => h.id)
        for (const h of headers) {
            log(`  reservation ${h.reservationNumber} ${h.status}`)
        }

        const gis = await prisma.mmGoodsIssue.findMany({
            where: {
                OR: [
                    { sourceDocumentId: { in: orderIds } },
                    { reservationHeaderId: { in: headerIds } },
                ],
            },
            select: {
                id: true,
                documentNumber: true,
                status: true,
                reservationHeaderId: true,
            },
        })
        for (const g of gis) {
            log(`  GI ${g.documentNumber} ${g.status}`)
        }

        // 1) Reverse posted GIs (POS) — restores physical stock via posting engine
        for (const g of gis) {
            if (g.status !== 'POSTED') continue
            try {
                await goodsIssues.reverse(g.id, 'cleanup-kurt-orders-nov27')
                log(`  reversed ${g.documentNumber}`)
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                log(`  GI reverse via service failed (${msg}); posting reverse fallback`)
                const txns = await prisma.mmInventoryTransaction.findMany({
                    where: {
                        sourceDocumentId: g.id,
                        sourceDocumentType: 'GOODS_ISSUE',
                        reversalOfId: null,
                    },
                    select: { id: true, signedQuantity: true },
                })
                for (const txn of txns) {
                    if (new Decimal(txn.signedQuantity).gte(0)) continue
                    await posting.reverseTransaction(txn.id, {
                        reasonCode: 'REVERSAL',
                        remarks: `Hard-delete cleanup of ${g.documentNumber}`,
                        createdBy: 'cleanup-kurt-orders-nov27',
                    })
                    log(`  reversed txn ${txn.id}`)
                }
                await prisma.mmGoodsIssue.update({
                    where: { id: g.id },
                    data: { status: 'REVERSED' },
                })
            }
        }

        // 2) Cancel open ecommerce reservations (releases reserved qty)
        for (const h of headers) {
            if (['CANCELLED', 'RELEASED', 'EXPIRED'].includes(h.status)) {
                log(`  skip cancel ${h.reservationNumber} (${h.status})`)
                continue
            }
            if (h.status === 'ISSUED') {
                // After GI reverse, header may still be ISSUED — force releasable then cancel
                await prisma.mmInventoryReservationHeader.update({
                    where: { id: h.id },
                    data: { status: 'FULLY_PICKED' },
                })
                await prisma.mmInventoryReservationLine.updateMany({
                    where: { headerId: h.id, status: 'ISSUED' },
                    data: { status: 'ALLOCATED', issuedQuantity: 0 },
                })
            }
            try {
                await reservations.cancel(h.id)
                log(`  cancelled ${h.reservationNumber}`)
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                log(`  cancel failed for ${h.reservationNumber}: ${msg}`)
                // Last resort: release remaining reserved qty directly
                const lines = await prisma.mmInventoryReservationLine.findMany({
                    where: { headerId: h.id },
                })
                const header = await prisma.mmInventoryReservationHeader.findUnique({
                    where: { id: h.id },
                })
                if (header) {
                    for (const line of lines) {
                        const releasable = Decimal.max(
                            new Decimal(0),
                            new Decimal(line.reservedQuantity).minus(
                                line.issuedQuantity,
                            ),
                        )
                        if (releasable.lte(0)) continue
                        const bal = await prisma.mmInventoryBalance.findFirst({
                            where: {
                                companyId: header.companyId,
                                warehouseId: header.warehouseId,
                                materialId: line.materialId,
                                stockStatus: line.stockStatus,
                            },
                        })
                        if (bal) {
                            const newReserved = Decimal.max(
                                new Decimal(0),
                                new Decimal(bal.reservedQuantity).minus(
                                    releasable,
                                ),
                            )
                            await prisma.mmInventoryBalance.update({
                                where: { id: bal.id },
                                data: {
                                    reservedQuantity: newReserved,
                                    availableQuantity: new Decimal(
                                        bal.quantity,
                                    ).minus(newReserved),
                                },
                            })
                        }
                        await prisma.mmMaterial.update({
                            where: { id: line.materialId },
                            data: {
                                reservedQty: {
                                    decrement: releasable,
                                },
                            },
                        })
                    }
                    await prisma.mmInventoryReservationHeader.update({
                        where: { id: h.id },
                        data: { status: 'CANCELLED' },
                    })
                    log(`  force-released reserved qty for ${h.reservationNumber}`)
                }
            }
        }

        // 3) Optionally purge GI ledger rows + reversals for a clean trail
        const giIds = gis.map((g) => g.id)
        if (giIds.length) {
            const rootTxns = await prisma.mmInventoryTransaction.findMany({
                where: {
                    sourceDocumentType: 'GOODS_ISSUE',
                    sourceDocumentId: { in: giIds },
                },
                select: { id: true },
            })
            if (rootTxns.length) {
                await purgeInventoryTransactions(
                    prisma,
                    rootTxns.map((t) => t.id),
                )
                log(`  purged ${rootTxns.length} GI ledger root txn(s) (+ reversals)`)
            }
        }

        // 4) Delete MM trail docs
        await deleteMmTrailForHeaders(prisma, headerIds, giIds)

        // 5) Hard-delete SD orders
        await deleteOrders(prisma, orderIds)
        log(`  deleted ${orderIds.length} sales order(s)`)

        // Validate
        const leftOrders = await prisma.sdSalesOrder.findMany({
            where: { orderNumber: { in: [...ORDER_NUMBERS] } },
            select: { orderNumber: true },
        })
        const leftHeaders = await prisma.mmInventoryReservationHeader.count({
            where: { id: { in: headerIds } },
        })
        const leftGis = await prisma.mmGoodsIssue.count({
            where: { id: { in: giIds } },
        })
        const leftPicks = await prisma.wmPickingTask.count({
            where: { salesOrderId: { in: orderIds } },
        })
        log(
            `Done. leftOrders=${leftOrders.map((o) => o.orderNumber).join(',') || 'none'} ` +
                `headers=${leftHeaders} gis=${leftGis} picks=${leftPicks}`,
        )
    } finally {
        await app.close()
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
