import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { FicoJournalService } from '../../fico/fico-journal.service'
import { PosPaymentMethodService } from './pos-payment-method.service'
import { SD_EVENTS } from '../sd-event.types'

const Decimal = Prisma.Decimal
const ZERO = new Decimal(0)

type PosSaleEvent = {
    salesOrderId: string
    orderNumber: string
    receiptNumber?: string
    companyId: string
    branchId?: string
    posSessionId?: string
    currency?: string
    totalAmount: string
    taxAmount?: string
    outstandingBalance?: string
    paymentStatus?: string
    tenders?: Array<{
        method: string
        amount: string
        status?: string
        verificationStatus?: string
    }>
}

type PosCollectionEvent = {
    collectionId: string
    collectionNumber: string
    salesOrderId: string
    orderNumber: string
    receiptNumber?: string
    companyId: string
    branchId?: string
    customerId: string
    currency?: string
    collectedAmount: string
    previousBalance: string
    newBalance: string
    tenders?: Array<{
        method: string
        amount: string
        status?: string
        verificationStatus?: string
        referenceNumber?: string
    }>
    idempotencyKey?: string
}

/**
 * Listens for completed POS sales and posts the revenue journal entry:
 *   DEBIT  Cash / GCash Clearing / Card Clearing / … (per tender)
 *   CREDIT Sales Revenue (net of VAT)
 *   CREDIT Output VAT (from the frozen line-level tax)
 *
 * Journal entries are idempotent on `pos-revenue:<salesOrderId>`.
 * If the FICO infrastructure is not ready (no settings, no period, etc.)
 * the event is logged and skipped — it does not block the POS sale.
 */
@Injectable()
export class PosRevenuePostingListener {
    private readonly logger = new Logger(PosRevenuePostingListener.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly journal: FicoJournalService,
        private readonly paymentMethods: PosPaymentMethodService,
    ) {}

    @OnEvent(SD_EVENTS.POS_SALE_COMPLETED, { async: true })
    async handlePosSaleCompleted(
        envelope: PosSaleEvent | { payload?: PosSaleEvent },
    ): Promise<void> {
        // SdEventEmitterService emits an envelope { payload }; accept bare payload too.
        const event = this.unwrapPayload<PosSaleEvent>(envelope)
        if (!event?.salesOrderId || !event?.companyId) return

        const idempotencyKey = `pos-revenue:${event.salesOrderId}`

        try {
            // Check the company has active accounting settings + default G/L slots
            const settings = await this.prisma.ficoCompanyAccountingSettings.findFirst({
                where: { companyId: event.companyId, status: 'ACTIVE' },
                select: {
                    chartOfAccountsId: true,
                    defaultCashAccountId: true,
                    defaultSalesRevenueAccountId: true,
                    defaultTaxOutputAccountId: true,
                    defaultReceivableAccountId: true,
                    documentNumberPrefix: true,
                },
            })
            if (!settings?.chartOfAccountsId) {
                this.logger.debug(
                    `Skipping revenue posting for ${event.orderNumber}: no active accounting settings`,
                )
                return
            }

            // Load G/L accounts from the company's chart (posting accounts only)
            const glAccounts = await this.prisma.ficoGlAccount.findMany({
                where: {
                    chartOfAccountsId: settings.chartOfAccountsId,
                    status: 'ACTIVE',
                    isPostingAccount: true,
                },
                select: { id: true, accountCode: true, accountName: true },
            })
            const glByCode = new Map(glAccounts.map((a) => [a.accountCode, a]))
            const glById = new Map(glAccounts.map((a) => [a.id, a]))
            const resolveByIdOrCodes = (
                accountId: string | null | undefined,
                codes: string[],
            ) => {
                if (accountId) {
                    const byId = glById.get(accountId)
                    if (byId) return byId
                }
                for (const code of codes) {
                    const byCode = glByCode.get(code)
                    if (byCode) return byCode
                }
                return null
            }

            // Load the frozen VAT from order lines
            const order = await this.prisma.sdSalesOrder.findUnique({
                where: { id: event.salesOrderId },
                select: {
                    id: true,
                    orderNumber: true,
                    totalAmount: true,
                    taxAmount: true,
                    lines: {
                        select: {
                            taxClassification: true,
                            taxAmount: true,
                            taxableAmount: true,
                            lineTotal: true,
                        },
                    },
                },
            })
            if (!order) {
                this.logger.warn(`Order ${event.salesOrderId} not found for revenue posting`)
                return
            }

            // Calculate from frozen line tax
            const totalVat = order.lines.reduce(
                (sum, line) => sum.plus(line.taxAmount ?? 0),
                ZERO,
            )
            const totalAmount = new Decimal(event.totalAmount)
            const netRevenue = totalAmount.minus(totalVat)

            // DEBIT side: one line per tender
            const tenders = event.tenders ?? []
            // Prefer company default sales revenue (AWIC posting leaf, not header 4000).
            const revenueAccount = resolveByIdOrCodes(
                settings.defaultSalesRevenueAccountId,
                ['4000', '4001', '4004', '4017'],
            )
            // Output VAT — company default, then common PH / starter COA codes.
            const vatAccount = resolveByIdOrCodes(
                settings.defaultTaxOutputAccountId,
                ['2114', '2040', '2200', '2150'],
            )
            const cashAccount = resolveByIdOrCodes(
                settings.defaultCashAccountId,
                ['1005', '1002', '1001', '1000'],
            )
            const arAccount = resolveByIdOrCodes(
                settings.defaultReceivableAccountId,
                ['1101', '1100'],
            )
            // Employee Receivable account for salary-loan tenders
            const empArAccount = glByCode.get('1210')

            if (!revenueAccount) {
                this.logger.warn(
                    `Skipping revenue posting for ${event.orderNumber}: no posting sales-revenue G/L configured`,
                )
                return
            }

            // For each tender, debit the tender's clearing account and credit revenue
            const rawLines: Array<{
                lineNumber: number
                glAccountId: string
                debitAmount: Prisma.Decimal
                creditAmount: Prisma.Decimal
                description: string
            }> = []
            let lineNum = 1

            // Load tender → G/L mapping from the configurable payment methods table
            const tenderGlMap = await this.paymentMethods.glAccountMap()

            for (const tender of tenders) {
                const amount = new Decimal(tender.amount)
                if (amount.lte(0)) continue

                const glCode = tenderGlMap[tender.method]
                const mapped = glCode ? glByCode.get(glCode) : null
                if (glCode && !mapped) {
                    this.logger.warn(
                        `G/L account ${glCode} not found for tender ${tender.method}; using company cash default`,
                    )
                }
                const accountId = mapped?.id ?? cashAccount?.id
                if (!accountId) {
                    this.logger.error(
                        `Cannot post revenue for ${event.orderNumber}: no cash / tender G/L account`,
                    )
                    return
                }

                rawLines.push({
                    lineNumber: lineNum++,
                    glAccountId: accountId,
                    debitAmount: amount,
                    creditAmount: ZERO,
                    description: `${tender.method} tender · ${event.orderNumber}`,
                })
            }

            // For partial payments: debit Accounts Receivable for the outstanding portion
            const outstandingBalance = new Decimal(event.outstandingBalance ?? '0')
            if (outstandingBalance.gt(0)) {
                // Check if part of the outstanding is an employee loan
                const receivable = await this.prisma.sdPosReceivable.findUnique({
                    where: { salesOrderId: event.salesOrderId },
                    select: { employeeId: true },
                })
                const arAccountId = (receivable?.employeeId && empArAccount)
                    ? empArAccount.id
                    : (arAccount?.id ?? cashAccount?.id)

                if (arAccountId) {
                    rawLines.push({
                        lineNumber: lineNum++,
                        glAccountId: arAccountId,
                        debitAmount: outstandingBalance,
                        creditAmount: ZERO,
                        description: `Accounts Receivable · ${event.orderNumber}`,
                    })
                } else {
                    this.logger.warn(
                        `Accounts Receivable G/L not found; outstanding ₱${outstandingBalance} not posted for ${event.orderNumber}`,
                    )
                }
            }

            // CREDIT: Sales Revenue (net of VAT)
            if (netRevenue.gt(0)) {
                rawLines.push({
                    lineNumber: lineNum++,
                    glAccountId: revenueAccount.id,
                    debitAmount: ZERO,
                    creditAmount: netRevenue,
                    description: `Sales Revenue · ${event.orderNumber}`,
                })
            }

            // CREDIT: Output VAT
            if (totalVat.gt(0) && vatAccount) {
                rawLines.push({
                    lineNumber: lineNum++,
                    glAccountId: vatAccount.id,
                    debitAmount: ZERO,
                    creditAmount: totalVat,
                    description: `Output VAT · ${event.orderNumber}`,
                })
            } else if (totalVat.gt(0) && !vatAccount) {
                // No VAT account: credit the full amount to revenue
                this.logger.warn(
                    `G/L 2040 (Output VAT) not found; VAT ₱${totalVat} credited to revenue for ${event.orderNumber}`,
                )
                const existingRevLine = rawLines.find(
                    (l) => l.glAccountId === revenueAccount.id && l.creditAmount.gt(0),
                )
                if (existingRevLine) {
                    existingRevLine.creditAmount = existingRevLine.creditAmount.plus(totalVat)
                }
            }

            // Balance check
            const totalDebit = rawLines.reduce((s, l) => s.plus(l.debitAmount), ZERO)
            const totalCredit = rawLines.reduce((s, l) => s.plus(l.creditAmount), ZERO)
            if (!totalDebit.eq(totalCredit)) {
                this.logger.error(
                    `Journal imbalance for ${event.orderNumber}: debit ${totalDebit} ≠ credit ${totalCredit}; skipping`,
                )
                return
            }

            if (rawLines.length === 0) {
                this.logger.debug(`No journal lines for ${event.orderNumber} (zero-amount sale?)`)
                return
            }

            // Find the fiscal period
            const postingDate = new Date()
            const fiscalPeriod = await this.prisma.ficoFinancialPeriod.findFirst({
                where: {
                    companyId: event.companyId,
                    periodType: 'NORMAL',
                    startDate: { lte: postingDate },
                    endDate: { gte: postingDate },
                    status: { in: ['OPEN', 'RESTRICTED'] },
                },
                select: { id: true, fiscalYear: true },
            })

            if (!fiscalPeriod) {
                this.logger.warn(
                    `No open fiscal period for ${event.companyId} on ${postingDate.toISOString().slice(0, 10)}; revenue posting skipped for ${event.orderNumber}`,
                )
                return
            }

            // Create the journal entry directly
            const currency = event.currency ?? 'PHP'
            const existing = await this.prisma.ficoJournalEntry.findUnique({
                where: { idempotencyKey },
                select: { id: true },
            })
            if (existing) {
                this.logger.debug(`Revenue journal already exists for ${event.orderNumber}`)
                return
            }

            // Cash fully paid → OR; otherwise SI (sales invoice / AR).
            // String `documentType` is constrained to SD_REVENUE / MM_* / JOURNAL;
            // AWIC OR/SI live on documentTypeId (fi_document_types) + number range.
            const awicDocTypeCode = outstandingBalance.gt(0) ? 'SI' : 'OR'
            const fiDocType = await this.prisma.fiDocumentType.findUnique({
                where: { code: awicDocTypeCode },
                select: { id: true, code: true },
            })

            const journal = await this.prisma.$transaction(async (tx) => {
                // Period lock (shared) — same pattern as createResolvedJournal
                await tx.$queryRaw`
                    SELECT id FROM fico_financial_periods
                    WHERE id = ${fiscalPeriod.id}
                    FOR SHARE
                `
                const lockedPeriod = await tx.ficoFinancialPeriod.findUnique({
                    where: { id: fiscalPeriod.id },
                    select: { status: true },
                })
                if (!lockedPeriod || !['OPEN', 'RESTRICTED'].includes(lockedPeriod.status)) {
                    throw new Error('Fiscal period changed; revenue posting skipped')
                }

                const documentNumber = await this.nextDocumentNumber(
                    tx,
                    event.companyId,
                    fiscalPeriod.fiscalYear,
                    awicDocTypeCode,
                    settings.documentNumberPrefix,
                )

                // Create as DRAFT so lines can be inserted, then mark POSTED.
                const entry = await tx.ficoJournalEntry.create({
                    data: {
                        idempotencyKey,
                        companyId: event.companyId,
                        postingDate,
                        documentDate: postingDate,
                        fiscalYear: fiscalPeriod.fiscalYear,
                        fiscalPeriodId: fiscalPeriod.id,
                        totalAmount: totalDebit,
                        currencyCode: currency,
                        status: 'DRAFT',
                        approvalStatus: 'POSTED',
                        requiresApproval: false,
                        documentType: 'SD_REVENUE',
                        documentTypeId: fiDocType?.id ?? null,
                        documentNumber,
                        sourceModule: 'SD',
                        sourceDocumentType: 'SALES_ORDER',
                        sourceDocumentId: event.salesOrderId,
                        sourcePostingKey: idempotencyKey,
                        description: `POS revenue · ${event.receiptNumber ?? event.orderNumber}`,
                        headerText: `POS revenue · ${event.receiptNumber ?? event.orderNumber}`,
                        postedAt: null,
                        postedBy: null,
                    },
                })
                await tx.ficoJournalEntryLine.createMany({
                    data: rawLines.map((line) => ({
                        journalEntryId: entry.id,
                        lineNumber: line.lineNumber,
                        glAccountId: line.glAccountId,
                        companyId: event.companyId,
                        debitAmount: line.debitAmount,
                        creditAmount: line.creditAmount,
                        currency,
                        description: line.description,
                    })),
                })
                await tx.ficoJournalEntry.update({
                    where: { id: entry.id },
                    data: {
                        status: 'POSTED',
                        postedAt: new Date(),
                    },
                })
                return entry
            })

            this.logger.log(
                `Revenue journal ${journal.id} posted for ${event.receiptNumber ?? event.orderNumber}: ` +
                `₱${totalDebit} (${rawLines.length} lines, VAT ₱${totalVat})`,
            )
        } catch (err) {
            // Revenue posting must never block the POS sale
            this.logger.error(
                `Revenue posting failed for ${event.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
            )
        }
    }

    /**
     * Handle a subsequent payment collection: DEBIT Cash/etc, CREDIT Accounts Receivable.
     * No second revenue recognition — the revenue was posted at sale time.
     */
    @OnEvent(SD_EVENTS.POS_COLLECTION_COMPLETED, { async: true })
    async handlePosCollectionCompleted(
        envelope: PosCollectionEvent | { payload?: PosCollectionEvent },
    ): Promise<void> {
        const event = this.unwrapPayload<PosCollectionEvent>(envelope)
        if (!event?.collectionId || !event?.companyId) return

        const idempotencyKey = `pos-collection:${event.collectionId}`

        try {
            const settings = await this.prisma.ficoCompanyAccountingSettings.findFirst({
                where: { companyId: event.companyId, status: 'ACTIVE' },
                select: {
                    chartOfAccountsId: true,
                    defaultCashAccountId: true,
                    defaultReceivableAccountId: true,
                    documentNumberPrefix: true,
                },
            })
            if (!settings?.chartOfAccountsId) {
                this.logger.debug(
                    `Skipping collection posting for ${event.collectionNumber}: no active accounting settings`,
                )
                return
            }

            const glAccounts = await this.prisma.ficoGlAccount.findMany({
                where: {
                    chartOfAccountsId: settings.chartOfAccountsId,
                    status: 'ACTIVE',
                    isPostingAccount: true,
                },
                select: { id: true, accountCode: true },
            })
            const glByCode = new Map(glAccounts.map((a) => [a.accountCode, a]))
            const glById = new Map(glAccounts.map((a) => [a.id, a]))
            const resolveByIdOrCodes = (
                accountId: string | null | undefined,
                codes: string[],
            ) => {
                if (accountId) {
                    const byId = glById.get(accountId)
                    if (byId) return byId
                }
                for (const code of codes) {
                    const byCode = glByCode.get(code)
                    if (byCode) return byCode
                }
                return null
            }

            const arAccount = resolveByIdOrCodes(
                settings.defaultReceivableAccountId,
                ['1101', '1100'],
            )
            const cashAccount = resolveByIdOrCodes(
                settings.defaultCashAccountId,
                ['1005', '1002', '1001', '1000'],
            )
            if (!arAccount) {
                this.logger.warn(
                    `Skipping collection posting for ${event.collectionNumber}: Accounts Receivable G/L not found`,
                )
                return
            }

            const existing = await this.prisma.ficoJournalEntry.findUnique({
                where: { idempotencyKey },
                select: { id: true },
            })
            if (existing) {
                this.logger.debug(`Collection journal already exists for ${event.collectionNumber}`)
                return
            }

            const tenderGlMap = await this.paymentMethods.glAccountMap()
            const rawLines: Array<{
                lineNumber: number
                glAccountId: string
                debitAmount: Prisma.Decimal
                creditAmount: Prisma.Decimal
                description: string
            }> = []
            let lineNum = 1

            // DEBIT side: one line per collection tender
            const tenders = event.tenders ?? []
            for (const tender of tenders) {
                const amount = new Decimal(tender.amount)
                if (amount.lte(0)) continue

                const glCode = tenderGlMap[tender.method]
                const mapped = glCode ? glByCode.get(glCode) : null
                const accountId = mapped?.id ?? cashAccount?.id
                if (!accountId) continue

                rawLines.push({
                    lineNumber: lineNum++,
                    glAccountId: accountId,
                    debitAmount: amount,
                    creditAmount: ZERO,
                    description: `${tender.method} collection · ${event.collectionNumber}`,
                })
            }

            // CREDIT: Accounts Receivable (reduce the outstanding balance)
            const collectedAmount = new Decimal(event.collectedAmount)
            if (collectedAmount.gt(0)) {
                rawLines.push({
                    lineNumber: lineNum++,
                    glAccountId: arAccount.id,
                    debitAmount: ZERO,
                    creditAmount: collectedAmount,
                    description: `AR collection · ${event.orderNumber} · ${event.collectionNumber}`,
                })
            }

            // Balance check
            const totalDebit = rawLines.reduce((s, l) => s.plus(l.debitAmount), ZERO)
            const totalCredit = rawLines.reduce((s, l) => s.plus(l.creditAmount), ZERO)
            if (!totalDebit.eq(totalCredit)) {
                this.logger.error(
                    `Collection journal imbalance for ${event.collectionNumber}: debit ${totalDebit} ≠ credit ${totalCredit}; skipping`,
                )
                return
            }
            if (!rawLines.length) return

            const postingDate = new Date()
            const fiscalPeriod = await this.prisma.ficoFinancialPeriod.findFirst({
                where: {
                    companyId: event.companyId,
                    periodType: 'NORMAL',
                    startDate: { lte: postingDate },
                    endDate: { gte: postingDate },
                    status: { in: ['OPEN', 'RESTRICTED'] },
                },
                select: { id: true, fiscalYear: true },
            })

            if (!fiscalPeriod) {
                this.logger.warn(
                    `No open fiscal period for collection ${event.collectionNumber}; posting skipped`,
                )
                return
            }

            const currency = event.currency ?? 'PHP'
            const fiDocType = await this.prisma.fiDocumentType.findUnique({
                where: { code: 'CR' },
                select: { id: true },
            })
            const journal = await this.prisma.$transaction(async (tx) => {
                await tx.$queryRaw`
                    SELECT id FROM fico_financial_periods
                    WHERE id = ${fiscalPeriod.id}
                    FOR SHARE
                `
                const lockedPeriod = await tx.ficoFinancialPeriod.findUnique({
                    where: { id: fiscalPeriod.id },
                    select: { status: true },
                })
                if (!lockedPeriod || !['OPEN', 'RESTRICTED'].includes(lockedPeriod.status)) {
                    throw new Error('Fiscal period changed; collection posting skipped')
                }

                const documentNumber = await this.nextDocumentNumber(
                    tx,
                    event.companyId,
                    fiscalPeriod.fiscalYear,
                    'CR',
                    settings.documentNumberPrefix,
                )

                const entry = await tx.ficoJournalEntry.create({
                    data: {
                        idempotencyKey,
                        companyId: event.companyId,
                        postingDate,
                        documentDate: postingDate,
                        fiscalYear: fiscalPeriod.fiscalYear,
                        fiscalPeriodId: fiscalPeriod.id,
                        totalAmount: totalDebit,
                        currencyCode: currency,
                        status: 'DRAFT',
                        approvalStatus: 'POSTED',
                        requiresApproval: false,
                        documentType: 'SD_REVENUE',
                        documentTypeId: fiDocType?.id ?? null,
                        documentNumber,
                        sourceModule: 'SD',
                        sourceDocumentType: 'POS_COLLECTION',
                        sourceDocumentId: event.collectionId,
                        sourcePostingKey: idempotencyKey,
                        description: `POS collection · ${event.collectionNumber} · ${event.orderNumber}`,
                        headerText: `POS collection · ${event.collectionNumber}`,
                        postedAt: null,
                        postedBy: null,
                    },
                })
                await tx.ficoJournalEntryLine.createMany({
                    data: rawLines.map((line) => ({
                        journalEntryId: entry.id,
                        lineNumber: line.lineNumber,
                        glAccountId: line.glAccountId,
                        companyId: event.companyId,
                        debitAmount: line.debitAmount,
                        creditAmount: line.creditAmount,
                        currency,
                        description: line.description,
                    })),
                })
                await tx.ficoJournalEntry.update({
                    where: { id: entry.id },
                    data: {
                        status: 'POSTED',
                        postedAt: new Date(),
                    },
                })
                return entry
            })

            this.logger.log(
                `Collection journal ${journal.id} posted for ${event.collectionNumber}: ₱${totalDebit}`,
            )
        } catch (err) {
            this.logger.error(
                `Collection posting failed for ${event.collectionNumber}: ${err instanceof Error ? err.message : String(err)}`,
            )
        }
    }

    /** SD emits `{ payload }`; tests may pass the bare payload. */
    private unwrapPayload<T extends object>(
        envelope: T | { payload?: T },
    ): T | null {
        if (!envelope || typeof envelope !== 'object') return null
        if (
            'payload' in envelope &&
            envelope.payload &&
            typeof envelope.payload === 'object'
        ) {
            return envelope.payload
        }
        return envelope as T
    }

    /**
     * Prefer company FicoDocumentType number range (SI/OR/CR), else legacy JE sequence.
     */
    private async nextDocumentNumber(
        tx: Prisma.TransactionClient,
        companyId: string,
        fiscalYear: number,
        documentTypeCode?: string,
        fallbackPrefix?: string | null,
    ): Promise<string> {
        if (documentTypeCode) {
            const companyDocType = await tx.ficoDocumentType.findUnique({
                where: {
                    companyId_code: { companyId, code: documentTypeCode },
                },
                select: {
                    numberRange: {
                        select: {
                            id: true,
                            prefix: true,
                            suffix: true,
                            currentNumber: true,
                            endNumber: true,
                            paddingLength: true,
                            status: true,
                        },
                    },
                },
            })
            const range = companyDocType?.numberRange
            if (
                range &&
                range.status === 'ACTIVE' &&
                range.currentNumber <= range.endNumber
            ) {
                const seq = range.currentNumber
                await tx.ficoNumberRange.update({
                    where: { id: range.id },
                    data: {
                        currentNumber: seq + 1,
                        status: seq + 1 > range.endNumber ? 'EXHAUSTED' : 'ACTIVE',
                    },
                })
                return `${range.prefix}${String(seq).padStart(range.paddingLength, '0')}${range.suffix}`
            }
        }

        const prefix = fallbackPrefix?.trim() || 'JE'
        const sequence = await tx.ficoDocumentSequence.upsert({
            where: {
                companyId_documentType_fiscalYear: {
                    companyId,
                    documentType: 'JOURNAL',
                    fiscalYear,
                },
            },
            create: {
                companyId,
                documentType: 'JOURNAL',
                fiscalYear,
                prefix,
                nextNumber: 1,
                padding: 6,
            },
            update: {
                nextNumber: { increment: 1 },
            },
        })
        return `${sequence.prefix}${String(sequence.nextNumber).padStart(sequence.padding, '0')}`
    }
}
