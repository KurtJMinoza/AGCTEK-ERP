/**
 * Assign company default COGS G/L to AGCTEK if missing (safe upsert).
 *   node scripts/ensure-cogs-company-assignment.cjs
 */
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const companyId = 'cmuxpv53h0000os8k838k61xg'

async function main() {
    const settings = await p.ficoCompanyAccountingSettings.findFirst({
        where: { companyId, status: 'ACTIVE' },
        select: { defaultCostOfGoodsSoldAccountId: true },
    })
  if (!settings?.defaultCostOfGoodsSoldAccountId) {
        console.log('No default COGS account on company settings.')
        return
    }
    const glAccountId = settings.defaultCostOfGoodsSoldAccountId
    const account = await p.ficoGlAccount.findUnique({
        where: { id: glAccountId },
        select: { accountCode: true, accountName: true, allowAutomaticPosting: true },
    })
    console.log('cogsAccount', account)
    const existing = await p.ficoCompanyGlAccount.findFirst({
        where: { companyId, glAccountId },
    })
    if (existing) {
        console.log('Assignment already exists', existing.id)
        return
    }
    const row = await p.ficoCompanyGlAccount.create({
        data: {
            companyId,
            glAccountId,
            postingEnabled: true,
            manualPostingBlocked: false,
            createdBy: 'system-recovery',
            updatedBy: 'system-recovery',
        },
    })
    console.log('Created company assignment', row.id)
}

main().finally(() => p.$disconnect())