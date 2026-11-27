/**
 * AWIC POS↔FICO accounting bootstrap + repair for cash / GI COGS gaps.
 *
 * - defaultCashAccountId → 1005 CASH ON HAND (not bank)
 * - SdPaymentMethod CASH.glAccountCode → 1005
 * - Treasury CASH_ON_HAND account for POS cash drawers
 * - Account determination profile + ACTIVE GI_COGS mapping
 * - Retry stuck GoodsIssuePosted events
 * - Reverse incorrect PS revenue journal and repost cash→Cash on Hand
 *
 *   npx ts-node --transpile-only --project prisma/tsconfig.seed.json prisma/seed-awic-pos-accounting.ts
 */
import { NestFactory } from '@nestjs/core'
import { PrismaClient } from '@prisma/client'
import { AppModule } from '../src/app.module'
import { FicoAccountingEventProcessorService } from '../src/fico/fico-accounting-event-processor.service'
import { FicoSdAccountingBridgeService } from '../src/fico/fico-sd-accounting-bridge.service'
import { Decimal } from '@prisma/client/runtime/library'

const ACTOR = 'seed-awic-pos-accounting'
const AWIC_CODE = 'AWIC'
const CASH_ON_HAND_CODE = '1005'

const log = (msg: string) => console.log(msg)

async function main() {
    const prisma = new PrismaClient()
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    })

    try {
        const company = await prisma.company.findFirst({
            where: { code: AWIC_CODE },
            select: { id: true, name: true },
        })
        if (!company) throw new Error('AWIC company not found')

        const settings = await prisma.ficoCompanyAccountingSettings.findFirst({
            where: { companyId: company.id },
        })
        if (!settings?.chartOfAccountsId) {
            throw new Error('AWIC company accounting settings / chart missing')
        }

        const cashOnHand = await prisma.ficoGlAccount.findFirst({
            where: {
                chartOfAccountsId: settings.chartOfAccountsId,
                accountCode: CASH_ON_HAND_CODE,
                isPostingAccount: true,
                status: 'ACTIVE',
            },
            select: { id: true, accountCode: true, accountName: true },
        })
        if (!cashOnHand) {
            throw new Error(`GL ${CASH_ON_HAND_CODE} CASH ON HAND not found on AWIC chart`)
        }

        // 1) Company default cash → Cash on Hand
        if (settings.defaultCashAccountId !== cashOnHand.id) {
            await prisma.ficoCompanyAccountingSettings.update({
                where: { id: settings.id },
                data: {
                    defaultCashAccountId: cashOnHand.id,
                    updatedBy: ACTOR,
                },
            })
            log(`defaultCashAccountId → ${cashOnHand.accountCode} ${cashOnHand.accountName}`)
        } else {
            log(`defaultCashAccountId already ${cashOnHand.accountCode}`)
        }

        // 2) Payment method CASH → posting Cash on Hand
        const cashMethod = await prisma.sdPaymentMethod.findUnique({
            where: { code: 'CASH' },
        })
        if (cashMethod && cashMethod.glAccountCode !== CASH_ON_HAND_CODE) {
            await prisma.sdPaymentMethod.update({
                where: { code: 'CASH' },
                data: { glAccountCode: CASH_ON_HAND_CODE },
            })
            log(`SdPaymentMethod CASH.glAccountCode → ${CASH_ON_HAND_CODE}`)
        } else {
            log(`SdPaymentMethod CASH.glAccountCode already ${cashMethod?.glAccountCode}`)
        }

        // 3) Treasury cash-on-hand settlement account
        const treasuryCode = 'POS-CASH-HAND'
        const existingTreasury = await prisma.ficoTreasuryAccount.findUnique({
            where: {
                companyId_accountCode: {
                    companyId: company.id,
                    accountCode: treasuryCode,
                },
            },
        })
        if (!existingTreasury) {
            await prisma.ficoTreasuryAccount.create({
                data: {
                    companyId: company.id,
                    accountCode: treasuryCode,
                    accountName: 'POS Cash on Hand',
                    accountKind: 'CASH_ON_HAND',
                    glAccountId: cashOnHand.id,
                    currencyCode: 'PHP',
                    paymentMethodCode: 'CASH',
                    status: 'ACTIVE',
                    createdBy: ACTOR,
                    updatedBy: ACTOR,
                },
            })
            log(`Created treasury ${treasuryCode} → ${cashOnHand.accountCode}`)
        } else {
            await prisma.ficoTreasuryAccount.update({
                where: { id: existingTreasury.id },
                data: {
                    accountKind: 'CASH_ON_HAND',
                    glAccountId: cashOnHand.id,
                    paymentMethodCode: 'CASH',
                    status: 'ACTIVE',
                    postingBlocked: false,
                    updatedBy: ACTOR,
                },
            })
            log(`Updated treasury ${treasuryCode} → ${cashOnHand.accountCode}`)
        }

        // 4) Account determination profile (required gate for MM GI COGS)
        let profile = await prisma.ficoAccountDeterminationProfile.findFirst({
            where: { companyId: company.id, code: 'AWIC-DEFAULT' },
        })
        if (!profile) {
            profile = await prisma.ficoAccountDeterminationProfile.create({
                data: {
                    companyId: company.id,
                    code: 'AWIC-DEFAULT',
                    name: 'AWIC Default Determination',
                    description: 'POS/MM automatic account determination',
                    isDefault: true,
                    status: 'ACTIVE',
                    createdBy: ACTOR,
                    updatedBy: ACTOR,
                },
            })
            log(`Created profile ${profile.code}`)
        } else if (profile.status !== 'ACTIVE') {
            profile = await prisma.ficoAccountDeterminationProfile.update({
                where: { id: profile.id },
                data: { status: 'ACTIVE', updatedBy: ACTOR },
            })
            log(`Activated profile ${profile.code}`)
        } else {
            log(`Profile ${profile.code} already ACTIVE`)
        }

        if (settings.accountDeterminationProfileId !== profile.id) {
            await prisma.ficoCompanyAccountingSettings.update({
                where: { id: settings.id },
                data: {
                    accountDeterminationProfileId: profile.id,
                    updatedBy: ACTOR,
                },
            })
            log('Assigned determination profile on company settings')
        }

        const inventoryId = settings.defaultInventoryAccountId
        const cogsId = settings.defaultCostOfGoodsSoldAccountId
        if (!inventoryId || !cogsId) {
            throw new Error('AWIC missing defaultInventoryAccountId or defaultCostOfGoodsSoldAccountId')
        }

        // Legacy GI_COGS mapping under the profile (CENTRAL_WITH_LEGACY_FALLBACK)
        const existingMap = await prisma.ficoMmAccountMapping.findFirst({
            where: {
                companyId: company.id,
                profileId: profile.id,
                transactionKeyCode: 'GI_COGS',
                valuationScopeKey: '*',
            },
        })
        if (!existingMap) {
            await prisma.ficoMmAccountMapping.create({
                data: {
                    companyId: company.id,
                    profileId: profile.id,
                    transactionKeyCode: 'GI_COGS',
                    valuationScopeKey: '*',
                    debitAccountId: cogsId,
                    creditAccountId: inventoryId,
                    status: 'ACTIVE',
                    createdBy: ACTOR,
                    updatedBy: ACTOR,
                },
            })
            log('Created ACTIVE GI_COGS legacy mapping (Dr COGS / Cr Inventory)')
        } else if (existingMap.status !== 'ACTIVE') {
            await prisma.ficoMmAccountMapping.update({
                where: { id: existingMap.id },
                data: {
                    status: 'ACTIVE',
                    debitAccountId: cogsId,
                    creditAccountId: inventoryId,
                    updatedBy: ACTOR,
                },
            })
            log('Activated GI_COGS legacy mapping')
        } else {
            log('GI_COGS legacy mapping already ACTIVE')
        }

        // ACTIVE central rule for GI_COGS (preferred when matched)
        const giRuleCode = 'AWIC-GI-COGS'
        let giRule = await prisma.ficoAccountDeterminationRule.findUnique({
            where: { determinationCode: giRuleCode },
            include: { lines: true },
        })
        if (!giRule) {
            giRule = await prisma.ficoAccountDeterminationRule.create({
                data: {
                    determinationCode: giRuleCode,
                    name: 'AWIC Sales Goods Issue COGS',
                    companyId: company.id,
                    sourceModule: 'MM',
                    transactionType: 'INVENTORY_CONSUMPTION',
                    transactionKeyCode: 'GI_COGS',
                    priority: 100,
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
                                glAccountId: cogsId,
                                description: 'Cost of goods sold',
                            },
                            {
                                lineNumber: 2,
                                side: 'CREDIT',
                                glAccountId: inventoryId,
                                description: 'Merchandise inventory',
                            },
                        ],
                    },
                },
                include: { lines: true },
            })
            log(`Created ACTIVE rule ${giRuleCode}`)
        } else if (giRule.status !== 'ACTIVE') {
            await prisma.ficoAccountDeterminationRule.update({
                where: { id: giRule.id },
                data: {
                    status: 'ACTIVE',
                    transactionKeyCode: 'GI_COGS',
                    activatedBy: ACTOR,
                    activatedAt: new Date(),
                    updatedBy: ACTOR,
                },
            })
            log(`Activated rule ${giRuleCode}`)
        } else {
            log(`Rule ${giRuleCode} already ACTIVE`)
        }

        // Sync catalogue keys (creates missing CASH_ON_HAND / PAYMENT_CLEARING / etc.)
        const { FicoTransactionKeyService } = await import(
            '../src/fico/fico-transaction-key.service'
        )
        const keyService = app.get(FicoTransactionKeyService)
        const synced = await keyService.syncCatalogFromCode({
            id: ACTOR,
            userName: ACTOR,
            role: 'super_admin',
        } as never)
        log(`Synced transaction keys: upserted=${synced.upserted}`)

        await prisma.ficoTransactionKey.updateMany({
            where: {
                code: {
                    in: ['GI_COGS', 'CASH_ON_HAND', 'PAYMENT_CLEARING', 'SALES_REVENUE'],
                },
            },
            data: {
                integrationStatus: 'LIVE',
                automaticPostingEligible: true,
                status: 'ACTIVE',
            },
        })
        log('Forced GI_COGS / CASH_ON_HAND / PAYMENT_CLEARING / SALES_REVENUE → LIVE')

        // 5) Retry stuck GI accounting events for AWIC
        const processor = app.get(FicoAccountingEventProcessorService)
        const stuck = await prisma.mmAccountingEvent.findMany({
            where: {
                companyId: company.id,
                eventType: 'GoodsIssuePosted',
                status: { in: ['RETRY_SCHEDULED', 'FAILED', 'PENDING'] },
            },
            select: { id: true, documentId: true, status: true, lastError: true },
            take: 20,
        })
        for (const ev of stuck) {
            try {
                const status = await processor.retryEvent(ev.id)
                log(`Retried GI event ${ev.id} → ${status}`)
            } catch (err) {
                log(
                    `Retry failed ${ev.id}: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                )
            }
        }

        // 6) Repair POS-000001 revenue: reverse bank debit, repost to Cash on Hand
        const bridge = app.get(FicoSdAccountingBridgeService)
        const order = await prisma.sdSalesOrder.findFirst({
            where: { orderNumber: 'POS-000001', companyId: company.id },
            select: {
                id: true,
                orderNumber: true,
                branchId: true,
                customerId: true,
                totalAmount: true,
                taxAmount: true,
                paymentStatus: true,
            },
        })
        if (!order) {
            log('POS-000001 not found — skip revenue repair')
            return
        }

        const wrongJournal = await prisma.ficoJournalEntry.findFirst({
            where: {
                companyId: company.id,
                sourceDocumentId: order.id,
                status: 'POSTED',
                documentType: 'SD_REVENUE',
            },
            include: {
                lines: {
                    include: {
                        glAccount: { select: { accountCode: true } },
                    },
                },
            },
        })
        if (wrongJournal) {
            const debitedBank = wrongJournal.lines.some(
                (l) =>
                    Number(l.debitAmount) > 0 &&
                    l.glAccount.accountCode === '1003',
            )
            if (debitedBank) {
                // SD journals must reverse via originating module path
                await bridge.reversePosRevenueJournal(
                    company.id,
                    order.id,
                    'Correct POS cash tender from Cash in Bank to Cash on Hand',
                    `pos-void:${order.id}:cash-on-hand-repair`,
                )
                await new Promise((r) => setTimeout(r, 1500))
                log(`Requested SD void/reverse for ${wrongJournal.documentNumber}`)

                const tenders = await prisma.sdSalesOrderPayment.findMany({
                    where: { salesOrderId: order.id },
                    select: { paymentMethod: true, amount: true, status: true },
                })

                await bridge.recordAndDispatch({
                    eventType: 'PosSaleCompleted',
                    documentType: 'SALES_ORDER',
                    documentId: order.id,
                    companyId: company.id,
                    postingDate: new Date(),
                    currencyCode: 'PHP',
                    idempotencyKey: `pos-revenue:${order.id}:cash-on-hand-repair`,
                    totalValue: new Decimal(order.totalAmount.toString()),
                    payload: {
                        salesOrderId: order.id,
                        orderNumber: order.orderNumber,
                        customerId: order.customerId ?? undefined,
                        branchId: order.branchId,
                        tenders: (tenders.length
                            ? tenders
                            : [
                                  {
                                      paymentMethod: 'CASH',
                                      amount: order.totalAmount,
                                      status: 'Paid',
                                  },
                              ]
                        ).map((t) => ({
                            method: t.paymentMethod,
                            amount: t.amount.toString(),
                            status: t.status,
                        })),
                        outstandingBalance: '0',
                        totalAmount: order.totalAmount.toString(),
                        taxAmount: (order.taxAmount ?? 0).toString(),
                        paymentStatus: order.paymentStatus ?? 'Paid',
                    },
                })
                await new Promise((r) => setTimeout(r, 2000))
                log('Re-dispatched PosSaleCompleted with Cash on Hand mapping')
            } else {
                log(`${wrongJournal.documentNumber} already not on 1003 — skip reverse`)
            }
        } else {
            log('No posted SD_REVENUE journal for POS-000001')
        }

        // Retry the specific POS GI after COGS pair validation fix (rebuild required)
        const posGi = await prisma.mmGoodsIssue.findFirst({
            where: { sourceDocumentId: order.id },
            select: { id: true },
        })
        if (posGi) {
            const giEvent = await prisma.mmAccountingEvent.findFirst({
                where: {
                    documentId: posGi.id,
                    eventType: 'GoodsIssuePosted',
                },
                orderBy: { createdAt: 'desc' },
            })
            if (giEvent && giEvent.status !== 'CONSUMED') {
                try {
                    const status = await processor.retryEvent(giEvent.id)
                    log(`Retried POS GI accounting ${giEvent.id} → ${status}`)
                } catch (err) {
                    log(
                        `POS GI retry failed: ${
                            err instanceof Error ? err.message : String(err)
                        }`,
                    )
                }
            }
        }

        // Final snapshot
        const after = await prisma.ficoJournalEntry.findMany({
            where: {
                companyId: company.id,
                OR: [
                    { sourceDocumentId: order.id },
                    { description: { contains: 'POS-000001' } },
                ],
            },
            include: {
                lines: {
                    include: { glAccount: { select: { accountCode: true, accountName: true } } },
                    orderBy: { lineNumber: 'asc' },
                },
            },
            orderBy: { createdAt: 'asc' },
        })
        for (const j of after) {
            log(
                `JE ${j.documentNumber} ${j.status} ${j.documentType}: ` +
                    j.lines
                        .map(
                            (l) =>
                                `${Number(l.debitAmount) > 0 ? 'DR' : 'CR'} ${l.glAccount.accountCode} ${Number(l.debitAmount) || Number(l.creditAmount)}`,
                        )
                        .join(' | '),
            )
        }

        const giEv = await prisma.mmAccountingEvent.findMany({
            where: {
                companyId: company.id,
                eventType: 'GoodsIssuePosted',
                documentType: 'GOODS_ISSUE',
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                id: true,
                status: true,
                lastError: true,
                journalEntryId: true,
                documentId: true,
            },
        })
        log(`GI accounting events: ${JSON.stringify(giEv)}`)
    } finally {
        await app.close()
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
