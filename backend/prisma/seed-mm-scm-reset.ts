/**
 * Wipe MM + SCM demo data and rebuild a connected dataset:
 *   MM masters/transactions/walkthrough + SCM fleet/shipments/handoff/trip
 *
 *   cd backend && npm run prisma:seed-mm-scm-demo
 */
import { PrismaClient } from '@prisma/client'
import { purgeMaterialsManagementData } from './seed-mm-purge'
import { purgeSupplyChainData } from './seed-scm-purge'
import { seedMmOrg } from './seed-mm-org'
import { seedScmConnectedDemo } from './seed-scm-connected'

async function main() {
    const prisma = new PrismaClient()
    try {
        console.log('=== AGCTEK MM + SCM demo reset ===\n')
        // SCM first (shipments may FK to wm_packages)
        await purgeSupplyChainData(prisma)
        await purgeMaterialsManagementData(prisma)
        await seedMmOrg(prisma)
        await seedScmConnectedDemo(prisma)
        console.log('\n✅ MM + SCM connected demo rebuilt.')
        console.log('   Walk MM: docs/MM_DEMO_WALKTHROUGH.md')
        console.log('   Walk SCM: Pack READY packages → Shipments → Load plan / Trips')
        console.log('   Handoff: PKG-SCM-* packages ↔ package-linked READY shipments')
        console.log('   Driver: driver01 / 123Qwe')
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
