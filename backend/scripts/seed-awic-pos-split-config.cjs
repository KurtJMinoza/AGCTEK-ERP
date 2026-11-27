/**
 * AWIC: card clearing treasury + perfume SALES_REVENUE rule + CARD payment GL.
 *
 *   node scripts/seed-awic-pos-split-config.cjs
 */
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const ACTOR = 'seed-awic-pos-split-config'

const CARD_GL = '1107'
const CARD_GL_NAME = 'CARD SETTLEMENT CLEARING'
const PERFUME_REVENUE = '4008'
const PRODUCT_SKU = 'RET-PRD-000040'

async function main() {
    const company = await p.company.findFirst({
        where: { name: { contains: 'Amalgated World' } },
        select: { id: true, name: true },
    })
    if (!company) throw new Error('AWIC company not found')

    const settings = await p.ficoCompanyAccountingSettings.findFirst({
        where: { companyId: company.id, status: 'ACTIVE' },
        select: { chartOfAccountsId: true },
    })
    if (!settings?.chartOfAccountsId) throw new Error('AWIC accounting not active')

    const parentGroup = await p.ficoGlAccount.findFirst({
        where: {
            chartOfAccountsId: settings.chartOfAccountsId,
            accountCode: '1100',
        },
        select: { accountGroupId: true },
    })
    let cardGl = await p.ficoGlAccount.findFirst({
        where: {
            chartOfAccountsId: settings.chartOfAccountsId,
            accountCode: CARD_GL,
        },
    })
    const ensureCompanyGl = async (glAccountId, accountCode) => {
        const existing = await p.ficoCompanyGlAccount.findUnique({
            where: {
                companyId_glAccountId: {
                    companyId: company.id,
                    glAccountId,
                },
            },
        })
        if (!existing) {
            await p.ficoCompanyGlAccount.create({
                data: {
                    companyId: company.id,
                    glAccountId,
                    postingEnabled: true,
                    createdBy: ACTOR,
                    updatedBy: ACTOR,
                },
            })
            console.log(`Assigned GL ${accountCode} to AWIC for posting`)
        }
    }

    if (!cardGl) {
        cardGl = await p.ficoGlAccount.create({
            data: {
                chartOfAccountsId: settings.chartOfAccountsId,
                accountGroupId: parentGroup?.accountGroupId ?? undefined,
                accountCode: CARD_GL,
                accountName: CARD_GL_NAME,
                accountType: 'ASSET',
                normalBalance: 'DEBIT',
                status: 'ACTIVE',
                isPostingAccount: true,
                allowManualPosting: true,
                allowAutomaticPosting: true,
                createdBy: ACTOR,
                updatedBy: ACTOR,
            },
        })
        console.log(`Created GL ${CARD_GL} ${CARD_GL_NAME}`)
    }
    await ensureCompanyGl(cardGl.id, CARD_GL)

    await p.sdPaymentMethod.update({
        where: { code: 'CARD' },
        data: { glAccountCode: CARD_GL },
    })

    const existingTreasury = await p.ficoTreasuryAccount.findFirst({
        where: {
            companyId: company.id,
            accountKind: 'CARD_CLEARING',
            paymentMethodCode: 'CARD',
        },
    })
    if (!existingTreasury) {
        await p.ficoTreasuryAccount.create({
            data: {
                companyId: company.id,
                accountCode: 'POS-CARD-CLEARING',
                accountName: 'POS Card Settlement',
                glAccountId: cardGl.id,
                currencyCode: 'PHP',
                accountKind: 'CARD_CLEARING',
                paymentMethodCode: 'CARD',
                status: 'ACTIVE',
            },
        })
        console.log('Created CARD_CLEARING treasury account')
    }

    const cardRuleCode = 'AWIC-PAYMENT-CARD'
    let cardRule = await p.ficoAccountDeterminationRule.findUnique({
        where: { determinationCode: cardRuleCode },
    })
    if (!cardRule) {
        await p.ficoAccountDeterminationRule.create({
            data: {
                determinationCode: cardRuleCode,
                name: 'AWIC POS card payment clearing',
                companyId: company.id,
                sourceModule: 'SD',
                transactionType: 'PAYMENT_CLEARING',
                transactionKeyCode: 'PAYMENT_CLEARING',
                paymentMethodCode: 'CARD',
                priority: 10,
                status: 'ACTIVE',
                effectiveFrom: new Date('2020-01-01'),
                createdBy: ACTOR,
                updatedBy: ACTOR,
                approvedBy: ACTOR,
                approvedAt: new Date(),
                activatedBy: ACTOR,
                activatedAt: new Date(),
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            side: 'DEBIT',
                            glAccountId: cardGl.id,
                            description: 'Card settlement clearing',
                        },
                    ],
                },
            },
        })
        console.log('Created PAYMENT_CLEARING rule for CARD')
    }

    const VAL_CLASS_CODE = 'PERFUME_MERCH'
    let valuationClass = await p.mmValuationClass.findFirst({
        where: { code: VAL_CLASS_CODE },
    })
    if (!valuationClass) {
        valuationClass = await p.mmValuationClass.create({
            data: {
                code: VAL_CLASS_CODE,
                name: 'Perfumes & Fragrances',
            },
        })
        console.log(`Created valuation class ${VAL_CLASS_CODE}`)
    }

    const product = await p.sdProduct.findFirst({
        where: { sku: PRODUCT_SKU },
        select: {
            materialAssignments: {
                take: 1,
                select: {
                    material: {
                        select: { id: true, valuationClassId: true, materialCode: true },
                    },
                },
            },
        },
    })
    const linkedMaterial = product?.materialAssignments[0]?.material
    if (linkedMaterial && !linkedMaterial.valuationClassId) {
        await p.mmMaterial.update({
            where: { id: linkedMaterial.id },
            data: { valuationClassId: valuationClass.id },
        })
        console.log(
            `Set valuation class on material ${linkedMaterial.materialCode ?? linkedMaterial.id}`,
        )
    }
    const valuationClassId =
        linkedMaterial?.valuationClassId ?? valuationClass.id
    const perfumeGl = await p.ficoGlAccount.findFirst({
        where: {
            chartOfAccountsId: settings.chartOfAccountsId,
            accountCode: PERFUME_REVENUE,
        },
    })
    const perfumeRuleCode = 'AWIC-SALES-PERFUME'
    if (perfumeGl) {
        await ensureCompanyGl(perfumeGl.id, PERFUME_REVENUE)
    }
    if (valuationClassId && perfumeGl) {
        let perfumeRule = await p.ficoAccountDeterminationRule.findUnique({
            where: { determinationCode: perfumeRuleCode },
        })
        if (!perfumeRule) {
            await p.ficoAccountDeterminationRule.create({
                data: {
                    determinationCode: perfumeRuleCode,
                    name: 'AWIC POS sales revenue — perfumes',
                    companyId: company.id,
                    sourceModule: 'SD',
                    transactionType: 'SALES_REVENUE',
                    transactionKeyCode: 'SALES_REVENUE',
                    valuationClassId,
                    priority: 10,
                    status: 'ACTIVE',
                    effectiveFrom: new Date('2020-01-01'),
                    createdBy: ACTOR,
                    updatedBy: ACTOR,
                    approvedBy: ACTOR,
                    approvedAt: new Date(),
                    activatedBy: ACTOR,
                    activatedAt: new Date(),
                    lines: {
                        create: [
                            {
                                lineNumber: 1,
                                side: 'CREDIT',
                                glAccountId: perfumeGl.id,
                                description: 'Sales — perfumes',
                            },
                        ],
                    },
                },
            })
            console.log(
                `Created SALES_REVENUE rule (valuation ${VAL_CLASS_CODE}) → ${PERFUME_REVENUE}`,
            )
        }
    }

    console.log('AWIC POS split config done.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => p.$disconnect())