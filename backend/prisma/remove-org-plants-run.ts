import { PrismaClient } from '@prisma/client'
import { removeOrgPlants } from './remove-org-plants'

const prisma = new PrismaClient()

removeOrgPlants(prisma)
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
