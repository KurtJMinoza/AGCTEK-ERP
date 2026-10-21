import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { findCustomerMasterId } from '../../sd/customer-master'
import { ReturnRequestService } from '../../sd/return-request.service'
import { ticketInclude } from './tickets.service'

type CaseUser = { id: string; role: string }
type SdReturnCase = Awaited<ReturnType<ReturnRequestService['findForCase']>>

const TERMINAL_TICKET_STATUSES: ReadonlySet<string> = new Set(['CLOSED', 'CANCELLED'])
const APPROVED_RETURN_STATUSES: ReadonlySet<string> = new Set(['AWAITING_RETURN', 'APPROVED'])
/** SD approval also starts MM reservation / picking for the replacement order. */
const DECISION_TIMEOUT_MS = 60_000

const RESOLUTION_LABELS: Record<string, string> = {
    REPLACEMENT: 'Replacement',
    REFUND: 'Refund',
    STORE_CREDIT: 'Store credit',
}

const label = (code: string | null | undefined) =>
    code ? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ') : ''

/** Read-only view of the SD return shown on the CRM case; SD stays the owner. */
export function toReturnCaseView(request: SdReturnCase) {
    return {
        id: request.id,
        requestNumber: request.requestNumber,
        status: request.status,
        preferredResolution: request.preferredResolution,
        refundStatus: request.refundStatus,
        reason: request.reason,
        conditionNote: request.conditionNote,
        createdAt: request.createdAt,
        approvedAt: request.approvedAt,
        rejectedAt: request.rejectedAt,
        rejectReason: request.rejectReason,
        salesOrder: {
            id: request.salesOrderId,
            orderNumber: request.salesOrder.orderNumber,
            status: request.salesOrder.status,
        },
        lines: request.lines.map((line) => ({
            id: line.id,
            sku: line.salesOrderLine.productSkuSnapshot ?? line.salesOrderLine.sku,
            name: line.salesOrderLine.productNameSnapshot,
            quantity: line.quantity.toString(),
            reason: line.reason,
            disposition: line.disposition,
        })),
        mmCustomerReturn: request.mmCustomerReturn,
        replacementOrder: request.replacementOrder,
    }
}

function caseDescription(request: SdReturnCase) {
    const items = request.lines
        .map((line) => `${line.salesOrderLine.productSkuSnapshot ?? line.salesOrderLine.sku ?? 'item'} × ${line.quantity.toString()}`)
        .join(', ')
    return [
        `Customer requested: ${RESOLUTION_LABELS[request.preferredResolution ?? ''] ?? 'no preference'}`,
        request.reason ? `Reason: ${label(request.reason)}` : null,
        `Items (${request.lines.length}): ${items}`,
        request.conditionNote ? `Customer note: ${request.conditionNote}` : null,
        request.preferredResolution === 'REFUND'
            ? 'Refund: recorded in SD after inspection and paid by finance (no payment is made from CRM or SD).'
            : null,
    ]
        .filter(Boolean)
        .join('\n')
}

const isUniqueViolation = (err: unknown, field: string) =>
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    [err.meta?.target].flat().map(String).some((t) => t.includes(field))

function approvalComment(request: SdReturnCase) {
    const replacement = request.preferredResolution === 'REPLACEMENT'
    return [
        `Return ${request.requestNumber} approved for ${replacement ? 'replacement' : label(request.preferredResolution).toLowerCase() || 'return'}.`,
        request.mmCustomerReturn
            ? `MM customer return ${request.mmCustomerReturn.returnNumber} is expecting the inbound package.`
            : null,
        request.replacementOrder
            ? `Replacement order ${request.replacementOrder.orderNumber} (no charge) goes to picking.`
            : null,
        request.preferredResolution === 'REFUND'
            ? 'The refund is recorded in SD after inspection and paid by finance.'
            : null,
    ]
        .filter(Boolean)
        .join(' ')
}

/**
 * CRM case for an SD customer return (RMA hand-off). The agent decides the return on the case
 * (approve / reject); CRM asks SD to apply the decision. SD owns the return, MM the inbound package,
 * SD the replacement order and refund record, finance the refund payment.
 */
@Injectable()
export class CrmReturnCasesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly returnRequests: ReturnRequestService,
    ) {}

    /** Opens the case for a return, or returns the existing one (one ticket per return). */
    async openForReturn(returnRequestId: string, actorId: string | null) {
        const existing = await this.findByReturn(returnRequestId)
        if (existing) return { ticket: existing, created: false }

        const request = await this.returnRequests.findForCase(returnRequestId)
        const customerId = await findCustomerMasterId(this.prisma, request.customerId)
        if (!customerId) {
            throw new ConflictException(
                `Return ${request.requestNumber}: the shop account has no Customer Master record; link it in Customer Master first`,
            )
        }
        try {
            const ticket = await this.prisma.crmTicket.create({
                data: {
                    customerId,
                    subject: `Return ${request.requestNumber} · ${request.salesOrder.orderNumber}`,
                    description: caseDescription(request),
                    category: 'RETURN',
                    priority: 'MEDIUM',
                    sdReturnRequestId: request.id,
                    salesOrderId: request.salesOrderId,
                    returnRequestNumber: request.requestNumber,
                    createdBy: actorId,
                    updatedBy: actorId,
                },
                include: ticketInclude,
            })
            return { ticket, created: true }
        } catch (err) {
            if (!isUniqueViolation(err, 'sdReturnRequestId')) throw err
            const winner = await this.findByReturn(returnRequestId)
            if (!winner) throw err
            return { ticket: winner, created: false }
        }
    }

    /** The SD return linked to a ticket, read live from SD. */
    async returnForTicket(ticketId: string) {
        const ticket = await this.linkedTicket(ticketId)
        return toReturnCaseView(await this.returnRequests.findForCase(ticket.sdReturnRequestId))
    }

    /**
     * Agent approves the return with the customer's chosen resolution. SD approves it: MM opens the
     * customer return that expects the inbound package; for a Replacement SD also opens the
     * no-charge replacement order for picking; a Refund is recorded in SD after inspection and paid
     * by finance. Repeating the call returns the approved return.
     */
    async approveReturn(ticketId: string, user: CaseUser) {
        return this.decide(ticketId, async (tx, request) => {
            const wasRequested = request.status === 'REQUESTED'
            try {
                await this.returnRequests.approve(request.id, request.companyId, user.id, {
                    preferredResolution: request.preferredResolution ?? undefined,
                    fromCase: true,
                })
            } catch (err) {
                const current = await this.returnRequests.findForCase(request.id)
                if (!APPROVED_RETURN_STATUSES.has(current.status)) throw err
            }
            const approved = await this.returnRequests.findForCase(request.id)
            if (wasRequested && APPROVED_RETURN_STATUSES.has(approved.status)) {
                await tx.crmTicketComment.create({
                    data: { ticketId, authorId: user.id, body: approvalComment(approved) },
                })
            }
            return approved
        })
    }

    /** Agent rejects the return (reason required); SD records the rejection. Repeat-safe. */
    async rejectReturn(ticketId: string, reason: string, user: CaseUser) {
        const trimmed = reason.trim()
        if (!trimmed) throw new BadRequestException('A reason is required to reject a return')
        return this.decide(ticketId, async (tx, request) => {
            if (request.status === 'REJECTED') return request
            if (request.status !== 'REQUESTED') {
                throw new ConflictException(
                    `Only a requested return can be rejected (Return ${request.requestNumber} is ${label(request.status).toLowerCase()})`,
                )
            }
            await this.returnRequests.reject(request.id, request.companyId, {
                reason: trimmed,
                performedBy: user.id,
                fromCase: true,
            })
            await tx.crmTicketComment.create({
                data: {
                    ticketId,
                    authorId: user.id,
                    body: `Return ${request.requestNumber} rejected: ${trimmed}`,
                },
            })
            return this.returnRequests.findForCase(request.id)
        })
    }

    /** Decisions on one ticket run one at a time; SD's steps run in their own transactions meanwhile. */
    private async decide(
        ticketId: string,
        apply: (tx: Prisma.TransactionClient, request: SdReturnCase) => Promise<SdReturnCase>,
    ) {
        const ticket = await this.linkedTicket(ticketId)
        if (TERMINAL_TICKET_STATUSES.has(ticket.status)) {
            throw new ConflictException(`${ticket.status} tickets are read-only`)
        }
        const decided = await this.prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT "id" FROM "crm_tickets" WHERE "id" = ${ticket.id} FOR UPDATE`
                return apply(tx, await this.returnRequests.findForCase(ticket.sdReturnRequestId))
            },
            { timeout: DECISION_TIMEOUT_MS, maxWait: DECISION_TIMEOUT_MS },
        )
        return toReturnCaseView(decided)
    }

    private findByReturn(returnRequestId: string) {
        return this.prisma.crmTicket.findUnique({
            where: { sdReturnRequestId: returnRequestId },
            include: ticketInclude,
        })
    }

    private async linkedTicket(ticketId: string) {
        const ticket = await this.prisma.crmTicket.findUnique({
            where: { id: ticketId },
            select: { id: true, status: true, sdReturnRequestId: true },
        })
        if (!ticket) throw new NotFoundException('Ticket not found')
        if (!ticket.sdReturnRequestId) {
            throw new BadRequestException('This ticket is not linked to a customer return')
        }
        return { ...ticket, sdReturnRequestId: ticket.sdReturnRequestId }
    }
}

