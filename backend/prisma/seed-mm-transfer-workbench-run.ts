import { PrismaClient } from '@prisma/client'
import { seedMmTransferWorkbench } from './seed-mm-transfer-workbench'

const prisma = new PrismaClient()

seedMmTransferWorkbench(prisma)
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
