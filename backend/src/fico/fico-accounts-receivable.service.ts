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
import { dueDateFor } from '../sd/sales-invoice-billing'
import {
    CreateFicoArAdjustmentDto,
    CreateFicoArCollectionDto,
    FicoArDashboardQueryDto,
    FicoArDocumentQueryDto,
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
const OPEN_STATUSES = ['OPEN', 'PARTIALLY_CLEARED'] as const

type ArPostingResult = {
    created: boolean
    duplicate: boolean
    skipped?: boolean
    skipReason?: string
    journalEntryId?: string
}

/** Local AR delegates for typed transaction clients. */
type ArDocumentDelegate = {
    findUnique: (args: unknown) => Promise<any>
    findFirst: (args: unknown) => Promise<any>
    findMany: (args: unknown) => Promise<any[]>
    create: (args: unknown) => Promise<any>
    update: (args: unknown) => Promise<any>
}

type ArOpenItemDelegate = {
    findMany: (args: unknown) => Promise<any[]>
    create: (args: unknown) => Promise<any>
    update: (args: unknown) => Promise<any>
}

type ArTx = Prisma.TransactionClient & {
    ficoArDocument: ArDocumentDelegate
    ficoArOpenItem: ArOpenItemDelegate
}

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
        if (
            payload.eventType === 'SalesInvoiceIssued' ||
            payload.eventType === 'SalesInvoicePaid'
        ) {
            return true
        }
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

    async handleAccountingPayload(
        payload: MmAccountingDispatchPayload,
    ): Promise<ArPostingResult> {
        if (payload.eventType === 'SalesInvoiceIssued') {
            return this.postIssuedSalesInvoice(payload)
        }
        if (payload.eventType === 'SalesInvoicePaid') {
            return this.clearPaidSalesInvoice(payload)
        }
        const result = await this.postFromAccountingEvent(payload)
        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
        }
    }

    async postIssuedSalesInvoice(
        payload: MmAccountingDispatchPayload,
    ): Promise<ArPostingResult> {
        if (payload.eventType !== 'SalesInvoiceIssued') {
            throw new BadRequestException(
                `Unsupported AR accounting event ${payload.eventType}.`,
            )
        }

        const invoice = await this.prisma.sdSalesInvoice.findUnique({
            where: { id: payload.documentId },
            include: {
                salesOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        channel: true,
                        customerId: true,
                        customerName: true,
                        lines: { select: { taxAmount: true } },
                    },
                },
            },
        })
        if (!invoice) {
            throw new NotFoundException('Sales invoice source document not found.')
        }
        if (invoice.companyId !== payload.companyId) {
            throw new BadRequestException(
                'Sales invoice company does not match the accounting event.',
            )
        }
        if (!['ISSUED', 'PAID'].includes(invoice.status)) {
            throw new BadRequestException(
                `Sales invoice status ${invoice.status} cannot be posted to Accounts Receivable.`,
            )
        }

        const skip = await this.shouldSkipPosOwnedOrder(invoice.salesOrder)
        if (skip) {
            return {
                created: false,
                duplicate: false,
                skipped: true,
                skipReason: skip,
            }
        }

        const existing = await this.prisma.ficoArDocument.findUnique({
            where: { sourceSalesInvoiceId: invoice.id },
            select: { id: true, status: true, journalEntryId: true },
        })
        if (existing) {
            if (existing.status === 'REVERSED') {
                throw new BadRequestException(
                    'The AR document for this sales invoice was reversed; create a new invoice to repost.',
                )
            }
            return {
                created: false,
                duplicate: true,
                journalEntryId: existing.journalEntryId,
            }
        }

        const customerId = invoice.salesOrder.customerId
        if (!customerId) {
            throw new BadRequestException(
                'Sales invoice has no customer identity for Accounts Receivable.',
            )
        }
        const customer = await this.prisma.sdCustomer.findUnique({
            where: { id: customerId },
            select: { id: true, customerNumber: true, companyName: true },
        })
        if (!customer) {
            throw new BadRequestException(
                'Customer master not found for Accounts Receivable posting.',
            )
        }

        const issuedAt = invoice.issuedAt ?? new Date(payload.postingDate)
        const postingDate = day(issuedAt)
        const documentDate = postingDate
        const baselineDate = postingDate
        const due = dueDateFor(issuedAt)
        const dueDate = due ? day(due) : this.addDays(baselineDate, 30)
        const currencyCode = (
            invoice.currency ||
            payload.currencyCode ||
            'PHP'
        ).toUpperCase()

        const taxAmount = invoice.salesOrder.lines.reduce(
            (sum, line) => sum.plus(line.taxAmount ?? 0),
            new Decimal(0),
        )
        const grossAmount = money(invoice.totalAmount)
        if (!grossAmount.gt(0)) {
            throw new BadRequestException(
                'Sales invoice total must be greater than zero before AR posting.',
            )
        }
        const netAmount = grossAmount.minus(taxAmount)
        if (netAmount.lt(0)) {
            throw new BadRequestException(
                'Sales invoice tax cannot exceed the invoice total.',
            )
        }

        const settings = await this.loadCompanyAccounts(invoice.companyId)
        const receivableAccountId = await this.resolveRuleAccount(
            invoice.companyId,
            postingDate,
            currencyCode,
            'ACCOUNTS_RECEIVABLE',
            'DEBIT',
            settings.defaultReceivableAccountId,
        )
        const receivableGl = await this.prisma.ficoGlAccount.findUnique({
            where: { id: receivableAccountId },
            select: { id: true, accountCode: true, accountName: true },
        })
        if (!receivableGl) {
            throw new BadRequestException('Receivable G/L account was not found.')
        }

        const lines: Array<{
            glAccountId: string
            debit: Decimal
            credit: Decimal
            description: string
        }> = [
            {
                glAccountId: receivableAccountId,
                debit: grossAmount,
                credit: new Decimal(0),
                description: `Accounts receivable · ${invoice.invoiceNumber}`,
            },
        ]
        if (netAmount.gt(0)) {
            const revenueAccountId = await this.resolveRuleAccount(
                invoice.companyId,
                postingDate,
                currencyCode,
                'SALES_REVENUE',
                'CREDIT',
                settings.defaultSalesRevenueAccountId,
            )
            lines.push({
                glAccountId: revenueAccountId,
                debit: new Decimal(0),
                credit: netAmount,
                description: `Sales revenue · ${invoice.invoiceNumber}`,
            })
        }
        if (taxAmount.gt(0)) {
            const taxAccountId = await this.resolveRuleAccount(
                invoice.companyId,
                postingDate,
                currencyCode,
                'OUTPUT_TAX',
                'CREDIT',
                settings.defaultTaxOutputAccountId,
            )
            lines.push({
                glAccountId: taxAccountId,
                debit: new Decimal(0),
                credit: taxAmount,
                description: `Output tax · ${invoice.invoiceNumber}`,
            })
        }

        const idempotencyKey =
            payload.idempotencyKey ?? `sales-invoice-ar:${invoice.id}`

        const result = await this.journal.postAutomaticJournal({
            companyId: invoice.companyId,
            documentType: 'CUSTOMER_INVOICE',
            documentDate,
            postingDate,
            currencyCode,
            sourceModule: 'AR',
            sourceDocumentType: 'SALES_INVOICE',
            sourceDocumentId: invoice.id,
            sourceEventId: payload.sourceEventId ?? null,
            sourceTransactionId:
                typeof payload.sourceTransactionId === 'string'
                    ? payload.sourceTransactionId
                    : null,
            mmAccountingEventId: payload.mmAccountingEventId ?? null,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Customer invoice ${invoice.invoiceNumber}`,
            reference: invoice.invoiceNumber,
            lines,
            metadata: {
                arDocumentType: 'INVOICE',
                salesInvoiceId: invoice.id,
                salesInvoiceNumber: invoice.invoiceNumber,
                salesOrderId: invoice.salesOrderId,
                customerId,
                reconciliationAccountId: receivableGl.id,
                reconciliationAccountCode: receivableGl.accountCode,
                sourceAccountingEventId: payload.mmAccountingEventId ?? null,
            },
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            subledgerPosting: 'AR',
            afterPersist: async (tx, journalEntry) => {
                const arTx = tx as ArTx
                const document = await arTx.ficoArDocument.create({
                    data: {
                        companyId: invoice.companyId,
                        customerId,
                        sourceSalesInvoiceId: invoice.id,
                        journalEntryId: journalEntry.id,
                        documentType: 'INVOICE',
                        status: 'POSTED',
                        referenceNumber: invoice.invoiceNumber,
                        documentDate,
                        postingDate,
                        baselineDate,
                        dueDate,
                        currencyCode,
                        netAmount,
                        taxAmount,
                        grossAmount,
                        receivableAmount: grossAmount,
                        reconciliationAccountId: receivableGl.id,
                        reconciliationAccountCode: receivableGl.accountCode,
                        createdBy: null,
                    },
                })
                await arTx.ficoArOpenItem.create({
                    data: {
                        companyId: invoice.companyId,
                        customerId,
                        documentId: document.id,
                        reconciliationAccountId: receivableGl.id,
                        itemType: 'INVOICE',
                        direction: 'DEBIT',
                        originalAmount: grossAmount,
                        openAmount: grossAmount,
                        currencyCode,
                        baselineDate,
                        dueDate,
                        status: 'OPEN',
                    },
                })
                await arTx.ficoAccountingAuditLog.create({
                    data: {
                        companyId: invoice.companyId,
                        actorId: null,
                        action: 'AR_INVOICE_POST',
                        entityType: 'FicoArDocument',
                        entityId: document.id,
                        newValues: {
                            salesInvoiceId: invoice.id,
                            invoiceNumber: invoice.invoiceNumber,
                            journalEntryId: journalEntry.id,
                            receivableAmount: grossAmount.toString(),
                            dueDate: dueDate.toISOString().slice(0, 10),
                        },
                    },
                })
            },
        })

        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
        }
    }

    async clearPaidSalesInvoice(
        payload: MmAccountingDispatchPayload,
    ): Promise<ArPostingResult> {
        if (payload.eventType !== 'SalesInvoicePaid') {
            throw new BadRequestException(
                `Unsupported AR accounting event ${payload.eventType}.`,
            )
        }

        const invoice = await this.prisma.sdSalesInvoice.findUnique({
            where: { id: payload.documentId },
            include: {
                salesOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        channel: true,
                        customerId: true,
                    },
                },
            },
        })
        if (!invoice) {
            throw new NotFoundException('Sales invoice source document not found.')
        }
        if (invoice.companyId !== payload.companyId) {
            throw new BadRequestException(
                'Sales invoice company does not match the accounting event.',
            )
        }

        const skip = await this.shouldSkipPosOwnedOrder(invoice.salesOrder)
        if (skip) {
            return {
                created: false,
                duplicate: false,
                skipped: true,
                skipReason: skip,
            }
        }

        const document = await this.prisma.ficoArDocument.findUnique({
            where: { sourceSalesInvoiceId: invoice.id },
            include: { openItem: true },
        })
        if (!document) {
            // Issue event may still be in flight; fail retryably via validation.
            throw new BadRequestException(
                'Accounts Receivable document not found for paid sales invoice; issue posting must complete first.',
            )
        }
        if (document.status === 'REVERSED') {
            throw new BadRequestException(
                'Cannot clear a reversed Accounts Receivable document.',
            )
        }
        if (document.clearingJournalEntryId) {
            return {
                created: false,
                duplicate: true,
                journalEntryId: document.clearingJournalEntryId,
            }
        }
        const openItem = document.openItem
        if (!openItem) {
            throw new BadRequestException(
                'Accounts Receivable open item missing for paid sales invoice.',
            )
        }
        if (openItem.status === 'CLEARED') {
            return {
                created: false,
                duplicate: true,
                journalEntryId: document.journalEntryId,
            }
        }

        const clearAmount = money(openItem.openAmount)
        if (!clearAmount.gt(0)) {
            await this.prisma.ficoArOpenItem.update({
                where: { id: openItem.id },
                data: { status: 'CLEARED', openAmount: new Decimal(0), clearedAt: new Date() },
            })
            return {
                created: false,
                duplicate: true,
                journalEntryId: document.journalEntryId,
            }
        }

        const payloadPaidAt = (payload as unknown as { paidAt?: string }).paidAt
        const paidAt =
            invoice.paidAt ??
            (typeof payloadPaidAt === 'string'
                ? new Date(payloadPaidAt)
                : new Date(payload.postingDate))
        const postingDate = day(paidAt)
        const currencyCode = document.currencyCode
        const settings = await this.loadCompanyAccounts(invoice.companyId)
        const cashAccountId = await this.resolveRuleAccount(
            invoice.companyId,
            postingDate,
            currencyCode,
            'PAYMENT_CLEARING',
            'DEBIT',
            settings.defaultCashAccountId,
        )
        const arAccountId =
            document.reconciliationAccountId ??
            openItem.reconciliationAccountId ??
            (await this.resolveRuleAccount(
                invoice.companyId,
                postingDate,
                currencyCode,
                'ACCOUNTS_RECEIVABLE',
                'CREDIT',
                settings.defaultReceivableAccountId,
            ))

        const idempotencyKey =
            payload.idempotencyKey ?? `sales-invoice-ar-clear:${invoice.id}`

        const result = await this.journal.postAutomaticJournal({
            companyId: invoice.companyId,
            documentType: 'CUSTOMER_RECEIPT',
            documentDate: postingDate,
            postingDate,
            currencyCode,
            sourceModule: 'AR',
            sourceDocumentType: 'SALES_INVOICE',
            sourceDocumentId: invoice.id,
            sourceEventId: payload.sourceEventId ?? null,
            mmAccountingEventId: payload.mmAccountingEventId ?? null,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Customer receipt · ${invoice.invoiceNumber}`,
            reference: invoice.invoiceNumber,
            lines: [
                {
                    glAccountId: cashAccountId,
                    debit: clearAmount,
                    credit: new Decimal(0),
                    description: `Cash/bank clearing · ${invoice.invoiceNumber}`,
                },
                {
                    glAccountId: arAccountId,
                    debit: new Decimal(0),
                    credit: clearAmount,
                    description: `AR clearing · ${invoice.invoiceNumber}`,
                },
            ],
            metadata: {
                arDocumentType: 'RECEIPT',
                salesInvoiceId: invoice.id,
                arDocumentId: document.id,
                openItemId: openItem.id,
            },
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            subledgerPosting: 'AR',
            afterPersist: async (tx, journalEntry) => {
                const arTx = tx as ArTx
                await arTx.ficoArDocument.update({
                    where: { id: document.id },
                    data: { clearingJournalEntryId: journalEntry.id },
                })
                await arTx.ficoArOpenItem.update({
                    where: { id: openItem.id },
                    data: {
                        openAmount: new Decimal(0),
                        status: 'CLEARED',
                        clearedAt: journalEntry.postedAt ?? new Date(),
                    },
                })
                await arTx.ficoAccountingAuditLog.create({
                    data: {
                        companyId: invoice.companyId,
                        actorId: null,
                        action: 'AR_INVOICE_CLEAR',
                        entityType: 'FicoArDocument',
                        entityId: document.id,
                        newValues: {
                            salesInvoiceId: invoice.id,
                            clearingJournalEntryId: journalEntry.id,
                            clearedAmount: clearAmount.toString(),
                        },
                    },
                })
            },
        })

        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
        }
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
        const where: Record<string, unknown> = {
            companyId: query.companyId,
            ...(query.customerId ? { customerId: query.customerId } : {}),
            status: query.status ? query.status : { in: [...OPEN_STATUSES] },
            openAmount: { gt: MONEY_TOLERANCE },
        }
        if (query.overdueOnly) {
            where.dueDate = { lt: asOfDate }
        }
        if (query.search?.trim()) {
            const term = query.search.trim()
            where.OR = [
                {
                    customer: {
                        OR: [
                            { customerNumber: { contains: term, mode: 'insensitive' } },
                            { companyName: { contains: term, mode: 'insensitive' } },
                        ],
                    },
                },
                {
                    document: {
                        OR: [
                            { referenceNumber: { contains: term, mode: 'insensitive' } },
                            {
                                sourceSalesInvoice: {
                                    invoiceNumber: {
                                        contains: term,
                                        mode: 'insensitive',
                                    },
                                },
                            },
                        ],
                    },
                },
            ]
        }

        const items = await this.prisma.ficoArOpenItem.findMany({
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
                reconciliationAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
                document: {
                    select: {
                        id: true,
                        documentType: true,
                        status: true,
                        referenceNumber: true,
                        postingDate: true,
                        journalEntryId: true,
                        clearingJournalEntryId: true,
                        sourceSalesOrderId: true,
                        sourceSalesInvoiceId: true,
                        sourceSalesInvoice: {
                            select: { id: true, invoiceNumber: true },
                        },
                        journalEntry: {
                            select: { id: true, documentNumber: true },
                        },
                    },
                },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        })

        return items.map((item) => {
            const aging = this.agingDayMetrics(
                asOfDate,
                item.dueDate,
                item.baselineDate,
            )
            return { ...item, ...aging }
        })
    }

    async listDocuments(query: FicoArDocumentQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)
        const where: Record<string, unknown> = {
            companyId: query.companyId,
            ...(query.customerId ? { customerId: query.customerId } : {}),
            ...(query.status ? { status: query.status } : {}),
        }
        if (query.search?.trim()) {
            const term = query.search.trim()
            where.OR = [
                { referenceNumber: { contains: term, mode: 'insensitive' } },
                {
                    sourceSalesInvoice: {
                        invoiceNumber: { contains: term, mode: 'insensitive' },
                    },
                },
                {
                    customer: {
                        OR: [
                            { customerNumber: { contains: term, mode: 'insensitive' } },
                            { companyName: { contains: term, mode: 'insensitive' } },
                        ],
                    },
                },
            ]
        }
        return this.prisma.ficoArDocument.findMany({
            where,
            include: {
                customer: {
                    select: { id: true, customerNumber: true, companyName: true },
                },
                sourceSalesInvoice: {
                    select: { id: true, invoiceNumber: true, status: true },
                },
                journalEntry: {
                    select: { id: true, documentNumber: true, status: true },
                },
                clearingJournalEntry: {
                    select: { id: true, documentNumber: true, status: true },
                },
                openItem: {
                    select: {
                        id: true,
                        openAmount: true,
                        originalAmount: true,
                        status: true,
                        dueDate: true,
                    },
                },
            },
            orderBy: [{ postingDate: 'desc' }, { createdAt: 'desc' }],
        })
    }

    async getDocument(documentId: string, companyId: string, user: Actor) {
        await this.access.assertAccess(user, companyId)
        const document = await this.prisma.ficoArDocument.findFirst({
            where: { id: documentId, companyId },
            include: {
                customer: {
                    select: {
                        id: true,
                        customerNumber: true,
                        companyName: true,
                        email: true,
                    },
                },
                reconciliationAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
                sourceSalesInvoice: {
                    select: {
                        id: true,
                        invoiceNumber: true,
                        status: true,
                        salesOrderId: true,
                        issuedAt: true,
                        paidAt: true,
                    },
                },
                journalEntry: {
                    include: {
                        lines: {
                            include: {
                                glAccount: {
                                    select: {
                                        id: true,
                                        accountCode: true,
                                        accountName: true,
                                    },
                                },
                            },
                            orderBy: { lineNumber: 'asc' },
                        },
                    },
                },
                clearingJournalEntry: {
                    select: { id: true, documentNumber: true, status: true },
                },
                openItem: true,
            },
        })
        if (!document) throw new NotFoundException('AR document not found.')
        const asOf = day(new Date())
        const aging = document.openItem
            ? this.agingBucket(
                  document.openItem.dueDate ?? document.openItem.baselineDate,
                  asOf,
              )
            : null
        return { ...document, aging }
    }

    async getAging(companyId: string, asOf: string | undefined, user: Actor) {
        await this.access.assertAccess(user, companyId)
        const asOfDate = day(asOf ?? new Date())
        const items = await this.prisma.ficoArOpenItem.findMany({
            where: {
                companyId,
                status: { in: ['OPEN', 'PARTIALLY_CLEARED'] },
            },
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
                        referenceNumber: true,
                        journalEntryId: true,
                        postingDate: true,
                    },
                },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        })
        const buckets = {
            current: new Decimal(0),
            days1To30: new Decimal(0),
            days31To60: new Decimal(0),
            days61To90: new Decimal(0),
            over90: new Decimal(0),
            customerCredits: new Decimal(0),
        }
        const rows = items.map((item) => {
            const amount = money(item.openAmount)
            const anchor = item.dueDate ?? item.baselineDate
            const aging = this.agingDayMetrics(
                asOfDate,
                item.dueDate,
                item.baselineDate,
            )
            const { overdueDays } = aging
            const signedOpenAmount =
                item.direction === 'DEBIT' ? amount : amount.negated()

            if (item.direction === 'CREDIT') {
                buckets.customerCredits = buckets.customerCredits.plus(amount)
            } else if (overdueDays === 0) {
                buckets.current = buckets.current.plus(amount)
            } else if (overdueDays <= 30) {
                buckets.days1To30 = buckets.days1To30.plus(amount)
            } else if (overdueDays <= 60) {
                buckets.days31To60 = buckets.days31To60.plus(amount)
            } else if (overdueDays <= 90) {
                buckets.days61To90 = buckets.days61To90.plus(amount)
            } else {
                buckets.over90 = buckets.over90.plus(amount)
            }

            return { ...item, ...aging, signedOpenAmount, dueAnchor: anchor }
        })
        const totalReceivable = rows
            .filter((item) => item.direction === 'DEBIT')
            .reduce((total, item) => total.plus(money(item.openAmount)), new Decimal(0))

        return {
            asOfDate: asOfDate.toISOString().slice(0, 10),
            buckets: {
                current: buckets.current.toString(),
                days1To30: buckets.days1To30.toString(),
                days31To60: buckets.days31To60.toString(),
                days61To90: buckets.days61To90.toString(),
                over90: buckets.over90.toString(),
                customerCredits: buckets.customerCredits.toString(),
            },
            totalReceivable: totalReceivable.toString(),
            items: rows,
        }
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

        const [openItems, collections, exceptions, aging] = await Promise.all([
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
            this.getAging(
                query.companyId,
                asOfDate.toISOString().slice(0, 10),
                user,
            ),
        ])

        let totalOutstanding = new Decimal(0)
        let totalOverdue = new Decimal(0)
        let advanceBalance = new Decimal(0)
        let unappliedBalance = new Decimal(0)

        for (const item of openItems) {
            const amount = money(item.openAmount)
            if (item.direction === 'DEBIT') {
                totalOutstanding = totalOutstanding.plus(amount)
                const { overdueDays } = this.agingDayMetrics(
                    asOfDate,
                    item.dueDate,
                    item.baselineDate,
                )
                if (overdueDays > 0) totalOverdue = totalOverdue.plus(amount)
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
            agingBuckets: aging.buckets,
            totalReceivable: aging.totalReceivable,
        }
    }

    async registerPosChargeOpenItemFromJournal(input: {
        companyId: string
        salesOrderId: string
        journalEntryId: string
        outstandingBalance?: string | number | null
        currencyCode?: string
        postingDate?: string | Date
    }): Promise<ArPostingResult> {
        const outstandingHint = money(input.outstandingBalance)
        if (
            input.outstandingBalance != null &&
            !outstandingHint.gt(MONEY_TOLERANCE)
        ) {
            return {
                created: false,
                duplicate: false,
                skipped: true,
                skipReason: 'POS sale has no outstanding receivable balance.',
            }
        }

        const existingByOrder = await this.prisma.ficoArDocument.findUnique({
            where: { sourceSalesOrderId: input.salesOrderId },
            select: { id: true, journalEntryId: true, status: true },
        })
        if (existingByOrder) {
            return {
                created: false,
                duplicate: true,
                journalEntryId: existingByOrder.journalEntryId,
            }
        }

        const existingByJournal = await this.prisma.ficoArDocument.findUnique({
            where: { journalEntryId: input.journalEntryId },
            select: { id: true, journalEntryId: true },
        })
        if (existingByJournal) {
            return {
                created: false,
                duplicate: true,
                journalEntryId: existingByJournal.journalEntryId,
            }
        }

        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: input.salesOrderId },
            select: {
                id: true,
                orderNumber: true,
                companyId: true,
                customerId: true,
                currency: true,
                totalAmount: true,
                taxAmount: true,
                outstandingBalance: true,
                dueDate: true,
                createdAt: true,
                lines: { select: { taxAmount: true } },
            },
        })
        if (!order) {
            throw new NotFoundException('Sales order not found for POS AR open item.')
        }
        if (order.companyId && order.companyId !== input.companyId) {
            throw new BadRequestException(
                'Sales order company does not match the accounting event.',
            )
        }
        if (!order.customerId) {
            throw new BadRequestException(
                'POS sale has no customer identity for Accounts Receivable.',
            )
        }

        const receivable = await this.prisma.sdPosReceivable.findFirst({
            where: { salesOrderId: order.id },
            select: {
                id: true,
                originalAmount: true,
                balance: true,
                dueDate: true,
                status: true,
            },
        })

        const openAmount = money(
            receivable?.balance ??
                order.outstandingBalance ??
                input.outstandingBalance ??
                0,
        )
        if (!openAmount.gt(MONEY_TOLERANCE)) {
            return {
                created: false,
                duplicate: false,
                skipped: true,
                skipReason: 'POS sale has no outstanding receivable balance.',
            }
        }

        const customer = await this.prisma.sdCustomer.findUnique({
            where: { id: order.customerId },
            select: { id: true },
        })
        if (!customer) {
            throw new BadRequestException(
                'Customer master not found for POS Accounts Receivable.',
            )
        }

        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id: input.journalEntryId },
            select: {
                id: true,
                companyId: true,
                postingDate: true,
                documentDate: true,
                currencyCode: true,
                status: true,
                lines: {
                    select: {
                        glAccountId: true,
                        debitAmount: true,
                        creditAmount: true,
                    },
                },
            },
        })
        if (!journal || journal.companyId !== input.companyId) {
            throw new NotFoundException(
                'POS revenue journal not found for AR open-item attach.',
            )
        }
        if (journal.status !== 'POSTED') {
            throw new BadRequestException(
                'POS revenue journal must be posted before AR open-item attach.',
            )
        }

        const settings = await this.loadCompanyAccounts(input.companyId)
        const arLine = journal.lines.find((line) =>
            money(line.debitAmount).gt(MONEY_TOLERANCE),
        )
        const receivableAccountId =
            arLine?.glAccountId ??
            settings.defaultReceivableAccountId ??
            (await this.resolveRuleAccount(
                input.companyId,
                day(journal.postingDate),
                (journal.currencyCode || 'PHP').toUpperCase(),
                'ACCOUNTS_RECEIVABLE',
                'DEBIT',
                settings.defaultReceivableAccountId,
            ))
        const receivableGl = await this.prisma.ficoGlAccount.findUnique({
            where: { id: receivableAccountId },
            select: { id: true, accountCode: true },
        })
        if (!receivableGl) {
            throw new BadRequestException('Receivable G/L account was not found.')
        }

        const postingDate = day(
            input.postingDate ?? journal.postingDate ?? order.createdAt,
        )
        const documentDate = day(journal.documentDate ?? postingDate)
        const baselineDate = postingDate
        const dueDate = day(
            receivable?.dueDate ?? order.dueDate ?? this.addDays(baselineDate, 7),
        )
        const currencyCode = (
            input.currencyCode ||
            order.currency ||
            journal.currencyCode ||
            'PHP'
        ).toUpperCase()
        const taxAmount = (order.lines ?? []).reduce(
            (sum, line) => sum.plus(line.taxAmount ?? 0),
            new Decimal(0),
        )
        const grossAmount = money(receivable?.originalAmount ?? openAmount)
        const netAmount = Decimal.max(grossAmount.minus(taxAmount), new Decimal(0))

        await this.prisma.$transaction(async (tx) => {
            const arTx = tx as ArTx
            const document = await arTx.ficoArDocument.create({
                data: {
                    companyId: input.companyId,
                    customerId: order.customerId,
                    sourceSalesInvoiceId: null,
                    sourceSalesOrderId: order.id,
                    sourcePosReceivableId: receivable?.id ?? null,
                    journalEntryId: journal.id,
                    documentType: 'POS_CHARGE',
                    status: 'POSTED',
                    referenceNumber: order.orderNumber,
                    documentDate,
                    postingDate,
                    baselineDate,
                    dueDate,
                    currencyCode,
                    netAmount,
                    taxAmount,
                    grossAmount,
                    receivableAmount: openAmount,
                    reconciliationAccountId: receivableGl.id,
                    reconciliationAccountCode: receivableGl.accountCode,
                    createdBy: null,
                },
            })
            const openStatus =
                openAmount.plus(MONEY_TOLERANCE).lt(grossAmount)
                    ? 'PARTIALLY_CLEARED'
                    : 'OPEN'
            await arTx.ficoArOpenItem.create({
                data: {
                    companyId: input.companyId,
                    customerId: order.customerId,
                    documentId: document.id,
                    reconciliationAccountId: receivableGl.id,
                    itemType: 'POS_CHARGE',
                    direction: 'DEBIT',
                    originalAmount: grossAmount,
                    openAmount,
                    currencyCode,
                    baselineDate,
                    dueDate,
                    status: openStatus,
                },
            })
            await arTx.ficoAccountingAuditLog.create({
                data: {
                    companyId: input.companyId,
                    actorId: null,
                    action: 'AR_POS_CHARGE_ATTACH',
                    entityType: 'FicoArDocument',
                    entityId: document.id,
                    newValues: {
                        salesOrderId: order.id,
                        orderNumber: order.orderNumber,
                        journalEntryId: journal.id,
                        receivableAmount: openAmount.toString(),
                        dueDate: dueDate.toISOString().slice(0, 10),
                        sourcePosReceivableId: receivable?.id ?? null,
                    },
                },
            })
        })

        return {
            created: true,
            duplicate: false,
            journalEntryId: journal.id,
        }
    }

    /**
     * After ExtPlatformSaleApproved revenue journal posts: create marketplace AR
     * open item (subledger only — revenue journal already debited AR control).
     */
    async registerMarketplaceReceivableFromJournal(input: {
        companyId: string
        transactionId: string
        journalEntryId: string
        currencyCode?: string
        postingDate?: string | Date
    }): Promise<ArPostingResult> {
        const existingByTx = await this.prisma.ficoArDocument.findUnique({
            where: { sourceExtPlatformTransactionId: input.transactionId },
            select: { id: true, journalEntryId: true },
        })
        if (existingByTx) {
            return {
                created: false,
                duplicate: true,
                journalEntryId: existingByTx.journalEntryId,
            }
        }

        const existingByJournal = await this.prisma.ficoArDocument.findUnique({
            where: { journalEntryId: input.journalEntryId },
            select: { id: true, journalEntryId: true },
        })
        if (existingByJournal) {
            return {
                created: false,
                duplicate: true,
                journalEntryId: existingByJournal.journalEntryId,
            }
        }

        const tx = await this.prisma.sdExtPlatformTransaction.findUnique({
            where: { id: input.transactionId },
            include: {
                salesSource: {
                    select: {
                        code: true,
                        name: true,
                        counterpartyCustomerId: true,
                    },
                },
                lines: { select: { taxAmount: true } },
            },
        })
        if (!tx) {
            throw new NotFoundException('External platform transaction not found for AR.')
        }
        if (tx.companyId !== input.companyId) {
            throw new BadRequestException(
                'Transaction company does not match the accounting event.',
            )
        }

        const customerId = await this.resolveMarketplaceCustomerId(tx)
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id: input.journalEntryId },
            select: {
                id: true,
                companyId: true,
                postingDate: true,
                documentDate: true,
                currencyCode: true,
                status: true,
                lines: {
                    select: {
                        glAccountId: true,
                        debitAmount: true,
                        creditAmount: true,
                    },
                },
            },
        })
        if (!journal || journal.companyId !== input.companyId) {
            throw new NotFoundException(
                'Marketplace revenue journal not found for AR attach.',
            )
        }
        if (journal.status !== 'POSTED') {
            throw new BadRequestException(
                'Revenue journal must be posted before AR subledger attach.',
            )
        }

        const grossAmount = money(tx.grandTotal)
        if (!grossAmount.gt(MONEY_TOLERANCE)) {
            return {
                created: false,
                duplicate: false,
                skipped: true,
                skipReason: 'Marketplace sale has no receivable amount.',
            }
        }

        const settings = await this.loadCompanyAccounts(input.companyId)
        const arLine = journal.lines.find((line) =>
            money(line.debitAmount).gt(MONEY_TOLERANCE),
        )
        const receivableAccountId =
            arLine?.glAccountId ??
            settings.defaultReceivableAccountId ??
            (await this.resolveRuleAccount(
                input.companyId,
                day(journal.postingDate),
                (journal.currencyCode || 'PHP').toUpperCase(),
                'ACCOUNTS_RECEIVABLE',
                'DEBIT',
                settings.defaultReceivableAccountId,
            ))
        const receivableGl = await this.prisma.ficoGlAccount.findUnique({
            where: { id: receivableAccountId },
            select: { id: true, accountCode: true },
        })
        if (!receivableGl) {
            throw new BadRequestException('Receivable G/L account was not found.')
        }

        const taxAmount = tx.lines.reduce(
            (sum, line) => sum.plus(line.taxAmount ?? 0),
            new Decimal(0),
        )
        const netAmount = Decimal.max(grossAmount.minus(taxAmount), new Decimal(0))
        const postingDate = day(
            input.postingDate ?? journal.postingDate ?? tx.transactionDate,
        )
        const documentDate = day(journal.documentDate ?? postingDate)
        const baselineDate = postingDate
        const dueDate = this.addDays(baselineDate, 30)
        const currencyCode = (
            input.currencyCode ||
            tx.currency ||
            journal.currencyCode ||
            'PHP'
        ).toUpperCase()

        await this.prisma.$transaction(async (txPrisma) => {
            const arTx = txPrisma as ArTx
            const document = await arTx.ficoArDocument.create({
                data: {
                    companyId: input.companyId,
                    customerId,
                    sourceExtPlatformTransactionId: tx.id,
                    journalEntryId: journal.id,
                    documentType: 'MARKETPLACE_SALE',
                    status: 'POSTED',
                    referenceNumber: tx.transactionNumber,
                    documentDate,
                    postingDate,
                    baselineDate,
                    dueDate,
                    currencyCode,
                    netAmount,
                    taxAmount,
                    grossAmount,
                    receivableAmount: grossAmount,
                    reconciliationAccountId: receivableGl.id,
                    reconciliationAccountCode: receivableGl.accountCode,
                    createdBy: null,
                },
            })
            await arTx.ficoArOpenItem.create({
                data: {
                    companyId: input.companyId,
                    customerId,
                    documentId: document.id,
                    reconciliationAccountId: receivableGl.id,
                    itemType: 'MARKETPLACE_RECEIVABLE',
                    direction: 'DEBIT',
                    originalAmount: grossAmount,
                    openAmount: grossAmount,
                    currencyCode,
                    baselineDate,
                    dueDate,
                    status: 'OPEN',
                },
            })
            await arTx.ficoAccountingAuditLog.create({
                data: {
                    companyId: input.companyId,
                    actorId: null,
                    action: 'AR_MARKETPLACE_ATTACH',
                    entityType: 'FicoArDocument',
                    entityId: document.id,
                    newValues: {
                        transactionId: tx.id,
                        transactionNumber: tx.transactionNumber,
                        salesSourceCode: tx.salesSource.code,
                        journalEntryId: journal.id,
                        receivableAmount: grossAmount.toString(),
                    },
                },
            })
        })

        await this.recalculateCreditExposure(input.companyId, customerId)

        return {
            created: true,
            duplicate: false,
            journalEntryId: journal.id,
        }
    }

  async applyMarketplaceSettlementToOpenItem(input: {
        companyId: string
        transactionId: string
        clearingJournalEntryId: string
        clearedAmount: string | number
    }): Promise<void> {
        const document = await this.prisma.ficoArDocument.findUnique({
            where: { sourceExtPlatformTransactionId: input.transactionId },
            include: { openItem: true },
        })
        if (!document?.openItem) {
            throw new NotFoundException(
                'Marketplace AR open item not found for settlement.',
            )
        }
        const clearAmount = money(input.clearedAmount)
        const openItem = document.openItem
        const remaining = money(openItem.openAmount).minus(clearAmount)
        const newStatus = remaining.lte(MONEY_TOLERANCE) ? 'CLEARED' : 'PARTIALLY_CLEARED'

        await this.prisma.$transaction(async (txPrisma) => {
            const arTx = txPrisma as ArTx
            await arTx.ficoArOpenItem.update({
                where: { id: openItem.id },
                data: {
                    openAmount: Decimal.max(remaining, new Decimal(0)),
                    status: newStatus,
                    clearedAt: newStatus === 'CLEARED' ? new Date() : openItem.clearedAt,
                },
            })
            await arTx.ficoArDocument.update({
                where: { id: document.id },
                data: { clearingJournalEntryId: input.clearingJournalEntryId },
            })
            await arTx.ficoAccountingAuditLog.create({
                data: {
                    companyId: input.companyId,
                    actorId: null,
                    action: 'AR_MARKETPLACE_SETTLEMENT_CLEAR',
                    entityType: 'FicoArDocument',
                    entityId: document.id,
                    newValues: {
                        transactionId: input.transactionId,
                        clearingJournalEntryId: input.clearingJournalEntryId,
                        clearedAmount: clearAmount.toString(),
                    },
                },
            })
        })
        await this.recalculateCreditExposure(input.companyId, document.customerId)
    }

    private async resolveMarketplaceCustomerId(tx: {
        customerId: string | null
        salesSource: {
            code: string
            name: string
            counterpartyCustomerId: string | null
        }
    }): Promise<string> {
        if (tx.customerId) return tx.customerId
        if (tx.salesSource.counterpartyCustomerId) {
            return tx.salesSource.counterpartyCustomerId
        }
        const fallbackNumber = `MP-${tx.salesSource.code}`
        const fallback = await this.prisma.sdCustomer.findFirst({
            where: { customerNumber: fallbackNumber },
            select: { id: true },
        })
        if (fallback) return fallback.id
        throw new BadRequestException(
            `Assign a customer on the EPT or set counterparty customer on sales source ${tx.salesSource.name} (${tx.salesSource.code}) for AR.`,
        )
    }

    /**
     * After PosCollectionCompleted journal posts: reduce/clear the POS AR open
     * item. Does not post a second clearing journal (POS collection owns GL).
     */
    async applyPosCollectionToOpenItem(input: {
        companyId: string
        collectionId: string
        journalEntryId: string
        collectedAmount?: string | number | null
    }): Promise<ArPostingResult> {
        const collection = await this.prisma.sdPosCollection.findUnique({
            where: { id: input.collectionId },
            select: {
                id: true,
                companyId: true,
                salesOrderId: true,
                totalAmount: true,
                status: true,
                collectionNumber: true,
            },
        })
        if (!collection) {
            throw new NotFoundException('POS collection not found for AR open-item sync.')
        }
        if (collection.companyId !== input.companyId) {
            throw new BadRequestException(
                'POS collection company does not match the accounting event.',
            )
        }
        if (collection.status === 'CANCELLED') {
            return {
                created: false,
                duplicate: false,
                skipped: true,
                skipReason: 'Cancelled POS collection; AR open item unchanged.',
            }
        }

        const document = await this.prisma.ficoArDocument.findUnique({
            where: { sourceSalesOrderId: collection.salesOrderId },
            include: { openItem: true },
        })
        if (!document?.openItem) {
            return {
                created: false,
                duplicate: false,
                skipped: true,
                skipReason:
                    'No FICO AR open item for this POS sale; nothing to clear.',
            }
        }
        if (document.status === 'REVERSED') {
            throw new BadRequestException(
                'Cannot clear a reversed Accounts Receivable document.',
            )
        }

        const openItem = document.openItem
        if (openItem.status === 'CLEARED') {
            return {
                created: false,
                duplicate: true,
                journalEntryId: document.clearingJournalEntryId ?? document.journalEntryId,
            }
        }

        const collected = money(
            input.collectedAmount ?? collection.totalAmount ?? 0,
        )
        if (!collected.gt(0)) {
            return {
                created: false,
                duplicate: false,
                skipped: true,
                skipReason: 'Collection amount is zero; AR open item unchanged.',
            }
        }

        const nextOpen = Decimal.max(
            money(openItem.openAmount).minus(collected),
            new Decimal(0),
        )
        const cleared = !nextOpen.gt(MONEY_TOLERANCE)
        const nextStatus = cleared ? 'CLEARED' : 'PARTIALLY_CLEARED'

        await this.prisma.$transaction(async (tx) => {
            const arTx = tx as ArTx
            await arTx.ficoArOpenItem.update({
                where: { id: openItem.id },
                data: {
                    openAmount: nextOpen,
                    status: nextStatus,
                    clearedAt: cleared ? new Date() : null,
                },
            })
            if (cleared && !document.clearingJournalEntryId) {
                await arTx.ficoArDocument.update({
                    where: { id: document.id },
                    data: { clearingJournalEntryId: input.journalEntryId },
                })
            }
            await arTx.ficoAccountingAuditLog.create({
                data: {
                    companyId: input.companyId,
                    actorId: null,
                    action: 'AR_POS_COLLECTION_CLEAR',
                    entityType: 'FicoArDocument',
                    entityId: document.id,
                    newValues: {
                        collectionId: collection.id,
                        collectionNumber: collection.collectionNumber,
                        collectedAmount: collected.toString(),
                        openAmount: nextOpen.toString(),
                        status: nextStatus,
                        clearingJournalEntryId: cleared
                            ? input.journalEntryId
                            : document.clearingJournalEntryId,
                    },
                },
            })
        })

        return {
            created: true,
            duplicate: false,
            journalEntryId: input.journalEntryId,
        }
    }

    /**
     * Backfill: attach AR open items for open POS receivables that already have
     * a posted pos-revenue journal.
     */
    async backfillPosChargeOpenItems(companyId?: string): Promise<{
        scanned: number
        created: number
        skipped: number
        errors: Array<{ salesOrderId: string; message: string }>
    }> {
        const receivables = await this.prisma.sdPosReceivable.findMany({
            where: {
                ...(companyId ? { companyId } : {}),
                status: { in: ['OPEN'] },
                balance: { gt: 0 },
            },
            select: {
                id: true,
                companyId: true,
                salesOrderId: true,
                balance: true,
            },
        })

        let created = 0
        let skipped = 0
        const errors: Array<{ salesOrderId: string; message: string }> = []

        for (const row of receivables) {
            const journal = await this.prisma.ficoJournalEntry.findUnique({
                where: { idempotencyKey: `pos-revenue:${row.salesOrderId}` },
                select: { id: true, status: true },
            })
            if (!journal || journal.status !== 'POSTED') {
                skipped += 1
                continue
            }
            try {
                const result = await this.registerPosChargeOpenItemFromJournal({
                    companyId: row.companyId,
                    salesOrderId: row.salesOrderId,
                    journalEntryId: journal.id,
                    outstandingBalance: row.balance.toString(),
                })
                if (result.created) created += 1
                else skipped += 1
            } catch (error) {
                errors.push({
                    salesOrderId: row.salesOrderId,
                    message:
                        error instanceof Error ? error.message : String(error),
                })
            }
        }

        return {
            scanned: receivables.length,
            created,
            skipped,
            errors,
        }
    }

    /**
     * POS owns revenue/AR GL for channel POS (and any SO with pos-revenue journal
     * or SdPosReceivable). Skip *invoice* AR posting to avoid dual journals.
     * POS charge open items are attached separately via registerPosChargeOpenItemFromJournal.
     */
    private async shouldSkipPosOwnedOrder(order: {
        id: string
        channel: string | null
    }): Promise<string | null> {
        if (order.channel === 'POS') {
            return 'POS channel owns GL via PosSaleCompleted; invoice AR journal skipped.'
        }
        const [posRevenue, receivable] = await Promise.all([
            this.prisma.mmAccountingEvent.findUnique({
                where: { idempotencyKey: `pos-revenue:${order.id}` },
                select: { id: true, status: true },
            }),
            this.prisma.sdPosReceivable.findFirst({
                where: { salesOrderId: order.id },
                select: { id: true },
            }),
        ])
        if (posRevenue && posRevenue.status !== 'SKIPPED') {
            return 'POS revenue accounting event exists; invoice AR journal skipped.'
        }
        if (receivable) {
            return 'SdPosReceivable exists for sales order; invoice AR journal skipped.'
        }
        return null
    }

    private agingBucket(
        dueOrBaseline: Date,
        asOfDate: Date,
    ): {
        bucket: 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS'
        daysPastDue: number
    } {
        const due = day(dueOrBaseline)
        const asOf = day(asOfDate)
        const daysPastDue = Math.floor((asOf.getTime() - due.getTime()) / 86_400_000)
        if (daysPastDue <= 0) return { bucket: 'CURRENT', daysPastDue: Math.max(0, daysPastDue) }
        if (daysPastDue <= 30) return { bucket: 'D1_30', daysPastDue }
        if (daysPastDue <= 60) return { bucket: 'D31_60', daysPastDue }
        if (daysPastDue <= 90) return { bucket: 'D61_90', daysPastDue }
        return { bucket: 'D90_PLUS', daysPastDue }
    }

    private addDays(value: Date, days: number) {
        const next = new Date(value)
        next.setUTCDate(next.getUTCDate() + days)
        return day(next)
    }

    private async loadCompanyAccounts(companyId: string) {
        const settings = await this.prisma.ficoCompanyAccountingSettings.findFirst({
            where: { companyId, status: 'ACTIVE' },
            select: {
                chartOfAccountsId: true,
                defaultSalesRevenueAccountId: true,
                defaultTaxOutputAccountId: true,
                defaultReceivableAccountId: true,
                defaultCashAccountId: true,
            },
        })
        if (!settings?.chartOfAccountsId) {
            throw new BadRequestException(
                'Company accounting is not active or chart of accounts is missing.',
            )
        }
        return settings
    }


    private transactionKeyForType(transactionType: string): string {
        const map: Record<string, string> = {
            SALES_REVENUE: 'SALES_REVENUE',
            OUTPUT_TAX: 'OUTPUT_TAX',
            ACCOUNTS_RECEIVABLE: 'CUSTOMER_RECON',
            PAYMENT_CLEARING: 'PAYMENT_CLEARING',
        }
        return map[transactionType] ?? transactionType
    }

    private async resolveRuleAccount(
        companyId: string,
        postingDate: Date,
        currency: string,
        transactionType: string,
        side: 'DEBIT' | 'CREDIT',
        fallbackAccountId: string | null,
    ): Promise<string> {
        const transactionKey = this.transactionKeyForType(transactionType)
        try {
            const resolved = await this.accountResolution.resolveDetermination({
                companyId,
                sourceModule: 'SD',
                postingDate,
                currencyCode: currency,
                transactionKey,
                dimensions: {},
            })
            const lines =
                side === 'DEBIT'
                    ? resolved.resolution.debitLines
                    : resolved.resolution.creditLines
            if (lines[0]?.glAccountId) return lines[0].glAccountId
            return resolved.glAccountId
        } catch (error) {
            if (fallbackAccountId) return fallbackAccountId
            const message =
                error instanceof Error
                    ? error.message
                    : `No G/L account could be resolved for AR ${transactionType} (${side}).`
            throw new BadRequestException(message)
        }
    }


    private agingDayMetrics(
        asOfDate: Date,
        dueDate: Date | null | undefined,
        baselineDate: Date | null | undefined,
    ): { overdueDays: number; daysUntilDue: number } {
        const anchorRaw = dueDate ?? baselineDate
        if (!anchorRaw) {
            return { overdueDays: 0, daysUntilDue: 0 }
        }
        const asOf = day(asOfDate)
        const anchor = day(anchorRaw)
        const diffDays = Math.floor(
            (asOf.getTime() - anchor.getTime()) / 86_400_000,
        )
        if (diffDays >= 0) {
            return { overdueDays: diffDays, daysUntilDue: 0 }
        }
        return { overdueDays: 0, daysUntilDue: -diffDays }
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
