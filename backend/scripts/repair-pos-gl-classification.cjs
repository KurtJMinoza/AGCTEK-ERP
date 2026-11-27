/**
 * Reverse misclassified PS + GI journals for a completed POS sale and repost with current rules.
 * No additional stock movement — GI accounting only.
 *
 *   node scripts/repair-pos-gl-classification.cjs POS-000001
 */
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/app.module')
const { PrismaClient, Decimal } = require('@prisma/client')

const orderNumber = process.argv[2] ?? 'POS-000001'

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    })
    const prisma = new PrismaClient()
    const bridge = app.get(
        require('../dist/fico/fico-sd-accounting-bridge.service')
            .FicoSdAccountingBridgeService,
    )
    const processor = app.get(
        require('../dist/fico/fico-accounting-event-processor.service')
            .FicoAccountingEventProcessorService,
    )
    const journalService = app.get(
        require('../dist/fico/fico-journal.service').FicoJournalService,
    )

    try {
        const order = await prisma.sdSalesOrder.findFirst({
            where: { orderNumber, channel: 'POS' },
            include: { payments: true },
        })
        if (!order) {
            console.log('Order not found')
            return
        }

        const giJournal = await prisma.ficoJournalEntry.findFirst({
            where: {
                documentNumber: 'GI-2026-000010',
                status: 'POSTED',
            },
        })
        if (giJournal) {
            await journalService.reverseEntry(
                giJournal.id,
                {
                    companyId: order.companyId,
                    reason: 'Reclassify COGS/inventory accounts (category CAPS)',
                },
                { id: 'classification-repair', name: 'repair-pos-gl-classification' },
            )
            console.log('Reversed', giJournal.documentNumber)

            const gi =
                (giJournal.sourceDocumentId
                    ? await prisma.mmGoodsIssue.findUnique({
                          where: { id: giJournal.sourceDocumentId },
                      })
                    : null) ??
                (await prisma.mmGoodsIssue.findFirst({
                    where: {
                        sourceDocumentType: 'SALES_ORDER',
                        sourceDocumentId: order.id,
                    },
                    orderBy: { createdAt: 'desc' },
                }))
            if (gi) {
                const mmEvent = await prisma.mmAccountingEvent.findFirst({
                    where: {
                        documentId: gi.id,
                        eventType: 'GoodsIssuePosted',
                    },
                    orderBy: { createdAt: 'desc' },
                })
                if (mmEvent?.payload) {
                    const payload =
                        typeof mmEvent.payload === 'string'
                            ? JSON.parse(mmEvent.payload)
                            : mmEvent.payload
                    const repairKey = `GoodsIssuePosted:GOODS_ISSUE:${gi.id}:classification-repair-v1`
                    await prisma.mmAccountingEvent.create({
                        data: {
                            eventType: mmEvent.eventType,
                            sourceModule: mmEvent.sourceModule,
                            documentType: mmEvent.documentType,
                            documentId: gi.id,
                            companyId: order.companyId,
                            status: 'PENDING',
                            idempotencyKey: repairKey,
                            postingDate: mmEvent.postingDate ?? new Date(),
                            currencyCode: mmEvent.currencyCode ?? 'PHP',
                            totalValue: mmEvent.totalValue,
                            accountingEffects: mmEvent.accountingEffects ?? ['COGS_EXPENSE'],
                            payloadSchemaVersion: 'v2',
                            payload: {
                                ...payload,
                                idempotencyKey: repairKey,
                                financialFingerprint: `${repairKey}-fp`,
                            },
                        },
                    })
                    const created = await prisma.mmAccountingEvent.findFirst({
                        where: { idempotencyKey: repairKey },
                    })
                    if (created) {
                        await processor.retryEvent(created.id)
                        console.log('Reposted GI accounting event', repairKey)
                    }
                }
            }
        }

        await bridge.reversePosRevenueJournal(
            order.companyId,
            order.id,
            'Reclassify sales revenue (category CAPS)',
            `pos-void:${order.id}:classification-repair`,
        )

        await new Promise((r) => setTimeout(r, 800))
        let pending = await prisma.mmAccountingEvent.findMany({
            where: {
                eventType: 'PosSaleVoided',
                documentId: order.id,
                status: { in: ['PENDING', 'FAILED'] },
            },
        })
        for (const ev of pending) {
            await processor.retryEvent(ev.id)
        }

        const tenders = order.payments
            .filter((p) => !['Cancelled', 'Refunded'].includes(p.status))
            .map((p) => ({
                method: p.paymentMethod,
                amount: p.amount.toString(),
                status: p.status,
            }))

        const repairIdem = `pos-revenue:${order.id}:classification-repair-v1`
        await bridge.recordAndDispatch({
            eventType: 'PosSaleCompleted',
            documentType: 'SALES_ORDER',
            documentId: order.id,
            companyId: order.companyId,
            postingDate: new Date(),
            currencyCode: order.currency ?? 'PHP',
            idempotencyKey: repairIdem,
            totalValue: new Decimal(order.totalAmount.toString()),
            payload: {
                salesOrderId: order.id,
                orderNumber: order.orderNumber,
                branchId: order.branchId,
                customerId: order.customerId ?? undefined,
                totalAmount: order.totalAmount.toString(),
                taxAmount: (order.taxAmount ?? 0).toString(),
                outstandingBalance: '0',
                paymentStatus: order.paymentStatus ?? 'Paid',
                tenders,
            },
        })

        await new Promise((r) => setTimeout(r, 800))
        pending = await prisma.mmAccountingEvent.findMany({
            where: {
                idempotencyKey: repairIdem,
                status: { in: ['PENDING', 'FAILED'] },
            },
        })
        for (const ev of pending) {
            await processor.retryEvent(ev.id)
        }

        const after = await prisma.ficoJournalEntry.findMany({
            where: {
                companyId: order.companyId,
                status: 'POSTED',
                OR: [
                    { sourceDocumentId: order.id, documentType: 'SD_REVENUE' },
                    { documentType: 'MM_GI', sourceDocumentId: { not: null } },
                ],
            },
            include: {
                lines: {
                    include: {
                        glAccount: {
                            select: { accountCode: true, accountName: true },
                        },
                    },
                    orderBy: { lineNumber: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 4,
        })
        for (const j of after) {
            console.log(
                `${j.documentNumber} ${j.documentType}:`,
                j.lines
                    .map((l) => {
                        const amt =
                            Number(l.debitAmount || 0) ||
                            Number(l.creditAmount || 0)
                        const side =
                            Number(l.debitAmount || 0) > 0 ? 'DR' : 'CR'
                        return `${side} ${l.glAccount.accountCode} ${l.glAccount.accountName} ${amt}`
                    })
                    .join(' | '),
            )
        }
    } finally {
        await app.close()
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})