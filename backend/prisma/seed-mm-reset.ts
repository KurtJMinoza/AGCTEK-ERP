/**
 * Purges Materials Management transactional + master data (destructive).
 * Does not re-seed demo MM data — create masters via the UI.
 *
 *   cd backend && npm run prisma:seed-mm-purge
 */
import { PrismaClient } from '@prisma/client'
import { purgeMaterialsManagementData } from './seed-mm-purge'

async function main() {
    const prisma = new PrismaClient()
    try {
        await purgeMaterialsManagementData(prisma)
        console.log('\n✅ MM data purged (UOM master kept). Use Material Master in the UI to rebuild.')
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
