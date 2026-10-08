import { PrismaClient } from '@prisma/client'
import { seedMmReferenceEssentials } from './seed-mm-reference-essentials'

const prisma = new PrismaClient()

seedMmReferenceEssentials(prisma)
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
