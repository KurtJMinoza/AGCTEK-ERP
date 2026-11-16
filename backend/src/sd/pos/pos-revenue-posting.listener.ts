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
    tenders?: Array<{
        method: string
        amount: string
        status?: string
    }>
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
    async handlePosSaleCompleted(event: PosSaleEvent): Promise<void> {
        if (!event?.salesOrderId || !event?.companyId) return

        const idempotencyKey = `pos-revenue:${event.salesOrderId}`

        try {
            // Check the company has active accounting settings
            const settings = await this.prisma.ficoCompanyAccountingSettings.findFirst({
                where: { companyId: event.companyId, status: 'ACTIVE' },
                select: { chartOfAccountsId: true },
            })
            if (!settings?.chartOfAccountsId) {
                this.logger.debug(
                    `Skipping revenue posting for ${event.orderNumber}: no active accounting settings`,
                )
                return
            }

            // Load G/L accounts from the company's chart
            const glAccounts = await this.prisma.ficoGlAccount.findMany({
                where: {
                    chartOfAccountsId: settings.chartOfAccountsId,
                    status: 'ACTIVE',
                    isPostingAccount: true,
                },
                select: { id: true, accountCode: true, accountName: true },
            })
            const glByCode = new Map(glAccounts.map((a) => [a.accountCode, a]))

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

            // Build journal lines
            const journalLines: Array<{
                debitAccountId: string
                creditAccountId: string
                amount: Prisma.Decimal
                transactionKey: string
                materialId: null
                warehouseId: null
            }> = []

            // DEBIT side: one line per tender
            const tenders = event.tenders ?? []
            const revenueAccount = glByCode.get('4000')
            const vatAccount = glByCode.get('2040')

            if (!revenueAccount) {
                this.logger.warn(
                    `Skipping revenue posting for ${event.orderNumber}: G/L 4000 (Sales Revenue) not found`,
                )
                return
            }

            // For each tender, debit the tender's clearing account and credit revenue
            // We'll build raw journal lines since the shape matches createResolvedJournal
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

                const glCode = tenderGlMap[tender.method] ?? '1000'
                const gl = glByCode.get(glCode)
                if (!gl) {
                    this.logger.warn(
                        `G/L account ${glCode} not found for tender ${tender.method}; using 1000`,
                    )
                }
                const accountId = gl?.id ?? glByCode.get('1000')?.id
                if (!accountId) {
                    this.logger.error(
                        `Cannot post revenue for ${event.orderNumber}: no Cash on Hand (1000) account`,
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
                        sourceModule: 'SD',
                        sourceDocumentType: 'SALES_ORDER',
                        sourceDocumentId: event.salesOrderId,
                        sourcePostingKey: idempotencyKey,
                        description: `POS revenue · ${event.receiptNumber ?? event.orderNumber}`,
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
                    data: { status: 'POSTED' },
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
}
