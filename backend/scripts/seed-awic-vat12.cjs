/**
 * Set up Philippine VAT 12% for AWIC in FICO and apply it to AWIC materials
 * so POS can compute VAT. Idempotent.
 *
 *   cd backend && node scripts/seed-awic-vat12.cjs
 */
const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

const prisma = new PrismaClient()
const ACTOR = 'seed-awic-vat12'

async function ensureGroup(chartId, def) {
    const existing = await prisma.ficoGlAccountGroup.findFirst({
        where: { chartOfAccountsId: chartId, code: def.code },
    })
    if (existing) return existing
    return prisma.ficoGlAccountGroup.create({
        data: {
            chartOfAccountsId: chartId,
            code: def.code,
            name: def.name,
            category: def.category,
            status: 'ACTIVE',
            createdBy: ACTOR,
            updatedBy: ACTOR,
        },
    })
}

async function ensureGl(chartId, groupId, def) {
    const existing = await prisma.ficoGlAccount.findUnique({
        where: {
            chartOfAccountsId_accountCode: {
                chartOfAccountsId: chartId,
                accountCode: def.code,
            },
        },
    })
    if (existing) {
        return prisma.ficoGlAccount.update({
            where: { id: existing.id },
            data: {
                accountName: def.name,
                accountType: def.type,
                normalBalance: def.normal,
                isPostingAccount: true,
                status: 'ACTIVE',
                updatedBy: ACTOR,
            },
        })
    }
    return prisma.ficoGlAccount.create({
        data: {
            chartOfAccountsId: chartId,
            accountGroupId: groupId,
            accountCode: def.code,
            accountName: def.name,
            accountType: def.type,
            normalBalance: def.normal,
            isPostingAccount: true,
            allowManualPosting: true,
            allowAutomaticPosting: true,
            status: 'ACTIVE',
            createdBy: ACTOR,
            updatedBy: ACTOR,
        },
    })
}

async function ensureCompanyGl(companyId, glAccountId) {
    const existing = await prisma.ficoCompanyGlAccount.findUnique({
        where: { companyId_glAccountId: { companyId, glAccountId } },
    })
    if (existing) {
        return prisma.ficoCompanyGlAccount.update({
            where: { id: existing.id },
            data: { postingEnabled: true, updatedBy: ACTOR },
        })
    }
    return prisma.ficoCompanyGlAccount.create({
        data: {
            companyId,
            glAccountId,
            postingEnabled: true,
            createdBy: ACTOR,
            updatedBy: ACTOR,
        },
    })
}

async function main() {
    const awic = await prisma.company.findFirst({ where: { code: 'AWIC' } })
    if (!awic) throw new Error('Company AWIC not found')

    const agctek = await prisma.company.findFirst({ where: { code: 'AGCTEK' } })
    const agcSettings = agctek
        ? await prisma.ficoCompanyAccountingSettings.findUnique({
              where: { companyId: agctek.id },
          })
        : null

    let chart =
        (await prisma.ficoChartOfAccounts.findFirst({
            where: { code: 'PH_MM_STARTER' },
        })) ||
        (agcSettings?.chartOfAccountsId
            ? await prisma.ficoChartOfAccounts.findUnique({
                  where: { id: agcSettings.chartOfAccountsId },
              })
            : null)
    if (!chart) throw new Error('No chart of accounts found (PH_MM_STARTER)')

    console.log('Company', awic.code, awic.id)
    console.log('COA', chart.code, chart.id)

    const liabilityGroup = await ensureGroup(chart.id, {
        code: '2200',
        name: 'Current Liabilities',
        category: 'LIABILITY',
    })
    const assetGroup = await ensureGroup(chart.id, {
        code: '1300',
        name: 'Other Current Assets',
        category: 'ASSET',
    })

    const outputVat = await ensureGl(chart.id, liabilityGroup.id, {
        code: '220100',
        name: 'Output VAT Payable',
        type: 'LIABILITY',
        normal: 'CREDIT',
    })
    const inputVat = await ensureGl(chart.id, assetGroup.id, {
        code: '130100',
        name: 'Input VAT',
        type: 'ASSET',
        normal: 'DEBIT',
    })
    console.log('GL Output VAT', outputVat.accountCode, outputVat.id)
    console.log('GL Input VAT', inputVat.accountCode, inputVat.id)

    await ensureCompanyGl(awic.id, outputVat.id)
    await ensureCompanyGl(awic.id, inputVat.id)

    // Company accounting settings for AWIC
    let settings = await prisma.ficoCompanyAccountingSettings.findUnique({
        where: { companyId: awic.id },
    })
    const settingsData = {
        legalName: awic.name,
        baseCurrency: 'PHP',
        countryCode: 'PH',
        timezone: 'Asia/Manila',
        accountingMethod: 'ACCRUAL',
        chartOfAccountsId: chart.id,
        fiscalYearVariantId:
            settings?.fiscalYearVariantId ??
            agcSettings?.fiscalYearVariantId ??
            null,
        postingPeriodVariantId:
            settings?.postingPeriodVariantId ??
            agcSettings?.postingPeriodVariantId ??
            null,
        taxCountryCode: 'PH',
        defaultTaxCode: 'VAT12',
        defaultTaxOutputAccountId: outputVat.id,
        defaultTaxInputAccountId: inputVat.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
        activatedBy: ACTOR,
        updatedBy: ACTOR,
    }
    if (!settings) {
        settings = await prisma.ficoCompanyAccountingSettings.create({
            data: {
                companyId: awic.id,
                ...settingsData,
                createdBy: ACTOR,
            },
        })
        console.log('Created AWIC company accounting settings')
    } else {
        settings = await prisma.ficoCompanyAccountingSettings.update({
            where: { id: settings.id },
            data: settingsData,
        })
        console.log('Updated AWIC company accounting settings')
    }

    // Tax code VAT12
    let taxCode = await prisma.ficoTaxCode.findFirst({
        where: { companyId: awic.id, code: 'VAT12' },
        include: { taxRates: true },
    })
    if (!taxCode) {
        taxCode = await prisma.ficoTaxCode.create({
            data: {
                companyId: awic.id,
                code: 'VAT12',
                name: 'Standard VAT 12%',
                description: 'Philippine VAT 12% for AWIC sales (POS / retail)',
                taxCategory: 'OUTPUT_TAX',
                taxType: 'VAT',
                countryCode: 'PH',
                calculationMethod: 'TAX_INCLUSIVE',
                rateUnit: 'PERCENTAGE',
                roundingMethod: 'HALF_UP',
                decimalPrecision: 2,
                roundingLevel: 'PER_LINE_ITEM',
                isSalesApplicable: true,
                isPurchaseApplicable: false,
                isServiceApplicable: true,
                isInventoryApplicable: false,
                isRecoverable: true,
                outputTaxGlAccountId: outputVat.id,
                inputTaxGlAccountId: inputVat.id,
                status: 'ACTIVE',
                createdBy: ACTOR,
                updatedBy: ACTOR,
                taxRates: {
                    create: {
                        companyId: awic.id,
                        rate: new Decimal(12),
                        rateUnit: 'PERCENTAGE',
                        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
                        effectiveTo: null,
                        status: 'ACTIVE',
                        createdBy: ACTOR,
                    },
                },
            },
            include: { taxRates: true },
        })
        console.log('Created tax code VAT12 @ 12%')
    } else {
        taxCode = await prisma.ficoTaxCode.update({
            where: { id: taxCode.id },
            data: {
                name: 'Standard VAT 12%',
                taxCategory: 'OUTPUT_TAX',
                taxType: 'VAT',
                countryCode: 'PH',
                calculationMethod: 'TAX_INCLUSIVE',
                isSalesApplicable: true,
                isServiceApplicable: true,
                outputTaxGlAccountId: outputVat.id,
                inputTaxGlAccountId: inputVat.id,
                status: 'ACTIVE',
                updatedBy: ACTOR,
            },
            include: { taxRates: true },
        })
        const activeRate = taxCode.taxRates.find((r) => r.status === 'ACTIVE')
        if (!activeRate) {
            await prisma.ficoTaxRate.create({
                data: {
                    taxCodeId: taxCode.id,
                    companyId: awic.id,
                    rate: new Decimal(12),
                    rateUnit: 'PERCENTAGE',
                    effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
                    status: 'ACTIVE',
                    createdBy: ACTOR,
                },
            })
            console.log('Added active 12% rate to existing VAT12')
        } else if (Number(activeRate.rate) !== 12) {
            await prisma.ficoTaxRate.update({
                where: { id: activeRate.id },
                data: { rate: new Decimal(12) },
            })
            console.log('Updated VAT12 rate to 12%')
        } else {
            console.log('Tax code VAT12 already active @ 12%')
        }
    }

    // Do not auto-assign VAT to materials — tax is set per material in MM UI.
    const linked = await prisma.mmMaterial.count({
        where: { taxCodeId: taxCode.id, deletedAt: null },
    })
    console.log(
        `FICO VAT12 ready. Materials currently linked to VAT12: ${linked} (assign per material in MM).`,
    )
    console.log('DONE')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
