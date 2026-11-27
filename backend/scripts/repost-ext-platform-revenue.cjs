/**
 * Post missing SD revenue for an already-approved EPT (no stock movement).
 *
 *   node scripts/repost-ext-platform-revenue.cjs EPT-000806
 */
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/app.module')
const { PrismaClient } = require('@prisma/client')

const txNumber = process.argv[2] ?? 'EPT-000806'
const backfillSuffix = process.argv[3] ?? 'backfill-v2'

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
    const tx = await prisma.sdExtPlatformTransaction.findFirst({
        where: { transactionNumber: txNumber },
        include: { salesSource: { select: { code: true } } },
    })
    if (!tx) throw new Error(`Transaction ${txNumber} not found`)
    if (tx.status !== 'APPROVED') {
        throw new Error(`Transaction ${txNumber} is ${tx.status}, not APPROVED`)
    }
    const key = `ext-platform-revenue:${tx.id}:${backfillSuffix}`
    await bridge.recordAndDispatch({
        eventType: 'ExtPlatformSaleApproved',
        documentType: 'EXT_PLATFORM_SALE',
        documentId: tx.id,
        companyId: tx.companyId,
        postingDate: tx.approvedAt ?? new Date(),
        currencyCode: tx.currency ?? 'PHP',
        idempotencyKey: key,
        totalValue: tx.grandTotal,
        payload: {
            transactionId: tx.id,
            transactionNumber: tx.transactionNumber,
            companyId: tx.companyId,
            branchId: tx.branchId,
            salesSourceCode: tx.salesSource.code,
            totalAmount: tx.grandTotal.toString(),
            taxAmount: tx.taxTotal.toString(),
        },
    })
    await new Promise((r) => setTimeout(r, 1200))
    let ev = await prisma.mmAccountingEvent.findFirst({
        where: { idempotencyKey: key },
    })
    if (ev?.status === 'PENDING' || ev?.status === 'FAILED') {
        await processor.retryEvent(ev.id)
        await new Promise((r) => setTimeout(r, 1500))
        ev = await prisma.mmAccountingEvent.findFirst({
            where: { idempotencyKey: key },
        })
        console.log('Event status:', ev?.status, ev?.lastError ?? '')
    }
    const ps = await prisma.ficoJournalEntry.findFirst({
        where: { idempotencyKey: key },
        include: {
            lines: { include: { glAccount: { select: { accountCode: true } } } },
        },
    })
    console.log(
        ps
            ? `${ps.documentNumber} ${ps.status} ` +
                  ps.lines
                      .map(
                          (l) =>
                              `${l.glAccount.accountCode} d${l.debitAmount} c${l.creditAmount}`,
                      )
                      .join(' | ')
            : 'No journal yet — check mm_accounting_events',
    )
    await app.close()
    await prisma.$disconnect()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})