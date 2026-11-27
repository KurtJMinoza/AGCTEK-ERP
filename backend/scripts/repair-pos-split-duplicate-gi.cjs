/**
 * Reverse duplicate legacy GI journal (GI-2026-000004) for POS split test.
 * Keeps the stable-key journal (GI-2026-000005).
 *
 *   node scripts/repair-pos-split-duplicate-gi.cjs
 */
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/app.module')
const { PrismaClient } = require('@prisma/client')

const DUPLICATE_DOC = 'GI-2026-000004'

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    })
    const journal = app.get(
        require('../dist/fico/fico-journal.service').FicoJournalService,
    )
    const prisma = new PrismaClient()
    try {
        const dup = await prisma.ficoJournalEntry.findFirst({
            where: { documentNumber: DUPLICATE_DOC, status: 'POSTED' },
            select: { id: true, companyId: true, documentNumber: true },
        })
        if (!dup) {
            console.log(`No posted ${DUPLICATE_DOC} — skip`)
            return
        }
        const result = await journal.reverseEntry(
            dup.id,
            {
                companyId: dup.companyId,
                reason: 'Duplicate GoodsIssuePosted (legacy idempotency)',
                postingDate: new Date().toISOString(),
            },
            { id: 'REPAIR', name: 'Repair duplicate GI' },
            { operationalSourceReversal: true },
        )
        console.log(
            `Reversed ${dup.documentNumber} → ${result.reversalDocumentNumber}`,
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