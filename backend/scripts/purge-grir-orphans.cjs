/**
 * Dev-only: remove GR/IR open items (e.g. after journal hard-delete).
 *   node scripts/purge-grir-orphans.cjs
 *   node scripts/purge-grir-orphans.cjs --dry-run
 */
const { PrismaClient } = require('@prisma/client')
const dryRun = process.argv.includes('--dry-run')

async function main() {
    const prisma = new PrismaClient()
    try {
        const rows = await prisma.ficoGrIrOpenItem.findMany({
            select: { id: true, outstandingAmount: true, status: true },
        })
        console.log('GR/IR to delete:', rows)
        if (dryRun || !rows.length) return
        const result = await prisma.ficoGrIrOpenItem.deleteMany()
        console.log('Deleted', result.count)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})