/**
 * Default prisma db seed — MM org + SCM connected demo (no purge).
 * For wipe+rebuild: npm run prisma:seed-mm-scm-demo
 */
import { PrismaClient } from '@prisma/client'
import { seedMmOrg } from './seed-mm-org'
import { seedScmConnectedDemo } from './seed-scm-connected'

const prisma = new PrismaClient()

async function main() {
    await seedMmOrg(prisma)
    await seedScmConnectedDemo(prisma)
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
