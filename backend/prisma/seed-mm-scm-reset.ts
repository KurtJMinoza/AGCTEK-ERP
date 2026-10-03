/**
 * Wipe MM + SCM demo data and rebuild SCM fleet/logistics only (no MM / SD re-seed).
 *
 *   cd backend && npm run prisma:seed-scm-demo
 */
import { PrismaClient } from '@prisma/client'
import { purgeMaterialsManagementData } from './seed-mm-purge'
import { purgeSupplyChainData } from './seed-scm-purge'
import { seedScmConnectedDemo } from './seed-scm-connected'

async function main() {
    const prisma = new PrismaClient()
    try {
        console.log('=== AGCTEK SCM demo reset (MM + SD seeds disabled) ===\n')
        await purgeSupplyChainData(prisma)
        await purgeMaterialsManagementData(prisma)
        await seedScmConnectedDemo(prisma)
        console.log('\n✅ SCM demo rebuilt (no MM org / SD product seeds).')
        console.log('   Create MM masters and SD products in the ERP UI.')
        console.log('   Driver demo user (if created): driver01 / 123Qwe')
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
