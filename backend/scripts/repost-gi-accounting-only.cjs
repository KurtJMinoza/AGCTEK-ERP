const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/app.module')
const { PrismaClient } = require('@prisma/client')

const giId = process.argv[2]
const p = new PrismaClient()

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    })
    const processor = app.get(
        require('../dist/fico/fico-accounting-event-processor.service')
            .FicoAccountingEventProcessorService,
    )
    const gi =
        giId ??
        (
            await p.mmGoodsIssue.findFirst({
                where: { documentNumber: 'GI-20261127-00003' },
            })
        )?.id
    if (!gi) throw new Error('GI not found')

    const src = await p.mmAccountingEvent.findFirst({
        where: { documentId: gi, eventType: 'GoodsIssuePosted' },
        orderBy: { createdAt: 'asc' },
    })
    if (!src) throw new Error('Source event missing')
    const suffix = process.argv[3] ?? 'reclass-v4'
    const repairKey = `${src.idempotencyKey}:${suffix}`
    const exists = await p.mmAccountingEvent.findUnique({
        where: { idempotencyKey: repairKey },
    })
    if (!exists) {
        const payload =
            typeof src.payload === 'object' ? { ...src.payload } : JSON.parse(src.payload)
        await p.mmAccountingEvent.create({
            data: {
                eventType: src.eventType,
                sourceModule: src.sourceModule,
                documentType: src.documentType,
                documentId: gi,
                companyId: src.companyId,
                status: 'PENDING',
                idempotencyKey: repairKey,
                postingDate: src.postingDate,
                currencyCode: src.currencyCode,
                totalValue: src.totalValue,
                accountingEffects: src.accountingEffects,
                payloadSchemaVersion: 'v2',
                payload: {
                    ...payload,
                    idempotencyKey: repairKey,
                    financialFingerprint: `${repairKey}-fp`,
                },
            },
        })
    }
    const ev = await p.mmAccountingEvent.findUnique({
        where: { idempotencyKey: repairKey },
    })
    await processor.retryEvent(ev.id)
    console.log('Processed', repairKey)
    await app.close()
    await p.$disconnect()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})