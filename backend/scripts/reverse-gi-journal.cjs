const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/app.module')
const { PrismaClient } = require('@prisma/client')

const doc = process.argv[2] ?? 'GI-2026-000011'
const p = new PrismaClient()

;(async () => {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error'],
    })
    const journalService = app.get(
        require('../dist/fico/fico-journal.service').FicoJournalService,
    )
    const j = await p.ficoJournalEntry.findFirst({
        where: { documentNumber: doc, status: 'POSTED' },
    })
    if (!j) {
        console.log('No posted journal', doc)
        return
    }
    await journalService.reverseEntry(
        j.id,
        { companyId: j.companyId, reason: 'Reclassify accounts' },
        { id: 'repair', name: 'reverse-gi-journal' },
    )
    console.log('Reversed', doc)
    await app.close()
    await p.$disconnect()
})().catch((e) => {
    console.error(e)
    process.exit(1)
})