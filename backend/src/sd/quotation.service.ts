import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SD_CATALOG_CURRENCY } from './dto/sales-order.dto'
import type {
    CreateQuotationInput,
    ListQuotationsQueryDto,
    ReviseQuotationInput,
    SendQuotationInput,
    UpdateQuotationDraftInput,
} from './dto/quotation.dto'
import {
    assertCatalogLineInput,
    assertSellable,
    loadBillableCustomer,
    priceCatalogLines,
    type PricedCatalogLine,
} from './sd-catalog-pricing'
import {
    ACTIVE_QUOTATION_STATUSES,
    EXPIRABLE_QUOTATION_STATUSES,
    effectiveQuotationStatus,
    formatQuotationNumber,
    isQuotationExpired,
    manilaDate,
    nextQuotationStatus,
    resolveValidUntil,
    type QuotationAction,
} from './quotation.rules'

type Client = Prisma.TransactionClient

const QUOTATION_INCLUDE = {
    lines: { orderBy: { lineNumber: 'asc' as const } },
} satisfies Prisma.SdQuotationInclude

type QuotationRow = Prisma.SdQuotationGetPayload<{ include: typeof QUOTATION_INCLUDE }>

/** A DRAFT line whose product can no longer be sold; Send stays blocked until it is removed. */
export type QuotationLineIssue = {
    lineNumber: number
    sku: string
    reason: 'NOT_FOUND' | 'INACTIVE'
}

export type QuotationView = QuotationRow & {
    effectiveStatus: string
    isExpired: boolean
    lineIssues: QuotationLineIssue[]
}

export type QuotationConversionClaim = { quote: QuotationRow; alreadyConverted: boolean }

function lineData({ inactive: _inactive, ...line }: PricedCatalogLine) {
    return line
}

function catalogLines(lines: QuotationRow['lines']) {
    return lines.map((l) => ({ productId: l.productId, quantity: l.quantity.toNumber() }))
}

/**
 * SD quotations for CRM opportunities. SD owns lines, prices, validity and status; CRM starts
 * quotations and shows them. Prices follow the catalog while DRAFT and are frozen when sent.
 * Status changes are guarded on the expected status (see quotation.rules.ts).
 */
@Injectable()
export class QuotationService {
    constructor(private readonly prisma: PrismaService) {}

    async findOne(id: string) {
        const [quote] = await this.views(this.prisma, [await this.load(this.prisma, id)])
        return quote
    }

    async list(query: ListQuotationsQueryDto) {
        const rows = await this.prisma.sdQuotation.findMany({
            where: {
                crmOpportunityId: query.crmOpportunityId,
                customerId: query.customerId,
                status: query.status,
            },
            include: QUOTATION_INCLUDE,
            orderBy: [{ createdAt: 'desc' }],
            take: query.limit ?? 50,
        })
        return this.views(this.prisma, rows)
    }

    async listForOpportunity(crmOpportunityId: string) {
        return this.list({ crmOpportunityId, limit: 200 })
    }

    /** New DRAFT, revision 1, priced from the catalog. 409 if the opportunity already has an active quotation. */
    async create(input: CreateQuotationInput, options: { tx?: Client } = {}) {
        assertCatalogLineInput(input.lines)
        try {
            const client = options.tx ?? this.prisma
            const row = options.tx
                ? await this.createIn(options.tx, input)
                : await this.prisma.$transaction((tx) => this.createIn(tx, input))
            const [quote] = await this.views(client, [row])
            return quote
        } catch (error) {
            if (this.isActiveQuotationConflict(error)) {
                throw this.activeQuotationExists(await this.findActiveForOpportunity(this.prisma, input.crmOpportunityId))
            }
            throw error
        }
    }

    /** Edits a DRAFT; every edit re-prices all lines from the current catalog. */
    async updateDraft(id: string, input: UpdateQuotationDraftInput, userId: string) {
        if (input.lines) assertCatalogLineInput(input.lines)
        const row = await this.prisma.$transaction(async (tx) => {
            await this.lock(tx, id)
            const current = await this.load(tx, id)
            nextQuotationStatus(current.status, 'EDIT')
            const pricing = await priceCatalogLines(tx, input.lines ?? catalogLines(current.lines))
            const { divisionId } = assertSellable(pricing)

            await tx.sdQuotation.update({
                where: { id },
                data: {
                    divisionId,
                    subtotal: pricing.subtotal,
                    totalAmount: pricing.subtotal,
                    ...(input.notes !== undefined && { notes: input.notes.trim() || null }),
                    updatedBy: userId,
                },
            })
            await tx.sdQuotationLine.deleteMany({ where: { quotationId: id } })
            await tx.sdQuotationLine.createMany({
                data: pricing.lines.map((l) => ({ quotationId: id, ...lineData(l) })),
            })
            return this.load(tx, id)
        })
        return (await this.views(this.prisma, [row]))[0]
    }

    /**
     * DRAFT → SENT, freezing prices. The draft is re-priced first: if any unit price changed, the new
     * prices are saved on the draft and 409 QUOTATION_PRICES_CHANGED is returned so the rep reviews them
     * before sending. Unavailable products and an unbillable customer also block sending.
     */
    async send(id: string, input: SendQuotationInput, userId: string) {
        const now = new Date()
        const validUntil = resolveValidUntil(input.validUntil, now)

        const outcome = await this.prisma.$transaction(async (tx) => {
            await this.lock(tx, id)
            const current = await this.load(tx, id)
            nextQuotationStatus(current.status, 'SEND')
            await loadBillableCustomer(tx, current.customerId)

            const pricing = await priceCatalogLines(tx, catalogLines(current.lines))
            const unavailable = this.lineIssues(current.lines, pricing)
            if (unavailable.length) {
                throw new ConflictException({
                    code: 'QUOTATION_UNAVAILABLE_PRODUCTS',
                    message: `Remove unavailable product(s) before sending: ${unavailable.map((l) => l.sku).join(', ')}`,
                    lines: unavailable,
                })
            }
            const { divisionId } = assertSellable(pricing)

            const byNumber = new Map(pricing.lines.map((l) => [l.lineNumber, l]))
            const changedLines = current.lines
                .map((line) => ({ line, priced: byNumber.get(line.lineNumber)! }))
                .filter(({ line, priced }) => !line.unitPrice.eq(priced.unitPrice))
                .map(({ line, priced }) => ({
                    lineNumber: line.lineNumber,
                    sku: priced.sku,
                    previousUnitPrice: line.unitPrice.toFixed(2),
                    unitPrice: priced.unitPrice.toFixed(2),
                }))
            await this.refreshLines(tx, current.lines, pricing.lines)

            await tx.sdQuotation.update({
                where: { id },
                data: changedLines.length
                    ? { divisionId, subtotal: pricing.subtotal, totalAmount: pricing.subtotal, updatedBy: userId }
                    : {
                          status: nextQuotationStatus(current.status, 'SEND'),
                          divisionId,
                          subtotal: pricing.subtotal,
                          totalAmount: pricing.subtotal,
                          validUntil,
                          sentBy: userId,
                          sentAt: now,
                          updatedBy: userId,
                      },
            })
            return { changedLines }
        })

        if (outcome.changedLines.length) {
            throw new ConflictException({
                code: 'QUOTATION_PRICES_CHANGED',
                message: 'Catalog prices changed; review the updated prices before sending',
                changedLines: outcome.changedLines,
            })
        }
        return this.findOne(id)
    }

    /**
     * New DRAFT revision (same number, revision + 1) with the lines copied and re-priced from the
     * current catalog. A SENT / ACCEPTED original becomes SUPERSEDED; a REJECTED / EXPIRED one keeps
     * its status. Lines for deleted products keep their snapshot and, like inactive ones, block Send.
     */
    async revise(id: string, input: ReviseQuotationInput, userId: string) {
        const revisionNotes = input.notes?.trim() || null
        if (input.reason === 'OTHER' && !revisionNotes) {
            throw new BadRequestException('Revision notes are required when the reason is OTHER')
        }
        await this.expireOverdue(this.prisma, (await this.load(this.prisma, id)).crmOpportunityId)

        try {
            const row = await this.prisma.$transaction(async (tx) => {
                await this.lock(tx, id)
                const current = await this.load(tx, id)
                const revisedStatus = nextQuotationStatus(current.status, 'REVISE')
                const successor = await tx.sdQuotation.findUnique({
                    where: { previousRevisionId: id },
                    select: { revision: true },
                })
                if (successor) throw this.alreadyRevised(current, successor.revision)
                const order = await tx.sdSalesOrder.findUnique({
                    where: { crmOpportunityId: current.crmOpportunityId },
                    select: { orderNumber: true },
                })
                if (order) {
                    throw new ConflictException({
                        code: 'QUOTATION_OPPORTUNITY_ORDERED',
                        message: `The opportunity already has sales order ${order.orderNumber}; it cannot be quoted again`,
                    })
                }
                if (revisedStatus !== current.status) {
                    await tx.sdQuotation.update({
                        where: { id },
                        data: { status: revisedStatus, updatedBy: userId },
                    })
                }
                const active = await this.findActiveForOpportunity(tx, current.crmOpportunityId)
                if (active) throw this.activeQuotationExists(active)

                const pricing = await priceCatalogLines(tx, catalogLines(current.lines))
                const priced = new Map(pricing.lines.map((l) => [l.productId, l]))
                const lines = current.lines.map((line, idx) => {
                    const next = priced.get(line.productId)
                    return next
                        ? { ...lineData(next), lineNumber: idx + 1 }
                        : {
                              lineNumber: idx + 1,
                              productId: line.productId,
                              sku: line.sku,
                              description: line.description,
                              quantity: line.quantity,
                              unitPrice: line.unitPrice,
                              lineTotal: line.lineTotal,
                          }
                })
                const subtotal = lines.reduce(
                    (sum, l) => sum.add(l.lineTotal),
                    new Prisma.Decimal(0),
                )

                return tx.sdQuotation.create({
                    data: {
                        quotationNumber: current.quotationNumber,
                        revision: current.revision + 1,
                        previousRevisionId: id,
                        revisionReason: input.reason,
                        revisionNotes,
                        crmOpportunityId: current.crmOpportunityId,
                        customerId: current.customerId,
                        divisionId: pricing.divisions.length === 1 ? pricing.divisions[0] : current.divisionId,
                        currency: current.currency,
                        status: 'DRAFT',
                        subtotal,
                        totalAmount: subtotal,
                        notes: current.notes,
                        createdBy: userId,
                        updatedBy: userId,
                        lines: { create: lines },
                    },
                    include: QUOTATION_INCLUDE,
                })
            })
            return (await this.views(this.prisma, [row]))[0]
        } catch (error) {
            if (this.isActiveQuotationConflict(error)) {
                const current = await this.load(this.prisma, id)
                throw this.activeQuotationExists(await this.findActiveForOpportunity(this.prisma, current.crmOpportunityId))
            }
            if (this.uniqueTarget(error)?.some((f) => f === 'previousRevisionId' || f === 'revision')) {
                throw this.alreadyRevised(await this.load(this.prisma, id))
            }
            throw error
        }
    }

    /** SENT → ACCEPTED (not after the validity date). */
    async accept(id: string, input: { note?: string }, userId: string) {
        return this.decide(id, 'ACCEPT', userId, (now) => ({
            decidedBy: userId,
            decidedAt: now,
            decisionReason: input.note?.trim() || null,
        }))
    }

    /** SENT → REJECTED with the customer's reason. */
    async reject(id: string, input: { reason: string }, userId: string) {
        const reason = input.reason?.trim()
        if (!reason) throw new BadRequestException('A rejection reason is required')
        return this.decide(id, 'REJECT', userId, (now) => ({
            decidedBy: userId,
            decidedAt: now,
            decisionReason: reason,
        }))
    }

    /** DRAFT / SENT / ACCEPTED → CANCELLED. */
    async cancel(id: string, input: { reason?: string }, userId: string) {
        return this.decide(id, 'CANCEL', userId, (now) => ({
            cancelledBy: userId,
            cancelledAt: now,
            cancelReason: input.reason?.trim() || null,
        }))
    }

    /**
     * Inside the caller's transaction: locks the quotation, checks it may become the sales order for
     * this opportunity and customer, and marks it CONVERTED. `alreadyConverted` means a concurrent
     * conversion committed first; the caller returns that order instead of creating one.
     */
    async claimForConversion(
        tx: Client,
        input: { quotationId: string; crmOpportunityId: string; customerId: string; convertedBy: string | null },
        now = new Date(),
    ): Promise<QuotationConversionClaim> {
        await this.lock(tx, input.quotationId)
        const quote = await this.load(tx, input.quotationId)
        if (quote.crmOpportunityId !== input.crmOpportunityId) {
            throw new ConflictException({
                code: 'QUOTATION_OPPORTUNITY_MISMATCH',
                message: `Quotation ${quote.quotationNumber} belongs to another opportunity`,
            })
        }
        if (quote.status === 'CONVERTED') return { quote, alreadyConverted: true }
        if (isQuotationExpired(quote, now)) {
            throw new ConflictException({
                code: 'QUOTATION_EXPIRED',
                message: `Quotation ${quote.quotationNumber} rev ${quote.revision} expired on ${manilaDate(quote.validUntil!)}; revise or cancel it`,
                quotationId: quote.id,
            })
        }
        const status = nextQuotationStatus(quote.status, 'CONVERT')
        if (quote.customerId !== input.customerId) {
            throw new ConflictException({
                code: 'QUOTATION_CUSTOMER_MISMATCH',
                message: `Quotation ${quote.quotationNumber} was made for a different customer; cancel it or change the opportunity back`,
            })
        }
        await tx.sdQuotation.update({
            where: { id: quote.id },
            data: { status, convertedBy: input.convertedBy, convertedAt: now, updatedBy: input.convertedBy },
        })
        return { quote, alreadyConverted: false }
    }

    /**
     * Persists EXPIRED on the opportunity's overdue SENT / ACCEPTED quotation so it no longer holds the
     * active slot. Called before quotation-changing operations; reads never write.
     */
    async expireOverdue(client: Client, crmOpportunityId: string, now = new Date()) {
        const { count } = await client.sdQuotation.updateMany({
            where: {
                crmOpportunityId,
                status: { in: [...EXPIRABLE_QUOTATION_STATUSES] },
                validUntil: { lt: now },
            },
            data: { status: 'EXPIRED' },
        })
        return count
    }

    /**
     * Inside the caller's transaction (CRM Closed Lost): overdue quotations become EXPIRED, the
     * remaining DRAFT / SENT / ACCEPTED one is CANCELLED. Returns the number cancelled.
     */
    async cancelActiveForOpportunity(
        tx: Client,
        crmOpportunityId: string,
        input: { cancelledBy: string; reason: string },
        now = new Date(),
    ) {
        await this.expireOverdue(tx, crmOpportunityId, now)
        const { count } = await tx.sdQuotation.updateMany({
            where: { crmOpportunityId, status: { in: [...ACTIVE_QUOTATION_STATUSES] } },
            data: {
                status: 'CANCELLED',
                cancelledBy: input.cancelledBy,
                cancelledAt: now,
                cancelReason: input.reason,
                updatedBy: input.cancelledBy,
            },
        })
        return count
    }

    /** P2002 from the partial index "sd_quotations_one_active_per_opportunity". */
    isActiveQuotationConflict(error: unknown) {
        return (
            (error as Prisma.PrismaClientKnownRequestError)?.meta?.modelName === 'SdQuotation' &&
            !!this.uniqueTarget(error)?.some(
                (f) => f === 'crmOpportunityId' || f === 'sd_quotations_one_active_per_opportunity',
            )
        )
    }

    /** Accept / reject / cancel: expiry is persisted first (own statement), then the guarded transition. */
    private async decide(
        id: string,
        action: QuotationAction,
        userId: string,
        data: (now: Date) => Prisma.SdQuotationUpdateInput,
    ) {
        const now = new Date()
        await this.expireOverdue(this.prisma, (await this.load(this.prisma, id)).crmOpportunityId, now)
        const row = await this.prisma.$transaction(async (tx) => {
            await this.lock(tx, id)
            const current = await this.load(tx, id)
            const status = nextQuotationStatus(current.status, action)
            await tx.sdQuotation.update({
                where: { id },
                data: { ...data(now), status, updatedBy: userId },
            })
            return this.load(tx, id)
        })
        return (await this.views(this.prisma, [row]))[0]
    }

    private async createIn(tx: Client, input: CreateQuotationInput) {
        await this.expireOverdue(tx, input.crmOpportunityId)
        const active = await this.findActiveForOpportunity(tx, input.crmOpportunityId)
        if (active) throw this.activeQuotationExists(active)

        await loadBillableCustomer(tx, input.customerId)
        const pricing = await priceCatalogLines(tx, input.lines)
        const { divisionId } = assertSellable(pricing)
        const [{ value }] = await tx.$queryRaw<{ value: bigint }[]>`
            SELECT nextval('sd_quotation_number_seq') AS value`

        return tx.sdQuotation.create({
            data: {
                quotationNumber: formatQuotationNumber(value),
                revision: 1,
                crmOpportunityId: input.crmOpportunityId,
                customerId: input.customerId,
                divisionId,
                currency: SD_CATALOG_CURRENCY,
                status: 'DRAFT',
                subtotal: pricing.subtotal,
                totalAmount: pricing.subtotal,
                notes: input.notes?.trim() || null,
                createdBy: input.createdBy,
                updatedBy: input.createdBy,
                lines: { create: pricing.lines.map(lineData) },
            },
            include: QUOTATION_INCLUDE,
        })
    }

    /** Display fields; DRAFT lines are checked against the catalog (one product query per call). */
    private async views(client: Client, rows: QuotationRow[], now = new Date()): Promise<QuotationView[]> {
        const draftProductIds = [
            ...new Set(rows.filter((r) => r.status === 'DRAFT').flatMap((r) => r.lines.map((l) => l.productId))),
        ]
        const products = draftProductIds.length
            ? await client.sdProduct.findMany({
                  where: { id: { in: draftProductIds } },
                  select: { id: true, isActive: true },
              })
            : []
        const active = new Map(products.map((p) => [p.id, p.isActive]))
        return rows.map((row) => ({
            ...row,
            effectiveStatus: effectiveQuotationStatus(row, now),
            isExpired: isQuotationExpired(row, now),
            lineIssues:
                row.status !== 'DRAFT'
                    ? []
                    : row.lines.flatMap((l): QuotationLineIssue[] =>
                          !active.has(l.productId)
                              ? [{ lineNumber: l.lineNumber, sku: l.sku, reason: 'NOT_FOUND' }]
                              : active.get(l.productId)
                                ? []
                                : [{ lineNumber: l.lineNumber, sku: l.sku, reason: 'INACTIVE' }],
                      ),
        }))
    }

    private lineIssues(
        lines: QuotationRow['lines'],
        pricing: Awaited<ReturnType<typeof priceCatalogLines>>,
    ): QuotationLineIssue[] {
        return [
            ...lines
                .filter((l) => pricing.unknownProductIds.includes(l.productId))
                .map((l) => ({ lineNumber: l.lineNumber, sku: l.sku, reason: 'NOT_FOUND' as const })),
            ...pricing.lines
                .filter((l) => l.inactive)
                .map((l) => ({ lineNumber: l.lineNumber, sku: l.sku, reason: 'INACTIVE' as const })),
        ]
    }

    /** Writes catalog SKU / name / price onto lines that differ (quantities are unchanged). */
    private async refreshLines(tx: Client, current: QuotationRow['lines'], priced: PricedCatalogLine[]) {
        const byNumber = new Map(priced.map((l) => [l.lineNumber, l]))
        for (const line of current) {
            const next = byNumber.get(line.lineNumber)!
            if (
                line.unitPrice.eq(next.unitPrice) &&
                line.lineTotal.eq(next.lineTotal) &&
                line.sku === next.sku &&
                line.description === next.description
            ) {
                continue
            }
            await tx.sdQuotationLine.update({
                where: { id: line.id },
                data: {
                    sku: next.sku,
                    description: next.description,
                    unitPrice: next.unitPrice,
                    lineTotal: next.lineTotal,
                },
            })
        }
    }

    /** The opportunity's DRAFT / SENT / ACCEPTED quotation (at most one, partial unique index). */
    findActiveForOpportunity(client: Client, crmOpportunityId: string) {
        return client.sdQuotation.findFirst({
            where: { crmOpportunityId, status: { in: [...ACTIVE_QUOTATION_STATUSES] } },
        })
    }

    private activeQuotationExists(
        active: { id: string; quotationNumber: string; revision: number; status: string } | null,
    ) {
        return new ConflictException({
            code: 'QUOTATION_ACTIVE_EXISTS',
            message: active
                ? `This opportunity already has an active quotation (${active.quotationNumber} rev ${active.revision}, ${active.status}); revise, send or cancel it instead`
                : 'This opportunity already has an active quotation',
            quotationId: active?.id ?? null,
        })
    }

    private alreadyRevised(quote: { quotationNumber: string; revision: number }, successorRevision?: number) {
        return new ConflictException({
            code: 'QUOTATION_ALREADY_REVISED',
            message: `${quote.quotationNumber} rev ${quote.revision} was already revised${successorRevision ? ` (rev ${successorRevision})` : ''}; work on the latest revision`,
        })
    }

    private uniqueTarget(error: unknown) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null
        const target = error.meta?.target
        return Array.isArray(target) ? target.map(String) : [String(target)]
    }

    /** Row lock for the rest of the transaction; serializes edits, sends and status changes. */
    private async lock(tx: Client, id: string) {
        const rows = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "sd_quotations" WHERE "id" = ${id} FOR UPDATE`
        if (!rows.length) throw new NotFoundException('Quotation not found')
    }

    private async load(client: Client, id: string) {
        const row = await client.sdQuotation.findUnique({ where: { id }, include: QUOTATION_INCLUDE })
        if (!row) throw new NotFoundException('Quotation not found')
        return row
    }
}
