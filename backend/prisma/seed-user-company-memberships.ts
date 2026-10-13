import { PrismaClient } from '@prisma/client'

/**
 * User ↔ Company memberships for warehouse task assignment.
 * Every ACTIVE user is joined to every ACTIVE company because the current
 * deployment has no explicit user-company mapping yet; `isDefault` marks the
 * first company for each user. Idempotent (unique userId+companyId).
 *
 * This was the missing piece behind "User X is not a member of the task
 * company": the gate requires a userCompany row, but none existed.
 */
const prisma = new PrismaClient()

async function main() {
    const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
    })
    const companies = await prisma.company.findMany({
        select: { id: true },
    })
    if (!companies.length) {
        console.log('No companies yet — nothing to seed.')
        return
    }
    let created = 0
    let skipped = 0
    for (const user of users) {
        for (const [index, company] of companies.entries()) {
            const existing = await prisma.userCompany.findUnique({
                where: {
                    userId_companyId: { userId: user.id, companyId: company.id },
                },
                select: { id: true },
            })
            if (existing) {
                skipped += 1
                continue
            }
            await prisma.userCompany.create({
                data: {
                    userId: user.id,
                    companyId: company.id,
                    isDefault: index === 0,
                },
            })
            created += 1
        }
    }
    console.log(
        `User-company memberships: created ${created}, already present ${skipped} (users=${users.length}, companies=${companies.length}).`,
    )
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })