import { PrismaClient } from '@prisma/client'
import { seedMmSupplierMaterialLinks } from './seed-mm-supplier-material-links'

const prisma = new PrismaClient()

seedMmSupplierMaterialLinks(prisma)
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
