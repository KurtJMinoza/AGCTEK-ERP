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
    FicoArDocumentQueryDto,
    FicoArOpenItemQueryDto,
} from './dto/fico-accounts-receivable.dto'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoJournalService } from './fico-journal.service'

type Actor = AuthRequestUser | undefined

type ArPostingResult = {
    created: boolean
    duplicate: boolean
    skipped?: boolean
    skipReason?: string
    journalEntryId?: string
}

/**
 * Local AR delegates until `prisma generate` refreshes the shared client
 * (worktree junction may lock query_engine while the API is running).
 */
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

type ArPrisma = PrismaService & {
    ficoArDocument: ArDocumentDelegate
    ficoArOpenItem: ArOpenItemDelegate
}

type ArTx = Prisma.TransactionClient & {
    ficoArDocument: ArDocumentDelegate
    ficoArOpenItem: ArOpenItemDelegate
}

const MONEY_TOLERANCE = new Decimal('0.01')
const OPEN_STATUSES = ['OPEN', 'PARTIALLY_CLEARED'] as const

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

/**
 * Accounts Receivable V1 — customer open items from SdSalesInvoice and POS charge.
 *
 * POS double-post rule (locked): invoice AR must not create a second journal when
 * the sales order already owns GL via PosSaleCompleted (`pos-revenue:{salesOrderId}`),
 * has a SdPosReceivable row, or channel === 'POS'. POS unpaid balances attach a
 * FicoArDocument/OpenItem to the existing pos-revenue journal (subledger only).
 * Collections clear that open item without a second AR clearing journal.
 */
@Injectable()
export class FicoAccountsReceivableService {
    private readonly db: ArPrisma

    constructor(
        prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly accountResolution: FicoAccountResolutionService,
        private readonly journal: FicoJournalService,
    ) {
        this.db = prisma as ArPrisma
    }

    supportsAccountingPayload(payload: MmAccountingDispatchPayload) {
        return (
            payload.eventType === 'SalesInvoiceIssued' ||
            payload.eventType === 'SalesInvoicePaid'
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
        throw new BadRequestException(
            `Unsupported AR accounting event ${payload.eventType}.`,
        )
    }

    async postIssuedSalesInvoice(
        payload: MmAccountingDispatchPayload,
    ): Promise<ArPostingResult> {
        if (payload.eventType !== 'SalesInvoiceIssued') {
            throw new BadRequestException(
                `Unsupported AR accounting event ${payload.eventType}.`,
            )
        }

        const invoice = await this.db.sdSalesInvoice.findUnique({
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

        const existing = await this.db.ficoArDocument.findUnique({
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
        const customer = await this.db.sdCustomer.findUnique({
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
        const receivableGl = await this.db.ficoGlAccount.findUnique({
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

        const invoice = await this.db.sdSalesInvoice.findUnique({
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

        const document = await this.db.ficoArDocument.findUnique({
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
            await this.db.ficoArOpenItem.update({
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

        const items = await this.db.ficoArOpenItem.findMany({
            where,
            include: {
                customer: {
                    select: {
                        id: true,
                        customerNumber: true,
                        companyName: true,
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
            const aging = this.agingBucket(item.dueDate ?? item.baselineDate, asOfDate)
            return { ...item, agingBucket: aging.bucket, daysPastDue: aging.daysPastDue }
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
        return this.db.ficoArDocument.findMany({
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
        const document = await this.db.ficoArDocument.findFirst({
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
        const items = await this.db.ficoArOpenItem.findMany({
            where: {
                companyId,
                status: { in: [...OPEN_STATUSES] },
                openAmount: { gt: MONEY_TOLERANCE },
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        customerNumber: true,
                        companyName: true,
                    },
                },
                document: {
                    select: {
                        id: true,
                        referenceNumber: true,
                        sourceSalesInvoice: {
                            select: { id: true, invoiceNumber: true },
                        },
                        journalEntry: {
                            select: { id: true, documentNumber: true },
                        },
                    },
                },
                reconciliationAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
            },
            orderBy: { dueDate: 'asc' },
        })

        const buckets = {
            CURRENT: new Decimal(0),
            D1_30: new Decimal(0),
            D31_60: new Decimal(0),
            D61_90: new Decimal(0),
            D90_PLUS: new Decimal(0),
        }
        const rows = items.map((item) => {
            const amount = money(item.openAmount)
            const aging = this.agingBucket(item.dueDate ?? item.baselineDate, asOfDate)
            buckets[aging.bucket] = buckets[aging.bucket].plus(amount)
            return {
                ...item,
                agingBucket: aging.bucket,
                daysPastDue: aging.daysPastDue,
            }
        })
        const totalOpen = rows.reduce(
            (total, item) => total.plus(money(item.openAmount)),
            new Decimal(0),
        )
        return {
            asOfDate,
            buckets,
            totalOpen,
            items: rows,
        }
    }

    /**
     * After PosSaleCompleted journal posts: attach AR open item to that journal
     * when outstandingBalance > 0. Does not post GL.
     */
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

        const existingByOrder = await this.db.ficoArDocument.findUnique({
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

        const existingByJournal = await this.db.ficoArDocument.findUnique({
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

        const order = await this.db.sdSalesOrder.findUnique({
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

        const receivable = await this.db.sdPosReceivable.findFirst({
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

        const customer = await this.db.sdCustomer.findUnique({
            where: { id: order.customerId },
            select: { id: true },
        })
        if (!customer) {
            throw new BadRequestException(
                'Customer master not found for POS Accounts Receivable.',
            )
        }

        const journal = await this.db.ficoJournalEntry.findUnique({
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
        const receivableGl = await this.db.ficoGlAccount.findUnique({
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

        await this.db.$transaction(async (tx) => {
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
     * After PosCollectionCompleted journal posts: reduce/clear the POS AR open
     * item. Does not post a second clearing journal (POS collection owns GL).
     */
    async applyPosCollectionToOpenItem(input: {
        companyId: string
        collectionId: string
        journalEntryId: string
        collectedAmount?: string | number | null
    }): Promise<ArPostingResult> {
        const collection = await this.db.sdPosCollection.findUnique({
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

        const document = await this.db.ficoArDocument.findUnique({
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

        await this.db.$transaction(async (tx) => {
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
        const receivables = await this.db.sdPosReceivable.findMany({
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
            const journal = await this.db.ficoJournalEntry.findUnique({
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
            this.db.mmAccountingEvent.findUnique({
                where: { idempotencyKey: `pos-revenue:${order.id}` },
                select: { id: true, status: true },
            }),
            this.db.sdPosReceivable.findFirst({
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
        const settings = await this.db.ficoCompanyAccountingSettings.findFirst({
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
}
