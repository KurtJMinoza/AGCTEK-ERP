import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma, type CrmOpportunity } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { MODULE_CODES } from '../../permissions/permissions.constants'
import { PermissionsService } from '../../permissions/permissions.service'
import { QuotationService } from '../../sd/quotation.service'
import { SalesOrderService } from '../../sd/sales-order.service'
import { CreateOpportunitySalesOrderDto, WinOpportunityDto } from './dto/opportunity.dto'
import {
    activeQuotationBlocks,
    CrmOpportunitiesService,
    lockOpportunity,
    wonUpdateData,
} from './opportunities.service'

type SdOrder = Awaited<ReturnType<SalesOrderService['findOne']>>

type SdOrderLike = {
    id: string
    orderNumber: string
    status: string
    channel: string
    source: string
    currency: string
    totalAmount: { toFixed(dp: number): string } | null
    lines: unknown[]
    createdAt: Date
}

type HandoffUser = { id: string; role: string }

type HandoffLine = { productId: string; quantity: number }

type HandoffSourceInput = { lines?: HandoffLine[]; quotationId?: string; notes?: string }

const MAX_HANDOFF_ATTEMPTS = 3

/** The opportunity row no longer matches what the handoff read; checked again after rollback. */
class LinkConflict extends ConflictException {
    constructor() {
        super('Opportunity changed concurrently, reload and retry')
    }
}

/** Read-only view of the SD order shown in CRM; SD stays the owner of the document. */
export function salesOrderSummary(order: SdOrderLike) {
    return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        channel: order.channel,
        source: order.source,
        currency: order.currency,
        totalAmount: order.totalAmount === null ? null : order.totalAmount.toFixed(2),
        lineCount: order.lines.length,
        createdAt: order.createdAt,
    }
}

/**
 * Closed Won → SD handoff. Winning creates the SD order (ECOMMERCE / CRM) and commits
 * CLOSED_WON in one transaction, so an opportunity is never won by a failed handoff.
 * `sdSalesOrderId` is written once and never overwritten or cleared by CRM.
 */
@Injectable()
export class CrmOpportunityHandoffService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly opportunities: CrmOpportunitiesService,
        private readonly salesOrders: SalesOrderService,
        private readonly permissions: PermissionsService,
        private readonly quotations: QuotationService,
    ) {}

    async salesOrder(id: string) {
        const opp = await this.findRow(id)
        if (!opp.sdSalesOrderId) {
            throw new NotFoundException('No SD sales order is linked to this opportunity')
        }
        return salesOrderSummary(await this.salesOrders.findOne(opp.sdSalesOrderId))
    }

    /** POST :id/win — idempotent: a won opportunity returns its linked order (`created: false`). */
    async win(id: string, dto: WinOpportunityDto, user: HandoffUser) {
        const current = await this.findRow(id)
        if (current.stage === 'CLOSED_WON') {
            if (current.sdSalesOrderId) return this.linkedResult(id, current.sdSalesOrderId)
            throw new ConflictException(
                'This opportunity is already Closed Won without an SD sales order; use Retry ERP handoff',
            )
        }
        await this.opportunities.assertCanWin(current)

        const guard = { id, stage: current.stage, updatedAt: current.updatedAt }
        if (current.sdSalesOrderId) {
            // Re-winning after a reopen keeps the order created the first time.
            const won = await this.prisma.crmOpportunity.updateMany({
                where: { ...guard, sdSalesOrderId: current.sdSalesOrderId },
                data: wonUpdateData(user.id),
            })
            if (won.count === 0) throw new LinkConflict()
            return this.linkedResult(id, current.sdSalesOrderId)
        }

        return this.handoff(
            current,
            dto,
            user,
            (tx, salesOrderId) =>
                tx.crmOpportunity.updateMany({
                    where: { ...guard, sdSalesOrderId: null },
                    data: { ...wonUpdateData(user.id), sdSalesOrderId: salesOrderId },
                }),
            (fresh) => fresh.stage === 'CLOSED_WON' && !!fresh.sdSalesOrderId,
        )
    }

    /** Retry ERP handoff: Closed Won without an SD order (e.g. won before the handoff existed). */
    async createSalesOrder(id: string, dto: CreateOpportunitySalesOrderDto, user: HandoffUser) {
        const current = await this.findRow(id)
        if (current.sdSalesOrderId) return this.linkedResult(id, current.sdSalesOrderId)
        if (current.stage !== 'CLOSED_WON') {
            throw new ConflictException(
                'Close the opportunity as won (POST /crm/opportunities/:id/win) to create its SD sales order',
            )
        }
        return this.handoff(
            current,
            dto,
            user,
            (tx, salesOrderId) =>
                tx.crmOpportunity.updateMany({
                    where: { id, stage: 'CLOSED_WON', sdSalesOrderId: null },
                    data: { sdSalesOrderId: salesOrderId, updatedBy: user.id },
                }),
            (fresh) => !!fresh.sdSalesOrderId,
        )
    }

    /**
     * Creates (or finds) the SD order and runs `link` in one transaction. A unique-key
     * collision or stale row rolls everything back; the opportunity is then re-read and
     * either already `done` (concurrent / earlier handoff won) or the transaction retried.
     */
    private async handoff(
        current: CrmOpportunity,
        dto: HandoffSourceInput,
        user: HandoffUser,
        link: (tx: Prisma.TransactionClient, salesOrderId: string) => Promise<{ count: number }>,
        done: (fresh: CrmOpportunity) => boolean,
    ) {
        if (dto.quotationId && dto.lines?.length) {
            throw new BadRequestException('Send either a quotation or lines, not both')
        }
        await this.permissions.assertPermission({ role: user.role }, MODULE_CODES.SD, 'create')
        let source: Awaited<ReturnType<typeof this.commercialSource>>
        try {
            source = await this.commercialSource(current.id, dto)
        } catch (error) {
            // A concurrent handoff may have just converted the quotation this request relied on.
            const fresh = await this.findRow(current.id)
            if (done(fresh)) return this.linkedResult(current.id, fresh.sdSalesOrderId!)
            throw error
        }

        const input = {
            crmOpportunityId: current.id,
            customerId: current.customerId,
            ...source,
            notes: this.handoffNotes(current, dto.notes),
            salesOwnerId: current.assignedTo ?? user.id,
            createdBy: user.id,
        }

        for (let attempt = 0; attempt < MAX_HANDOFF_ATTEMPTS; attempt++) {
            try {
                const result = await this.prisma.$transaction(async (tx) => {
                    await lockOpportunity(tx, current.id)
                    if (source.lines) {
                        const active = await this.quotations.findActiveForOpportunity(tx, current.id)
                        if (active) throw this.quotationNotUsed(active)
                    }
                    const order = await this.salesOrders.createFromCrmOpportunity(input, {
                        tx,
                        attempt,
                    })
                    if (order.customerId !== current.customerId) {
                        throw new ConflictException(
                            `SD order ${order.orderNumber} was already created for this opportunity with a different customer; resolve it in SD`,
                        )
                    }
                    const linked = await link(tx, order.salesOrderId)
                    if (linked.count === 0) throw new LinkConflict()
                    return order
                })
                return this.result(
                    current.id,
                    await this.salesOrders.findOne(result.salesOrderId),
                    result.created,
                )
            } catch (error) {
                const retryable = this.salesOrders.isRetryableCrmHandoffConflict(error)
                if (!retryable && !(error instanceof LinkConflict)) throw error
                const fresh = await this.findRow(current.id)
                if (done(fresh)) return this.linkedResult(current.id, fresh.sdSalesOrderId!)
                if (!retryable) throw error
            }
        }
        throw new ConflictException('Could not create the SD sales order; retry')
    }

    /**
     * Where the order's lines come from. Overdue quotations are expired first (own statement, so
     * the expiry persists even when this returns 409). A DRAFT blocks the win; a SENT / ACCEPTED
     * quotation must be used (explicitly or by default) and cannot be bypassed with lines.
     */
    private async commercialSource(
        opportunityId: string,
        dto: HandoffSourceInput,
    ): Promise<{ quotationId: string; lines?: undefined } | { lines: HandoffLine[]; quotationId?: undefined }> {
        await this.quotations.expireOverdue(this.prisma, opportunityId)
        if (dto.quotationId) {
            const quote = await this.quotations.findOne(dto.quotationId)
            if (quote.status === 'EXPIRED') {
                throw new ConflictException({
                    code: 'QUOTATION_EXPIRED',
                    message: `Quotation ${quote.quotationNumber} rev ${quote.revision} has expired; revise it or close the opportunity with product lines`,
                    quotationId: quote.id,
                })
            }
            return { quotationId: quote.id }
        }
        const active = await this.quotations.findActiveForOpportunity(this.prisma, opportunityId)
        if (active?.status === 'DRAFT') {
            throw new ConflictException({
                code: 'QUOTATION_DRAFT_PENDING',
                message: `Quotation ${active.quotationNumber} rev ${active.revision} is still a DRAFT; send or cancel the draft quotation first`,
                quotationId: active.id,
            })
        }
        if (active) {
            if (dto.lines?.length) throw this.quotationNotUsed(active)
            return { quotationId: active.id }
        }
        if (!dto.lines?.length) {
            throw new BadRequestException(
                'At least one SD product line is required to create the sales order',
            )
        }
        return { lines: dto.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) }
    }

    private quotationNotUsed(active: { id: string; quotationNumber: string; revision: number; status: string }) {
        return activeQuotationBlocks(
            active,
            active.status === 'DRAFT'
                ? 'send or cancel the draft quotation first'
                : 'close the opportunity from the quotation or cancel it first',
        )
    }

    private async linkedResult(id: string, salesOrderId: string) {
        return this.result(id, await this.salesOrders.findOne(salesOrderId), false)
    }

    private async result(id: string, order: SdOrder, created: boolean) {
        return {
            opportunity: await this.opportunities.findOne(id),
            salesOrder: salesOrderSummary(order),
            created,
        }
    }

    private handoffNotes(
        opp: { id: string; name: string; currency: string; amount: { toFixed(dp: number): string } | null },
        notes?: string,
    ) {
        const parts = [`CRM opportunity "${opp.name}" (${opp.id})`]
        if (opp.amount !== null) {
            parts.push(`Estimated amount (CRM): ${opp.currency} ${opp.amount.toFixed(2)}`)
        }
        const extra = notes?.trim()
        if (extra) parts.push(extra)
        return parts.join('\n')
    }

    private async findRow(id: string) {
        const row = await this.prisma.crmOpportunity.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Opportunity not found')
        return row
    }
}
