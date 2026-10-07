import { PrismaClient } from '@prisma/client'
import { seedMmOrgAndWarehouseStructure } from './seed-mm-org-warehouse-structure'

const prisma = new PrismaClient()

async function main() {
    await seedMmOrgAndWarehouseStructure(prisma)
    console.log('Org + warehouse structure seed complete.')
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
