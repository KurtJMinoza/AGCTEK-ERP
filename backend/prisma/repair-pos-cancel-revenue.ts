/**
 * Repair POS void: reverse any still-posted SD_REVENUE journals for cancelled POS sales.
 * Idempotent — does not touch inventory / GI reversals.
 *
 *   npx ts-node -r tsconfig-paths/register prisma/repair-pos-cancel-revenue.ts [POS-000001]
 */
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'
import { FicoSdAccountingBridgeService } from '../src/fico/fico-sd-accounting-bridge.service'
import { FicoAccountingEventProcessorService } from '../src/fico/fico-accounting-event-processor.service'

const orderNumber = process.argv[2] ?? 'POS-000001'

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    })
    const prisma = app.get(PrismaService)
    const bridge = app.get(FicoSdAccountingBridgeService)
    const processor = app.get(FicoAccountingEventProcessorService)

    try {
        const order = await prisma.sdSalesOrder.findFirst({
            where: { orderNumber, channel: 'POS' },
            select: {
                id: true,
                orderNumber: true,
                companyId: true,
                status: true,
                voidedAt: true,
                voidReason: true,
            },
        })
        if (!order) {
            console.log(`Order ${orderNumber} not found`)
            return
        }
        if (!order.voidedAt) {
            console.log(`${orderNumber} is not voided — aborting`)
            return
        }
        if (!order.companyId) {
            console.log(`${orderNumber} has no company — aborting`)
            return
        }
        const companyId = order.companyId

        const posted = await prisma.ficoJournalEntry.findMany({
            where: {
                companyId,
                status: 'POSTED',
                OR: [
                    {
                        idempotencyKey: {
                            startsWith: `pos-revenue:${order.id}`,
                        },
                    },
                    {
                        sourceDocumentId: order.id,
                        documentType: 'SD_REVENUE',
                    },
                ],
            },
            select: { documentNumber: true, id: true },
        })
        if (!posted.length) {
            console.log('No posted revenue journals — nothing to repair')
            return
        }

        console.log(
            `Repairing revenue reversal for ${order.orderNumber}: ${posted.map((j) => j.documentNumber).join(', ')}`,
        )

        await bridge.reversePosRevenueJournal(
            companyId,
            order.id,
            order.voidReason?.trim() || 'POS sale void (revenue repair)',
            `void:${order.id}`,
        )

        await new Promise((r) => setTimeout(r, 800))

        const voidEvents = await prisma.mmAccountingEvent.findMany({
            where: {
                eventType: 'PosSaleVoided',
                documentId: order.id,
                idempotencyKey: { startsWith: `void:${order.id}:je:` },
            },
            select: { id: true, idempotencyKey: true, status: true },
            orderBy: { createdAt: 'asc' },
        })
        for (const ev of voidEvents) {
            if (ev.status === 'CONSUMED' || ev.status === 'SKIPPED') continue
            try {
                const status = await processor.retryEvent(ev.id)
                console.log(`Processed ${ev.idempotencyKey} → ${status}`)
            } catch (err) {
                console.error(
                    `Failed ${ev.idempotencyKey}: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                )
            }
        }

        const after = await prisma.ficoJournalEntry.findMany({
            where: {
                companyId,
                OR: [
                    { sourceDocumentId: order.id },
                    {
                        idempotencyKey: {
                            startsWith: `pos-revenue:${order.id}`,
                        },
                    },
                ],
            },
            select: {
                documentNumber: true,
                status: true,
                documentType: true,
                reversalOfId: true,
            },
            orderBy: { createdAt: 'asc' },
        })
        console.log('Journal state after repair:')
        for (const j of after) {
            console.log(
                `  ${j.documentNumber} ${j.documentType} ${j.status}${j.reversalOfId ? ` (reverses ${j.reversalOfId})` : ''}`,
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