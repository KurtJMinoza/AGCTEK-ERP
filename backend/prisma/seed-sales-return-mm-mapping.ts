/**
 * Upsert ACTIVE SALES_RETURN MM account mappings (Dr Inventory / Cr COGS)
 * for each company with an active determination profile + GI_COGS mapping.
 *
 * Uses the GI_COGS pair reversed (inventory ← debit, COGS ← credit).
 *
 *   npx ts-node --transpile-only --project prisma/tsconfig.seed.json prisma/seed-sales-return-mm-mapping.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ACTOR = 'seed-sales-return-mm-mapping'

async function ensureKey() {
    const data = {
        name: 'Customer Sales Return Restock',
        description:
            'Customer return RESTOCK: Dr Inventory / Cr COGS at valuation cost.',
        owningModule: 'MM',
        accountingCategory: 'COGS',
        supportedSourceModules: ['MM', 'SD'],
        requiresValuationClass: true,
        inventorySide: 'DEBIT_INVENTORY',
        automaticPostingEligible: true,
        systemDefined: true,
        integrationStatus: 'LIVE',
        sortOrder: 71,
        status: 'ACTIVE',
    }
    await prisma.ficoTransactionKey.upsert({
        where: { code: 'SALES_RETURN' },
        create: { code: 'SALES_RETURN', ...data },
        update: data,
    })
}

async function main() {
    await ensureKey()
    const giMaps = await prisma.ficoMmAccountMapping.findMany({
        where: { transactionKeyCode: 'GI_COGS', status: 'ACTIVE' },
        select: {
            companyId: true,
            profileId: true,
            valuationScopeKey: true,
            valuationClassId: true,
            debitAccountId: true,
            creditAccountId: true,
            effectiveFrom: true,
        },
    })

    let upserted = 0
    for (const gi of giMaps) {
        const existing = await prisma.ficoMmAccountMapping.findFirst({
            where: {
                companyId: gi.companyId,
                profileId: gi.profileId,
                transactionKeyCode: 'SALES_RETURN',
                valuationScopeKey: gi.valuationScopeKey,
            },
            select: { id: true },
        })
        if (existing) {
            await prisma.ficoMmAccountMapping.update({
                where: { id: existing.id },
                data: {
                    // Mirror GI_COGS: inventory debit, COGS credit
                    debitAccountId: gi.creditAccountId,
                    creditAccountId: gi.debitAccountId,
                    valuationClassId: gi.valuationClassId,
                    status: 'ACTIVE',
                    updatedBy: ACTOR,
                },
            })
        } else {
            await prisma.ficoMmAccountMapping.create({
                data: {
                    companyId: gi.companyId,
                    profileId: gi.profileId,
                    transactionKeyCode: 'SALES_RETURN',
                    valuationScopeKey: gi.valuationScopeKey,
                    valuationClassId: gi.valuationClassId,
                    debitAccountId: gi.creditAccountId,
                    creditAccountId: gi.debitAccountId,
                    status: 'ACTIVE',
                    effectiveFrom: gi.effectiveFrom ?? new Date('2000-01-01'),
                    createdBy: ACTOR,
                    updatedBy: ACTOR,
                },
            })
        }
        upserted += 1
    }

    console.log(
        JSON.stringify(
            {
                giCogsMappings: giMaps.length,
                salesReturnUpserted: upserted,
            },
            null,
            2,
        ),
    )
}

main()
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
