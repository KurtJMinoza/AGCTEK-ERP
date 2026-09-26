/**
 * Wipes all MM / WM data and rebuilds the AGCTEK demo walkthrough from scratch.
 *
 *   cd backend && npm run prisma:seed-mm-demo
 *
 * Does not delete users, SCM shipments, or FICO — only Materials Management domain tables.
 */
import { PrismaClient } from '@prisma/client'
import { purgeMaterialsManagementData } from './seed-mm-purge'
import { seedMmOrg } from './seed-mm-org'

async function main() {
    const prisma = new PrismaClient()
    try {
        await purgeMaterialsManagementData(prisma)
        await seedMmOrg(prisma)
        console.log('\n✅ MM demo dataset rebuilt. Open docs/MM_DEMO_WALKTHROUGH.md in the repo root.')
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
