/**
 *   node scripts/retry-accounting-event.cjs <eventId>
 */
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/app.module')
const { PrismaService } = require('../dist/prisma/prisma.service')
const { FicoAccountingEventProcessorService } = require(
    '../dist/fico/fico-accounting-event-processor.service',
)

async function main() {
    const eventId = process.argv[2]
    if (!eventId) {
        console.error('Usage: node scripts/retry-accounting-event.cjs <eventId>')
        process.exit(1)
    }
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    })
    try {
        const prisma = app.get(PrismaService)
        const processor = app.get(FicoAccountingEventProcessorService)
        const event = await prisma.mmAccountingEvent.findUnique({ where: { id: eventId } })
        if (!event) {
            console.log('Event not found')
            return
        }
        console.log('Before:', {
            eventType: event.eventType,
            status: event.status,
            lastError: event.lastError,
        })
        await processor.retryEvent(eventId)
        const after = await prisma.mmAccountingEvent.findUnique({
            where: { id: eventId },
            select: { status: true, lastError: true, journalEntryId: true },
        })
        console.log('After:', after)
        if (after?.journalEntryId) {
            const j = await prisma.ficoJournalEntry.findUnique({
                where: { id: after.journalEntryId },
                select: { documentNumber: true, status: true, reversalOfId: true },
            })
            console.log('Journal:', j)
        }
        const revenueKey = event.idempotencyKey?.startsWith('void:')
            ? `pos-revenue:${event.documentId}`
            : null
        if (revenueKey) {
            const orig = await prisma.ficoJournalEntry.findUnique({
                where: { idempotencyKey: revenueKey },
                select: { documentNumber: true, status: true },
            })
            console.log('Original revenue journal:', orig)
        }
    } finally {
        await app.close()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})