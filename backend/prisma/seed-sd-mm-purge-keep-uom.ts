/**
 * Purges all SD + MM data; keeps mm_uoms and mm_uom_conversions only.
 *
 *   cd backend && npm run prisma:purge-sd-mm-keep-uom
 */
import { PrismaClient } from '@prisma/client'
import { purgeSalesDistributionData } from './seed-sd-purge'
import { purgeMaterialsManagementData } from './seed-mm-purge'

async function main() {
    const prisma = new PrismaClient()
    try {
        await purgeSalesDistributionData(prisma)
        await purgeMaterialsManagementData(prisma)
        console.log(
            '\n✅ SD cleared. MM cleared except UOM master. Re-create org/materials/products in the UI.',
        )
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
