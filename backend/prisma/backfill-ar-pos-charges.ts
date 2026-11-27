/**
 * Attach FICO AR open items for existing open POS receivables that already
 * have a posted pos-revenue journal (subledger only).
 *
 *   npx ts-node --transpile-only --project prisma/tsconfig.seed.json prisma/backfill-ar-pos-charges.ts
 */
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { FicoAccountsReceivableService } from '../src/fico/fico-accounts-receivable.service'

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    })
    try {
        const ar = app.get(FicoAccountsReceivableService)
        const companyId = process.argv[2] || undefined
        const result = await ar.backfillPosChargeOpenItems(companyId)
        console.log(JSON.stringify(result, null, 2))
    } finally {
        await app.close()
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
