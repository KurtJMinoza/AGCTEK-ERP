import { PrismaClient } from '@prisma/client'
import { seedMmPurchaseRequisitionSample } from './seed-mm-purchase-requisition-sample'

const prisma = new PrismaClient()

seedMmPurchaseRequisitionSample(prisma)
    .then(() => console.log('Purchase requisition seed complete.'))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
