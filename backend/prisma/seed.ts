/**
 * Default prisma db seed — SCM connected demo only (MM handoff packages skip if no MM masters).
 *
 * SD and Materials Management demo seeds are disabled; create org, materials, and products via the UI.
 * SCM-only rebuild (destructive MM purge): npm run prisma:seed-scm-demo
 */
import { PrismaClient } from '@prisma/client'
import { seedScmConnectedDemo } from './seed-scm-connected'
import { seedFicoDocumentTypes } from './seed-fico-document-types'
import { seedFicoMmAccountMappings } from './seed-fico-mm-account-mappings'

const prisma = new PrismaClient()

async function main() {
    await seedFicoDocumentTypes(prisma)
    await seedFicoMmAccountMappings(prisma)
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
