import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import type { AuthRequestUser } from '../auth/auth.decorator'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { PrismaService } from '../prisma/prisma.service'
import {
    CreateFicoArAdjustmentDto,
    CreateFicoArCollectionDto,
    FicoArDashboardQueryDto,
    FicoArOpenItemQueryDto,
} from './dto/fico-accounts-receivable.dto'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoJournalService } from './fico-journal.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import { FicoSdPostingService } from './fico-sd-posting.service'
import { FicoTreasuryPaymentResolutionService } from './fico-treasury-payment-resolution.service'
import {
    companyDefaultForSdRole,
    loadCompanyGlDefaults,
} from './fico-company-gl-defaults'

type Actor = AuthRequestUser | undefined
const MONEY_TOLERANCE = new Decimal('0.01')

function day(value: Date | string) {
    const date = typeof value === 'string' ? new Date(value) : new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('A valid posting date is required.')
    }
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
}

function money(value: Decimal | Prisma.Decimal | number | string | null | undefined) {
    return new Decimal(value?.toString?.() ?? value ?? 0)
}

type JournalResult = {
    created: boolean
    duplicate: boolean
    journalEntryId?: string
    documentNumber?: string
}

@Injectable()
export class FicoAccountsReceivableService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly accountResolution: FicoAccountResolutionService,
        private readonly postingValidation: FicoPostingValidationService,
        private readonly journal: FicoJournalService,
        private readonly sdPosting: FicoSdPostingService,
        private readonly treasuryPayment: FicoTreasuryPaymentResolutionService,
    ) {}

    supportsAccountingPayload(payload: MmAccountingDispatchPayload) {
        return (
            this.sdPosting.isSdAccountingPayload(payload) &&
            [
                'PosSaleCompleted',
                'PosCollectionCompleted',
                'SdSalesInvoicePosted',
                'SdCustomerCollection',
                'PosSaleRefunded',
                'PosCustomerDepositCompleted',
                'SdSalesReturnCreditMemo',
            ].includes(payload.eventType)
        )
    }

    /** SD accounting dispatch → journal + optional AR subledger (open items). */
    async postFromAccountingEvent(
        payload: MmAccountingDispatchPayload,
    ): Promise<JournalResult> {
        if (payload.eventType === 'PosSaleCompleted') {
            const outstanding = money(
                (payload as MmAccountingDispatchPayload & { outstandingBalance?: string })
                    .outstandingBalance ?? 0,
            )
            if (!outstanding.gt(0)) {
                return this.journal.createFromAccountingEvent(payload)
            }
            return this.postPosSaleWithReceivable(payload)
        }
        if (payload.eventType === 'PosCollectionCompleted') {
            return this.postPosCollection(payload)
        }
        if (payload.eventType === 'SdSalesInvoicePosted') {
            return this.postSdSalesInvoice(payload)
        }
        if (payload.eventType === 'SdCustomerCollection') {
            return this.postSdInvoiceCollection(payload)
        }
        if (payload.eventType === 'PosSaleRefunded') {
            return this.journal.createFromAccountingEvent(payload)
        }
        if (payload.eventType === 'PosCustomerDepositCompleted') {
            return this.postPosCustomerDeposit(payload)
        }
        if (payload.eventType === 'SdSalesReturnCreditMemo') {
            return this.postSalesReturnCreditMemo(payload)
        }
        throw new BadRequestException(`Unsupported AR accounting event ${payload.eventType}.`)
    }

    async listOpenItems(query: FicoArOpenItemQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)
        const asOfDate = query.asOfDate ? day(query.asOfDate) : day(new Date())
        const where: Prisma.FicoArOpenItemWhereInput = {
            companyId: query.companyId,
            ...(query.customerId ? { customerId: query.customerId } : {}),
            ...(query.status
                ? { status: query.status }
                : { status: { in: ['OPEN', 'PARTIALLY_CLEARED'] } }),
        }
        if (query.overdueOnly) {
            where.dueDate = { lt: asOfDate }
        }
        return this.prisma.ficoArOpenItem.findMany({
            where,
            include: {
                customer: {
                    select: {
                        id: true,
                        customerNumber: true,
                        companyName: true,
                        contactName: true,
                    },
                },
                document: {
                    select: {
                        id: true,
                        documentType: true,
                        status: true,
                        referenceNumber: true,
                        postingDate: true,
                        journalEntryId: true,
                        sourceSalesOrderId: true,
                    },
                },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        })
    }

    async getDashboard(query: FicoArDashboardQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)
        const asOfDate = day(query.asOfDate ?? new Date())
        const fromDate = query.fromDate ? day(query.fromDate) : null
        const toDate = query.toDate ? day(query.toDate) : null
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId: query.companyId },
            select: { baseCurrency: true },
        })
        const baseCurrency = settings?.baseCurrency ?? 'PHP'

        const [openItems, collections, exceptions] = await Promise.all([
            this.prisma.ficoArOpenItem.findMany({
                where: {
                    companyId: query.companyId,
                    status: { in: ['OPEN', 'PARTIALLY_CLEARED'] },
                },
            }),
            fromDate && toDate
                ? this.prisma.ficoArPayment.aggregate({
                      where: {
                          companyId: query.companyId,
                          status: 'POSTED',
                          paymentDate: { gte: fromDate, lte: toDate },
                      },
                      _sum: { totalAmount: true },
                      _count: true,
                  })
                : Promise.resolve({ _sum: { totalAmount: null }, _count: 0 }),
            this.prisma.mmAccountingEvent.count({
                where: {
                    companyId: query.companyId,
                    sourceModule: 'SD',
                    status: { in: ['FAILED', 'DEAD_LETTER', 'PENDING'] },
                },
            }),
        ])

        let totalOutstanding = new Decimal(0)
        let totalOverdue = new Decimal(0)
        let advanceBalance = new Decimal(0)
        let unappliedBalance = new Decimal(0)

        for (const item of openItems) {
            const amount = money(item.openAmount)
            if (item.direction === 'DEBIT') {
                totalOutstanding = totalOutstanding.plus(amount)
                const anchor = item.dueDate ?? item.baselineDate
                if (asOfDate > anchor) totalOverdue = totalOverdue.plus(amount)
                if (item.itemType === 'UNAPPLIED_RECEIPT') {
                    unappliedBalance = unappliedBalance.plus(amount)
                }
            } else if (item.itemType === 'ADVANCE' || item.itemType === 'CREDIT_MEMO') {
                advanceBalance = advanceBalance.plus(amount)
            }
        }

        const profiles = await this.prisma.ficoArCreditProfile.findMany({
            where: { companyId: query.companyId },
            select: { creditLimit: true, creditExposure: true, availableCredit: true },
        })
        const creditLimit = profiles.reduce(
            (s, p) => s.plus(money(p.creditLimit)),
            new Decimal(0),
        )
        const creditExposure = profiles.reduce(
            (s, p) => s.plus(money(p.creditExposure)),
            new Decimal(0),
        )

        return {
            companyId: query.companyId,
            baseCurrency,
            asOfDate,
            totalOutstanding: totalOutstanding.toString(),
            totalOverdue: totalOverdue.toString(),
            collectionsInPeriod: money(collections._sum.totalAmount).toString(),
            collectionsCount: collections._count,
            customerAdvanceBalance: advanceBalance.toString(),
            unappliedReceiptBalance: unappliedBalance.toString(),
            creditLimit: creditLimit.toString(),
            creditExposure: creditExposure.toString(),
            availableCredit: creditLimit.minus(creditExposure).toString(),
            postingExceptions: exceptions,
        }
    }

    async reconcileToGeneralLedger(companyId: string, user: Actor) {
        await this.access.assertAccess(user, companyId)
        const accounts = await this.prisma.ficoGlAccount.findMany({
            where: { isReconciliationAccount: true, reconciliationType: 'AR' },
            select: { id: true, accountCode: true, accountName: true },
        })
        const accountIds = accounts.map((a) => a.id)
        if (!accountIds.length) return { companyId, accounts: [], difference: new Decimal(0) }

        const [ledgerRows, items] = await Promise.all([
            this.prisma.ficoJournalEntryLine.groupBy({
                by: ['glAccountId'],
                where: {
                    companyId,
                    glAccountId: { in: accountIds },
                    journalEntry: { status: 'POSTED' },
                },
                _sum: { debitAmount: true, creditAmount: true },
            }),
            this.prisma.ficoArOpenItem.findMany({
                where: {
                    companyId,
                    reconciliationAccountId: { in: accountIds },
                    status: { in: ['OPEN', 'PARTIALLY_CLEARED'] },
                },
                select: {
                    reconciliationAccountId: true,
                    direction: true,
                    openAmount: true,
                },
            }),
        ])
        const ledgerMap = new Map(
            ledgerRows.map((row) => [
                row.glAccountId,
                money(row._sum.debitAmount).minus(money(row._sum.creditAmount)),
            ]),
        )
        const subMap = new Map<string, Decimal>()
        for (const item of items) {
            if (!item.reconciliationAccountId) continue
            const signed =
                item.direction === 'DEBIT'
                    ? money(item.openAmount)
                    : money(item.openAmount).negated()
            subMap.set(
                item.reconciliationAccountId,
                (subMap.get(item.reconciliationAccountId) ?? new Decimal(0)).plus(signed),
            )
        }
        const rows = accounts.map((account) => {
            const generalLedgerBalance = ledgerMap.get(account.id) ?? new Decimal(0)
            const subledgerBalance = subMap.get(account.id) ?? new Decimal(0)
            return {
                ...account,
                generalLedgerBalance,
                subledgerBalance,
                difference: generalLedgerBalance.minus(subledgerBalance),
            }
        })
        return {
            companyId,
            accounts: rows,
            difference: rows.reduce((t, r) => t.plus(r.difference), new Decimal(0)),
            reconciled: rows.every((r) => r.difference.abs().lte(MONEY_TOLERANCE)),
        }
    }

    async postCollection(dto: CreateFicoArCollectionDto, user: Actor) {
        await this.access.assertAccess(user, dto.companyId)
        return this.postCustomerCollection(dto, user)
    }

    async upsertCustomerCompanyAccount(
        customerId: string,
        dto: import('./dto/fico-accounts-receivable.dto').UpsertCustomerCompanyAccountDto,
        user: Actor,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        const data = {
            customerAccountGroup: dto.customerAccountGroup?.trim() || 'STANDARD',
            reconciliationAccountId: dto.reconciliationAccountId ?? null,
            paymentTermsId: dto.paymentTermsId ?? null,
            creditLimit:
                dto.creditLimit === null || dto.creditLimit === undefined
                    ? null
                    : money(dto.creditLimit),
            postingBlocked: dto.postingBlocked === true,
            collectionBlocked: dto.collectionBlocked === true,
            status: dto.status ?? 'ACTIVE',
            updatedBy: user?.id ?? null,
        }
        return this.prisma.ficoCustomerCompanyAccount.upsert({
            where: {
                customerId_companyId: { customerId, companyId: dto.companyId },
            },
            create: {
                customerId,
                companyId: dto.companyId,
                ...data,
                createdBy: user?.id ?? null,
            },
            update: data,
        })
    }

    private async postPosSaleWithReceivable(
        payload: MmAccountingDispatchPayload,
    ): Promise<JournalResult> {
        const sale = payload as MmAccountingDispatchPayload & {
            salesOrderId: string
            orderNumber: string
            outstandingBalance?: string
        }
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: sale.salesOrderId },
            select: {
                customerId: true,
                orderNumber: true,
                totalAmount: true,
                taxAmount: true,
                lines: { select: { taxAmount: true } },
            },
        })
        if (!order?.customerId) {
            throw new BadRequestException('POS sale requires a customer for receivable posting.')
        }
        const outstanding = money(sale.outstandingBalance ?? 0)
        const payloadSale = sale as {
            totalAmount?: string | number
            taxAmount?: string | number
        }
        const lineTaxTotal = order.lines.reduce(
            (sum, line) => sum.plus(line.taxAmount ?? 0),
            new Decimal(0),
        )
        const invoiceGross = money(
            order.totalAmount ?? payloadSale.totalAmount ?? 0,
        )
        const headerTax = money(order.taxAmount ?? payloadSale.taxAmount ?? 0)
        const invoiceTax = headerTax.gt(0) ? headerTax : lineTaxTotal
        const invoiceNet = invoiceGross.minus(invoiceTax)
        const postingDate = day(payload.postingDate)
        const flatLines = await this.sdPosting.resolveFlatLines(payload)
        const idempotencyKey =
            payload.idempotencyKey ??
            `PosSaleCompleted:${payload.documentType}:${payload.documentId}`

        const reconciliation = await this.resolveCustomerReconciliation({
            companyId: payload.companyId,
            customerId: order.customerId,
            postingDate,
            currencyCode: payload.currencyCode,
        })

        let documentId: string | null = null
        const result = await this.journal.postAutomaticJournal({
            companyId: payload.companyId,
            documentType: 'SD_REVENUE',
            documentDate: postingDate,
            postingDate,
            currencyCode: payload.currencyCode,
            sourceModule: 'SD',
            sourceDocumentType: payload.documentType,
            sourceDocumentId: payload.documentId,
            customerId: order.customerId,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `POS sale ${sale.orderNumber}`,
            reference: sale.orderNumber,
            lines: flatLines.map((line) => ({
                glAccountId: line.glAccountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
            })),
            metadata: { arSubledger: true, salesOrderId: sale.salesOrderId },
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            subledgerPosting: 'AR',
            afterPersist: async (tx, journalEntry) => {
                const dueDate = this.addDays(postingDate, 30)
                const document = await tx.ficoArDocument.create({
                    data: {
                        companyId: payload.companyId,
                        customerId: order.customerId,
                        journalEntryId: journalEntry.id,
                        sourceSalesOrderId: sale.salesOrderId,
                        documentType: 'INVOICE',
                        status: 'POSTED',
                        referenceNumber: sale.orderNumber,
                        documentDate: postingDate,
                        postingDate,
                        baselineDate: postingDate,
                        dueDate,
                        currencyCode: payload.currencyCode,
                        netAmount: invoiceNet,
                        taxAmount: invoiceTax,
                        grossAmount: invoiceGross,
                        receivableAmount: invoiceGross,
                        reconciliationAccountId: reconciliation.glAccountId,
                        reconciliationAccountCode: reconciliation.accountCode,
                    },
                })
                documentId = document.id
                await tx.ficoArOpenItem.create({
                    data: {
                        companyId: payload.companyId,
                        customerId: order.customerId,
                        documentId: document.id,
                        reconciliationAccountId: reconciliation.glAccountId,
                        itemType: 'INVOICE',
                        direction: 'DEBIT',
                        originalAmount: invoiceGross,
                        openAmount: outstanding,
                        currencyCode: payload.currencyCode,
                        baselineDate: postingDate,
                        dueDate,
                        status: 'OPEN',
                    },
                })
            },
        })
        if (documentId) {
            await this.recalculateCreditExposure(payload.companyId, order.customerId)
        }
        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
            documentNumber: result.documentNumber,
        }
    }

    private async postPosCollection(
        payload: MmAccountingDispatchPayload,
    ): Promise<JournalResult> {
        const data = payload as MmAccountingDispatchPayload & {
            customerId?: string
            collectedAmount: string
            salesOrderId: string
            collectionNumber: string
            orderNumber: string
            tenders?: Array<{ method: string; amount: string }>
        }
        let customerId = data.customerId
        if (!customerId) {
            const order = await this.prisma.sdSalesOrder.findUnique({
                where: { id: data.salesOrderId },
                select: { customerId: true },
            })
            customerId = order?.customerId ?? undefined
        }
        if (!customerId) {
            throw new BadRequestException('POS collection requires a customer id.')
        }
        const collected = money(data.collectedAmount)
        const postingDate = day(payload.postingDate)
        const flatLines = await this.sdPosting.resolveFlatLines(payload)
        const idempotencyKey =
            payload.idempotencyKey ?? `PosCollection:${data.collectionNumber}`

        const openItems = await this.prisma.ficoArOpenItem.findMany({
                where: {
                companyId: payload.companyId,
                customerId,
                status: { in: ['OPEN', 'PARTIALLY_CLEARED'] },
                direction: 'DEBIT',
                document: { sourceSalesOrderId: data.salesOrderId },
            },
            orderBy: { dueDate: 'asc' },
        })
        let remaining = collected
        const allocations: Array<{ openItemId: string; amount: Decimal }> = []
        for (const item of openItems) {
            if (!remaining.gt(0)) break
            const apply = Decimal.min(money(item.openAmount), remaining)
            if (apply.gt(0)) {
                allocations.push({ openItemId: item.id, amount: apply })
                remaining = remaining.minus(apply)
            }
        }

        let paymentId: string | null = null
        const result = await this.journal.postAutomaticJournal({
            companyId: payload.companyId,
            documentType: 'SD_COLLECTION',
            documentDate: postingDate,
            postingDate,
            currencyCode: payload.currencyCode,
            sourceModule: 'SD',
            sourceDocumentType: payload.documentType,
            sourceDocumentId: payload.documentId,
            customerId,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Collection ${data.collectionNumber}`,
            reference: data.orderNumber,
            lines: flatLines.map((line) => ({
                glAccountId: line.glAccountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
            })),
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            subledgerPosting: 'AR',
            afterPersist: async (tx, journalEntry) => {
                const payment = await tx.ficoArPayment.create({
                    data: {
                        companyId: payload.companyId,
                        customerId,
                        journalEntryId: journalEntry.id,
                        paymentNumber: `RCV-${journalEntry.documentNumber ?? journalEntry.id}`,
                        idempotencyKey,
                        paymentDate: postingDate,
                        currencyCode: payload.currencyCode,
                        totalAmount: collected,
                        allocatedAmount: collected.minus(remaining),
                        unallocatedAmount: remaining,
                        status: 'POSTED',
                    },
                })
                paymentId = payment.id
                for (const allocation of allocations) {
                    const openItem = openItems.find((i) => i.id === allocation.openItemId)!
                    const next = money(openItem.openAmount).minus(allocation.amount)
                    await tx.ficoArPaymentAllocation.create({
                        data: {
                            paymentId: payment.id,
                            openItemId: openItem.id,
                            amount: allocation.amount,
                            status: 'CLEARED',
                        },
                    })
                    await tx.ficoArOpenItem.update({
                        where: { id: openItem.id },
                        data: {
                            openAmount: next,
                            status: next.eq(0) ? 'CLEARED' : 'PARTIALLY_CLEARED',
                            clearedAt: next.eq(0) ? postingDate : null,
                        },
                    })
                }
                if (remaining.gt(0)) {
                    const reconciliation = await this.resolveCustomerReconciliation({
                        companyId: payload.companyId,
                        customerId,
                        postingDate,
                        currencyCode: payload.currencyCode,
                    })
                    const unappliedDoc = await tx.ficoArDocument.create({
                        data: {
                            companyId: payload.companyId,
                            customerId,
                            journalEntryId: journalEntry.id,
                            documentType: 'UNAPPLIED_RECEIPT',
                            status: 'POSTED',
                            referenceNumber: data.collectionNumber,
                            documentDate: postingDate,
                            postingDate,
                            baselineDate: postingDate,
                            currencyCode: payload.currencyCode,
                            netAmount: remaining,
                            taxAmount: new Decimal(0),
                            grossAmount: remaining,
                            receivableAmount: remaining,
                            reconciliationAccountId: reconciliation.glAccountId,
                            reconciliationAccountCode: reconciliation.accountCode,
                        },
                    })
                    await tx.ficoArOpenItem.create({
                        data: {
                            companyId: payload.companyId,
                            customerId,
                            documentId: unappliedDoc.id,
                            reconciliationAccountId: reconciliation.glAccountId,
                            itemType: 'UNAPPLIED_RECEIPT',
                            direction: 'DEBIT',
                            originalAmount: remaining,
                            openAmount: remaining,
                            currencyCode: payload.currencyCode,
                            baselineDate: postingDate,
                            status: 'OPEN',
                        },
                    })
                }
            },
        })
        if (paymentId) {
            await this.recalculateCreditExposure(payload.companyId, customerId)
        }
        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
            documentNumber: result.documentNumber,
        }
    }

    private async postSdInvoiceCollection(
        payload: MmAccountingDispatchPayload,
    ): Promise<JournalResult> {
        const data = payload as MmAccountingDispatchPayload & {
            salesInvoiceId: string
            customerId: string
            collectedAmount: string
            invoiceNumber: string
            salesOrderId: string
        }
        const collected = money(data.collectedAmount)
        const postingDate = day(payload.postingDate)
        const flatLines = await this.sdPosting.resolveFlatLines(payload)
        const idempotencyKey =
            payload.idempotencyKey ?? `SdCustomerCollection:${data.salesInvoiceId}`

        const openItems = await this.prisma.ficoArOpenItem.findMany({
            where: {
                companyId: payload.companyId,
                customerId: data.customerId,
                status: { in: ['OPEN', 'PARTIALLY_CLEARED'] },
                direction: 'DEBIT',
                document: { sourceSalesInvoiceId: data.salesInvoiceId },
            },
            orderBy: { dueDate: 'asc' },
        })
        let remaining = collected
        const allocations: Array<{ openItemId: string; amount: Decimal }> = []
        for (const item of openItems) {
            if (!remaining.gt(0)) break
            const apply = Decimal.min(money(item.openAmount), remaining)
            if (apply.gt(0)) {
                allocations.push({ openItemId: item.id, amount: apply })
                remaining = remaining.minus(apply)
            }
        }

        const result = await this.journal.postAutomaticJournal({
            companyId: payload.companyId,
            documentType: 'SD_COLLECTION',
            documentDate: postingDate,
            postingDate,
            currencyCode: payload.currencyCode,
            sourceModule: 'SD',
            sourceDocumentType: payload.documentType,
            sourceDocumentId: payload.documentId,
            customerId: data.customerId,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Invoice payment ${data.invoiceNumber}`,
            reference: data.invoiceNumber,
            lines: flatLines.map((line) => ({
                glAccountId: line.glAccountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
            })),
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            subledgerPosting: 'AR',
            afterPersist: async (tx, journalEntry) => {
                const payment = await tx.ficoArPayment.create({
                    data: {
                        companyId: payload.companyId,
                        customerId: data.customerId,
                        journalEntryId: journalEntry.id,
                        paymentNumber: `RCV-${journalEntry.documentNumber ?? journalEntry.id}`,
                        idempotencyKey,
                        paymentDate: postingDate,
                        currencyCode: payload.currencyCode,
                        totalAmount: collected,
                        allocatedAmount: collected.minus(remaining),
                        unallocatedAmount: remaining,
                        status: 'POSTED',
                    },
                })
                for (const allocation of allocations) {
                    const openItem = openItems.find((i) => i.id === allocation.openItemId)!
                    const next = money(openItem.openAmount).minus(allocation.amount)
                    await tx.ficoArPaymentAllocation.create({
                        data: {
                            paymentId: payment.id,
                            openItemId: openItem.id,
                            amount: allocation.amount,
                            status: 'CLEARED',
                        },
                    })
                    await tx.ficoArOpenItem.update({
                        where: { id: openItem.id },
                        data: {
                            openAmount: next,
                            status: next.eq(0) ? 'CLEARED' : 'PARTIALLY_CLEARED',
                            clearedAt: next.eq(0) ? postingDate : null,
                        },
                    })
                }
            },
        })
        await this.recalculateCreditExposure(payload.companyId, data.customerId)
        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
            documentNumber: result.documentNumber,
        }
    }

    private async postPosCustomerDeposit(
        payload: MmAccountingDispatchPayload,
    ): Promise<JournalResult> {
        const data = payload as MmAccountingDispatchPayload & {
            depositAmount: string
            reference: string
            customerId: string
            depositId: string
        }
        const amount = money(data.depositAmount)
        const postingDate = day(payload.postingDate)
        const flatLines = await this.sdPosting.resolveFlatLines(payload)
        const idempotencyKey =
            payload.idempotencyKey ?? `PosCustomerDeposit:${data.depositId}`
        const advance = await this.resolveRuleLine({
            companyId: payload.companyId,
            postingDate,
            currencyCode: payload.currencyCode,
            key: 'CUSTOMER_ADVANCE',
            side: 'CREDIT',
        })

        const result = await this.journal.postAutomaticJournal({
            companyId: payload.companyId,
            documentType: 'AR_ADVANCE',
            documentDate: postingDate,
            postingDate,
            currencyCode: payload.currencyCode,
            sourceModule: 'SD',
            sourceDocumentType: payload.documentType,
            sourceDocumentId: payload.documentId,
            customerId: data.customerId,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Customer deposit ${data.reference}`,
            reference: data.reference,
            lines: flatLines.map((line) => ({
                glAccountId: line.glAccountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
            })),
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            subledgerPosting: 'AR',
            afterPersist: async (tx, journalEntry) => {
                const document = await tx.ficoArDocument.create({
                    data: {
                        companyId: payload.companyId,
                        customerId: data.customerId,
                        journalEntryId: journalEntry.id,
                        documentType: 'ADVANCE',
                        status: 'POSTED',
                        referenceNumber: data.reference,
                        documentDate: postingDate,
                        postingDate,
                        baselineDate: postingDate,
                        currencyCode: payload.currencyCode,
                        netAmount: amount,
                        taxAmount: new Decimal(0),
                        grossAmount: amount,
                        receivableAmount: amount,
                        reconciliationAccountId: advance.glAccountId,
                        reconciliationAccountCode: advance.accountCode,
                    },
                })
                await tx.ficoArOpenItem.create({
                    data: {
                        companyId: payload.companyId,
                        customerId: data.customerId,
                        documentId: document.id,
                        reconciliationAccountId: advance.glAccountId,
                        itemType: 'ADVANCE',
                        direction: 'CREDIT',
                        originalAmount: amount,
                        openAmount: amount,
                        currencyCode: payload.currencyCode,
                        baselineDate: postingDate,
                        status: 'OPEN',
                    },
                })
            },
        })
        await this.recalculateCreditExposure(payload.companyId, data.customerId)
        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
            documentNumber: result.documentNumber,
        }
    }

    private async postSalesReturnCreditMemo(
        payload: MmAccountingDispatchPayload,
    ): Promise<JournalResult> {
        const data = payload as MmAccountingDispatchPayload & {
            salesReturnId: string
            returnNumber: string
            customerId: string
            creditAmount: string
            salesOrderId: string
        }
        const amount = money(data.creditAmount)
        if (!amount.gt(0)) {
            return { created: false, duplicate: false }
        }
        const existing = await this.prisma.ficoArDocument.findFirst({
            where: {
                companyId: payload.companyId,
                referenceNumber: data.returnNumber,
                documentType: 'CREDIT_MEMO',
            },
        })
        if (existing?.journalEntryId) {
            return {
                created: false,
                duplicate: true,
                journalEntryId: existing.journalEntryId,
            }
        }
        const postingDate = day(payload.postingDate)
        const flatLines = await this.sdPosting.resolveFlatLines(payload)
        const idempotencyKey =
            payload.idempotencyKey ?? `SdSalesReturnCreditMemo:${data.salesReturnId}`
        const reconciliation = await this.resolveCustomerReconciliation({
            companyId: payload.companyId,
            customerId: data.customerId,
            postingDate,
            currencyCode: payload.currencyCode,
        })

        const result = await this.journal.postAutomaticJournal({
            companyId: payload.companyId,
            documentType: 'AR_CREDIT_MEMO',
            documentDate: postingDate,
            postingDate,
            currencyCode: payload.currencyCode,
            sourceModule: 'SD',
            sourceDocumentType: 'SALES_RETURN',
            sourceDocumentId: data.salesReturnId,
            customerId: data.customerId,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Sales return credit ${data.returnNumber}`,
            reference: data.returnNumber,
            lines: flatLines.map((line) => ({
                glAccountId: line.glAccountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
            })),
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            subledgerPosting: 'AR',
            afterPersist: async (tx, journalEntry) => {
                const document = await tx.ficoArDocument.create({
                    data: {
                        companyId: payload.companyId,
                        customerId: data.customerId,
                        sourceSalesOrderId: data.salesOrderId,
                        journalEntryId: journalEntry.id,
                        documentType: 'CREDIT_MEMO',
                        status: 'POSTED',
                        referenceNumber: data.returnNumber,
                        documentDate: postingDate,
                        postingDate,
                        baselineDate: postingDate,
                        currencyCode: payload.currencyCode,
                        netAmount: amount,
                        taxAmount: new Decimal(0),
                        grossAmount: amount,
                        receivableAmount: amount,
                        reconciliationAccountId: reconciliation.glAccountId,
                        reconciliationAccountCode: reconciliation.accountCode,
                    },
                })
                await tx.ficoArOpenItem.create({
                    data: {
                        companyId: payload.companyId,
                        customerId: data.customerId,
                        documentId: document.id,
                        reconciliationAccountId: reconciliation.glAccountId,
                        itemType: 'CREDIT_MEMO',
                        direction: 'CREDIT',
                        originalAmount: amount,
                        openAmount: amount,
                        currencyCode: payload.currencyCode,
                        baselineDate: postingDate,
                        status: 'OPEN',
                    },
                })
            },
        })
        await this.recalculateCreditExposure(payload.companyId, data.customerId)
        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
            documentNumber: result.documentNumber,
        }
    }

    private async postSdSalesInvoice(
        payload: MmAccountingDispatchPayload,
    ): Promise<JournalResult> {
        const invoice = await this.prisma.sdSalesInvoice.findUnique({
            where: { id: payload.documentId },
            include: {
                lines: { orderBy: { lineNumber: 'asc' } },
                salesOrder: { select: { customerId: true, orderNumber: true } },
            },
        })
        if (!invoice?.salesOrder.customerId) {
            throw new NotFoundException('Sales invoice or customer not found.')
        }
        const existing = await this.prisma.ficoArDocument.findUnique({
            where: { sourceSalesInvoiceId: invoice.id },
        })
        if (existing) {
            return {
                created: false,
                duplicate: true,
                journalEntryId: existing.journalEntryId,
            }
        }
        const postingDate = day(payload.postingDate)
        const receivable = money(invoice.totalAmount)
        const customerId = invoice.salesOrder.customerId
        const orderTax = await this.prisma.sdSalesOrder.findUnique({
            where: { id: invoice.salesOrderId },
            select: { lines: { select: { taxAmount: true } } },
        })
        const totalVat =
            orderTax?.lines.reduce(
                (sum, line) => sum.plus(money(line.taxAmount)),
                new Decimal(0),
            ) ?? new Decimal(0)
        const netRevenue = receivable.minus(totalVat)
        const reconciliation = await this.resolveCustomerReconciliation({
            companyId: invoice.companyId,
            customerId,
            postingDate,
            currencyCode: invoice.currency,
        })
        const revenue = await this.resolveRuleLine({
            companyId: invoice.companyId,
            postingDate,
            currencyCode: invoice.currency,
            key: 'SALES_REVENUE',
            side: 'CREDIT',
        })
        const lines = [
            {
                glAccountId: reconciliation.glAccountId,
                debit: receivable,
                credit: new Decimal(0),
                description: 'Customer receivable',
            },
            {
                glAccountId: revenue.glAccountId,
                debit: new Decimal(0),
                credit: netRevenue,
                description: `Revenue · ${invoice.invoiceNumber}`,
            },
        ]
        if (totalVat.gt(0)) {
            const tax = await this.resolveRuleLine({
                companyId: invoice.companyId,
                postingDate,
                currencyCode: invoice.currency,
                key: 'OUTPUT_TAX',
                side: 'CREDIT',
            })
            lines.push({
                glAccountId: tax.glAccountId,
                debit: new Decimal(0),
                credit: totalVat,
                description: `Output tax · ${invoice.invoiceNumber}`,
            })
        }
        const idempotencyKey =
            payload.idempotencyKey ?? `SdSalesInvoicePosted:${invoice.id}`
        const dueDate = this.addDays(postingDate, 30)

        const journalResult = await this.journal.postAutomaticJournal({
            companyId: invoice.companyId,
            documentType: 'CUSTOMER_INVOICE',
            documentDate: postingDate,
            postingDate,
            currencyCode: invoice.currency,
            sourceModule: 'SD',
            sourceDocumentType: 'SALES_INVOICE',
            sourceDocumentId: invoice.id,
            customerId,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Customer invoice ${invoice.invoiceNumber}`,
            reference: invoice.invoiceNumber,
            lines,
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            subledgerPosting: 'AR',
            afterPersist: async (tx, journalEntry) => {
                const document = await tx.ficoArDocument.create({
                    data: {
                        companyId: invoice.companyId,
                        customerId,
                        sourceSalesInvoiceId: invoice.id,
                        sourceSalesOrderId: invoice.salesOrderId,
                        journalEntryId: journalEntry.id,
                        documentType: 'INVOICE',
                        status: 'POSTED',
                        referenceNumber: invoice.invoiceNumber,
                        documentDate: postingDate,
                        postingDate,
                        baselineDate: postingDate,
                        dueDate,
                        currencyCode: invoice.currency,
                        netAmount: netRevenue,
                        taxAmount: totalVat,
                        grossAmount: receivable,
                        receivableAmount: receivable,
                        reconciliationAccountId: reconciliation.glAccountId,
                        reconciliationAccountCode: reconciliation.accountCode,
                        lines: {
                            create: invoice.lines.map((line) => ({
                                lineNumber: line.lineNumber,
                                description: line.description,
                                quantity: line.quantity,
                                unitPrice: line.unitPrice,
                                netAmount: line.lineTotal,
                                taxAmount: new Decimal(0),
                                lineTotal: line.lineTotal,
                                sourceSalesInvoiceLineId: line.id,
                            })),
                        },
                    },
                })
                await tx.ficoArOpenItem.create({
                    data: {
                        companyId: invoice.companyId,
                        customerId,
                        documentId: document.id,
                        reconciliationAccountId: reconciliation.glAccountId,
                        itemType: 'INVOICE',
                        direction: 'DEBIT',
                        originalAmount: receivable,
                        openAmount: receivable,
                        currencyCode: invoice.currency,
                        baselineDate: postingDate,
                        dueDate,
                        status: 'OPEN',
                    },
                })
            },
        })
        await this.recalculateCreditExposure(invoice.companyId, customerId)
        return {
            created: journalResult.created,
            duplicate: journalResult.duplicate,
            journalEntryId: journalResult.journalEntryId,
            documentNumber: journalResult.documentNumber,
        }
    }

    private async postCustomerCollection(dto: CreateFicoArCollectionDto, user: Actor) {
        const postingDate = day(dto.paymentDate)
        const totalAmount = money(dto.totalAmount)
        const allocations = (dto.allocations ?? []).map((a) => ({
            openItemId: a.openItemId,
            amount: money(a.amount),
        }))
        const allocatedTotal = allocations.reduce((s, a) => s.plus(a.amount), new Decimal(0))
        if (allocatedTotal.gt(totalAmount)) {
            throw new BadRequestException('Collection allocations exceed the total amount.')
        }
        const unallocated = totalAmount.minus(allocatedTotal)
        const idempotencyKey = dto.idempotencyKey?.trim()
            ? `AR_COLLECTION:${dto.companyId}:${dto.idempotencyKey.trim()}`
            : `AR_COLLECTION:${dto.companyId}:${dto.customerId}:${dto.paymentDate}:${totalAmount}`

        let bankGl: string
        try {
            bankGl = (
                await this.treasuryPayment.resolvePaymentAccount({
                    companyId: dto.companyId,
                    paymentMethodCode: dto.paymentMethodCode ?? 'CASH',
                    currencyCode: dto.currencyCode,
                    postingDate,
                    treasuryAccountId: dto.treasuryAccountId ?? null,
                    side: 'DEBIT',
                })
            ).glAccountId
        } catch {
            bankGl = (
                await this.resolveRuleLine({
                    companyId: dto.companyId,
                    postingDate,
                    currencyCode: dto.currencyCode,
                    key: 'BANK_ACCOUNT',
                    side: 'DEBIT',
                })
            ).glAccountId
        }
        const reconciliation = await this.resolveCustomerReconciliation({
            companyId: dto.companyId,
            customerId: dto.customerId,
            postingDate,
            currencyCode: dto.currencyCode,
        })

        const creditAr = allocatedTotal.gt(0) ? allocatedTotal : totalAmount
        const lines = [
            {
                glAccountId: bankGl,
                debit: totalAmount,
                credit: new Decimal(0),
                description: 'Customer collection',
            },
            {
                glAccountId: reconciliation.glAccountId,
                debit: new Decimal(0),
                credit: creditAr,
                description: 'AR clearing',
            },
        ]

        await this.journal.postAutomaticJournal({
            companyId: dto.companyId,
            documentType: 'AR_COLLECTION',
            documentDate: postingDate,
            postingDate,
            currencyCode: dto.currencyCode,
            sourceModule: 'AR',
            sourceDocumentType: 'AR_COLLECTION',
            sourceDocumentId: idempotencyKey,
            customerId: dto.customerId,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: 'Customer collection',
            reference: dto.paymentReference ?? null,
            lines,
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            actorUserId: user?.id ?? null,
            subledgerPosting: 'AR',
            afterPersist: async (tx, journalEntry) => {
                const payment = await tx.ficoArPayment.create({
                    data: {
                        companyId: dto.companyId,
                        customerId: dto.customerId,
                        journalEntryId: journalEntry.id,
                        paymentNumber: `RCV-${journalEntry.documentNumber ?? journalEntry.id}`,
                        idempotencyKey,
                        paymentDate: postingDate,
                        currencyCode: dto.currencyCode,
                        totalAmount,
                        allocatedAmount: allocatedTotal,
                        unallocatedAmount: unallocated,
                        paymentMethodCode: dto.paymentMethodCode ?? null,
                        bankAccountId: dto.bankAccountId ?? null,
                        paymentReference: dto.paymentReference ?? null,
                        status: 'POSTED',
                        createdBy: user?.id ?? null,
                    },
                })
                if (allocations.length) {
                    const openItems = await tx.ficoArOpenItem.findMany({
                        where: { id: { in: allocations.map((a) => a.openItemId) } },
                    })
                    for (const allocation of allocations) {
                        const item = openItems.find((i) => i.id === allocation.openItemId)
                        if (!item) continue
                        const next = money(item.openAmount).minus(allocation.amount)
                        await tx.ficoArPaymentAllocation.create({
                            data: {
                                paymentId: payment.id,
                                openItemId: item.id,
                                amount: allocation.amount,
                            },
                        })
                        await tx.ficoArOpenItem.update({
                            where: { id: item.id },
                            data: {
                                openAmount: next,
                                status: next.eq(0) ? 'CLEARED' : 'PARTIALLY_CLEARED',
                                clearedAt: next.eq(0) ? postingDate : null,
                            },
                        })
                    }
                }
            },
        })
        await this.recalculateCreditExposure(dto.companyId, dto.customerId)
        return { ok: true }
    }

    async postAdjustment(dto: CreateFicoArAdjustmentDto, user: Actor) {
        await this.access.assertAccess(user, dto.companyId)
        const postingDate = day(dto.postingDate)
        const amount = money(dto.amount)
        const reconciliation = await this.resolveCustomerReconciliation({
            companyId: dto.companyId,
            customerId: dto.customerId,
            postingDate,
            currencyCode: dto.currencyCode,
        })
        const offset = await this.resolveRuleLine({
            companyId: dto.companyId,
            postingDate,
            currencyCode: dto.currencyCode,
            key:
                dto.documentType === 'WRITE_OFF'
                    ? 'BAD_DEBT_EXPENSE'
                    : dto.documentType === 'CREDIT_MEMO'
                      ? 'SALES_RETURN'
                      : 'AP_ADJUSTMENT',
            side: dto.documentType === 'CREDIT_MEMO' ? 'DEBIT' : 'CREDIT',
        })
        const isDebitMemo = dto.documentType === 'DEBIT_MEMO' || dto.documentType === 'ADVANCE'
        const lines = isDebitMemo
            ? [
                  {
                      glAccountId: reconciliation.glAccountId,
                      debit: amount,
                      credit: new Decimal(0),
                      description: 'Customer receivable',
                  },
                  {
                      glAccountId: offset.glAccountId,
                      debit: new Decimal(0),
                      credit: amount,
                      description: dto.documentType,
                  },
              ]
            : [
                  {
                      glAccountId: offset.glAccountId,
                      debit: amount,
                      credit: new Decimal(0),
                      description: dto.documentType,
                  },
                  {
                      glAccountId: reconciliation.glAccountId,
                      debit: new Decimal(0),
                      credit: amount,
                      description: 'Customer receivable reduction',
                  },
              ]
        const idempotencyKey = `AR_${dto.documentType}:${dto.companyId}:${dto.customerId}:${dto.referenceNumber ?? dto.postingDate}`
        const openDirection = isDebitMemo ? 'DEBIT' : 'CREDIT'
        await this.journal.postAutomaticJournal({
            companyId: dto.companyId,
            documentType: `AR_${dto.documentType}`,
            documentDate: day(dto.documentDate),
            postingDate,
            currencyCode: dto.currencyCode,
            sourceModule: 'AR',
            sourceDocumentType: dto.documentType,
            sourceDocumentId: idempotencyKey,
            customerId: dto.customerId,
            idempotencyKey,
            description: `Customer ${dto.documentType.replaceAll('_', ' ').toLowerCase()}`,
            lines,
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            actorUserId: user?.id ?? null,
            subledgerPosting: 'AR',
            afterPersist: async (tx, journalEntry) => {
                const document = await tx.ficoArDocument.create({
                    data: {
                        companyId: dto.companyId,
                        customerId: dto.customerId,
                        journalEntryId: journalEntry.id,
                        documentType: dto.documentType,
                        status: 'POSTED',
                        referenceNumber: dto.referenceNumber,
                        documentDate: day(dto.documentDate),
                        postingDate,
                        baselineDate: day(dto.documentDate),
                        dueDate: dto.dueDate ? day(dto.dueDate) : null,
                        currencyCode: dto.currencyCode,
                        netAmount: amount,
                        grossAmount: amount,
                        receivableAmount: amount,
                        reconciliationAccountId: reconciliation.glAccountId,
                        reconciliationAccountCode: reconciliation.accountCode,
                    },
                })
                await tx.ficoArOpenItem.create({
                    data: {
                        companyId: dto.companyId,
                        customerId: dto.customerId,
                        documentId: document.id,
                        reconciliationAccountId: reconciliation.glAccountId,
                        itemType: dto.documentType,
                        direction: openDirection,
                        originalAmount: amount,
                        openAmount: amount,
                        currencyCode: dto.currencyCode,
                        baselineDate: day(dto.documentDate),
                        dueDate: dto.dueDate ? day(dto.dueDate) : null,
                        status: 'OPEN',
                    },
                })
            },
        })
        await this.recalculateCreditExposure(dto.companyId, dto.customerId)
        return { ok: true }
    }

    async recalculateCreditExposure(companyId: string, customerId: string) {
        const openItems = await this.prisma.ficoArOpenItem.findMany({
            where: {
                companyId,
                customerId,
                status: { in: ['OPEN', 'PARTIALLY_CLEARED'] },
            },
        })
        let exposure = new Decimal(0)
        for (const item of openItems) {
            if (item.direction === 'DEBIT' && item.itemType !== 'UNAPPLIED_RECEIPT') {
                exposure = exposure.plus(money(item.openAmount))
            }
        }
        const customer = await this.prisma.sdCustomer.findUnique({
            where: { id: customerId },
            select: { creditLimit: true },
        })
        const limit = money(customer?.creditLimit ?? 0)
        const companyAccount = await this.prisma.ficoCustomerCompanyAccount.findUnique({
            where: { customerId_companyId: { customerId, companyId } },
        })
        const configuredLimit = companyAccount?.creditLimit
            ? money(companyAccount.creditLimit)
            : limit
        await this.prisma.ficoArCreditProfile.upsert({
            where: { customerId_companyId: { customerId, companyId } },
            create: {
                customerId,
                companyId,
                creditLimit: configuredLimit,
                creditExposure: exposure,
                availableCredit: Decimal.max(
                    configuredLimit.minus(exposure),
                    new Decimal(0),
                ),
                lastRecalculatedAt: new Date(),
            },
            update: {
                creditLimit: configuredLimit,
                creditExposure: exposure,
                availableCredit: Decimal.max(
                    configuredLimit.minus(exposure),
                    new Decimal(0),
                ),
                lastRecalculatedAt: new Date(),
            },
        })
    }

    private addDays(date: Date, days: number) {
        const next = new Date(date)
        next.setUTCDate(next.getUTCDate() + days)
        return next
    }

    private async resolveCustomerReconciliation(input: {
        companyId: string
        customerId: string
        postingDate: Date
        currencyCode: string
    }) {
        const companyAccount = await this.prisma.ficoCustomerCompanyAccount.findUnique({
            where: {
                customerId_companyId: {
                    customerId: input.customerId,
                    companyId: input.companyId,
                },
            },
        })
        if (companyAccount?.reconciliationAccountId) {
            const account = await this.prisma.ficoGlAccount.findUnique({
                where: { id: companyAccount.reconciliationAccountId },
                select: { id: true, accountCode: true },
            })
            if (account) return { glAccountId: account.id, accountCode: account.accountCode }
        }
        const defaults = await loadCompanyGlDefaults(this.prisma, input.companyId)
        const companyReceivable = companyDefaultForSdRole(
            defaults,
            'ACCOUNTS_RECEIVABLE',
        )
        if (companyReceivable) {
            const account = await this.prisma.ficoGlAccount.findUnique({
                where: { id: companyReceivable },
                select: { id: true, accountCode: true },
            })
            if (account) {
                return { glAccountId: account.id, accountCode: account.accountCode }
            }
        }
        try {
            const line = await this.resolveRuleLine({
                companyId: input.companyId,
                postingDate: input.postingDate,
                currencyCode: input.currencyCode,
                key: 'CUSTOMER_RECON',
                side: 'DEBIT',
            })
            return { glAccountId: line.glAccountId, accountCode: line.accountCode }
        } catch {
            if (companyReceivable) {
                const account = await this.prisma.ficoGlAccount.findUnique({
                    where: { id: companyReceivable },
                    select: { id: true, accountCode: true },
                })
                if (account) {
                    return {
                        glAccountId: account.id,
                        accountCode: account.accountCode,
                    }
                }
            }
            throw new BadRequestException(
                'No customer reconciliation (A/R) account is configured for this company.',
            )
        }
    }

    private async resolveRuleLine(input: {
        companyId: string
        postingDate: Date
        currencyCode: string
        key: string
        side: 'DEBIT' | 'CREDIT'
    }) {
        const resolved = await this.accountResolution.resolveDetermination({
            companyId: input.companyId,
            sourceModule: 'SD',
            postingDate: input.postingDate,
            currencyCode: input.currencyCode,
            transactionKey: input.key,
            dimensions: {},
        })
        const lines =
            input.side === 'DEBIT'
                ? resolved.resolution.debitLines
                : resolved.resolution.creditLines
        const hit = lines[0]
        if (hit?.glAccountId) {
            return { glAccountId: hit.glAccountId, accountCode: hit.accountCode ?? '' }
        }
        if (resolved.glAccountId) {
            const account = await this.prisma.ficoGlAccount.findUnique({
                where: { id: resolved.glAccountId },
                select: { accountCode: true },
            })
            return {
                glAccountId: resolved.glAccountId,
                accountCode: account?.accountCode ?? resolved.glAccountCode ?? '',
            }
        }
        const defaults = await loadCompanyGlDefaults(this.prisma, input.companyId)
        if (input.key === 'CUSTOMER_RECON' || input.key === 'ACCOUNTS_RECEIVABLE') {
            const fallback = companyDefaultForSdRole(defaults, 'ACCOUNTS_RECEIVABLE')
            if (fallback) {
                const account = await this.prisma.ficoGlAccount.findUnique({
                    where: { id: fallback },
                    select: { accountCode: true },
                })
                return { glAccountId: fallback, accountCode: account?.accountCode ?? '' }
            }
        }
        throw new BadRequestException(
            `No ${input.side} account for transaction key ${input.key}.`,
        )
    }
}