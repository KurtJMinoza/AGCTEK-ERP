import { PrismaClient } from '@prisma/client'
import { seedMmMaterialSamples } from './seed-mm-material-samples'

const prisma = new PrismaClient()

seedMmMaterialSamples(prisma)
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
