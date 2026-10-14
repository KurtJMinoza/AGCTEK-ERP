import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'
import { CustomerReturnService } from '../mm/returns-disposal/customer-return.service'

/**
 * Sales Return status machine (Phase 4). Cancellation covers the
 * pre-picking/packing window; from delivery onward the correct flow is a
 * Sales Return (Phase 2 eligibility).
 */
export const RETURNABLE_ORDER_STATUSES: ReadonlySet<string> = new Set([
    'DELIVERED',
    'COMPLETED',
])

/** Sales Return statuses — module list order (Phase 4). */
export const SALES_RETURN_REQUEST_STATUSES = [
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'AWAITING_RETURN',
    'RECEIVED',
    'UNDER_INSPECTION',
    'RESTOCKED',
    'MARKED_DAMAGED',
    'SCRAPPED',
    'REFUNDED',
    'CLOSED',
    'CANCELLED',
] as const
export type SalesReturnRequestStatus =
    (typeof SALES_RETURN_REQUEST_STATUSES)[number]

/** Refund resolution states carried on the request (Phase 7 flow). */
export const REFUND_STATUSES = [
    'NONE',
    'NOT_REQUIRED',
    'PENDING_REFUND',
    'APPROVED',
    'PAID',
    'FAILED',
] as const

/** Refund methods selectable by the admin (Phase 7; external behavior DEMO ONLY). */
export const REFUND_METHODS = [
    'CASH_REFUND',
    'BANK_TRANSFER',
    'DIGITAL_WALLET',
    'STORE_CREDIT',
] as const
export type RefundMethod = (typeof REFUND_METHODS)[number]

/** Demo payment methods that never touch a real gateway. */
const DEMO_PAYMENT_METHODS = new Set([
    'CARD_DEMO',
    'WALLET_DEMO',
    'QR_DEMO',
    'BANK_TRANSFER_DEMO',
])

/** Return states that free the line quantity for a new request. */
const TERMINAL_RETURN_STATUSES: ReadonlyArray<string> = [
    'REJECTED',
    'CANCELLED',
    'CLOSED',
]

/** Preferred customer resolution for the returned items. */
export const PREFERRED_RESOLUTIONS = [
    'REFUND',
    'REPLACEMENT',
    'STORE_CREDIT',
] as const
export type PreferredResolution = (typeof PREFERRED_RESOLUTIONS)[number]

/**
 * Damage/quality reasons are inspected and dispositioned (never auto-restock).
 * Missing items are refund-only (no physical goods come back).
 */
const DAMAGED_REASONS = new Set(['DAMAGED_ITEM', 'DEFECTIVE_ITEM', 'EXPIRED_ITEM'])
const MISSING_REASONS = new Set(['MISSING_ITEM'])

/** MM disposition driven by a Sales Return admin mark action. */
export const MARK_DISPOSITIONS = ['RESTOCK', 'BLOCK', 'SCRAP', 'REPAIR'] as const
export type MarkDisposition = (typeof MARK_DISPOSITIONS)[number]

const SD_STATUS_BY_MARK: Record<MarkDisposition, SalesReturnRequestStatus> = {
    RESTOCK: 'RESTOCKED',
    BLOCK: 'MARKED_DAMAGED',
    SCRAP: 'SCRAPPED',
    // Needs-inspection → the goods move to quality-inspection stock; the
    // return stays under inspection until a final restock/damaged/scrap
    // decision is made on the MM side.
    REPAIR: 'UNDER_INSPECTION',
}

export type CreateReturnRequestInput = {
    companyId: string
    salesOrderId: string
    customerId: string
    reason?: string
    conditionNote?: string
    photos?: unknown
    requestedBy?: string
    preferredResolution?: string
    lines: Array<{
        salesOrderLineId: string
        quantity: number
        reason?: string
        conditionNote?: string
    }>
}

/** Composes a return request on behalf of a signed-in storefront customer. */
export type CreateCustomerReturnInput = {
    reason?: string
    conditionNote?: string
    photos?: unknown
    preferredResolution?: string
    lines: Array<{
        salesOrderLineId: string
        quantity: number
        reason?: string
        conditionNote?: string
    }>
}

type PrismaClientLike = PrismaService | Prisma.TransactionClient

/**
 * Customer return requests raised from delivered sales orders (storefront or
 * admin). Eligibility (Phase 2):
 * - Only DELIVERED / COMPLETED orders are returnable (never cancelled or
 *   pending-fulfillment orders).
 * - Storefront requests require the order to belong to the signed-in customer.
 * - Per-line return quantity cannot exceed the delivered quantity (issued via
 *   the ledger and/or dispatched packages).
 * - Prior non-terminal requests are subtracted so a duplicate request cannot
 *   over-return a line. Order lines are row-locked (FOR UPDATE) so the check
 *   is atomic.
 *
 * Approval hands the request to MM customer returns (intake → inspection →
 * disposition), keeping SD → MM ownership: SD owns the customer request and
 * refund status; MM owns stock disposition.
 */
@Injectable()
export class ReturnRequestService {
    private readonly logger = new Logger(ReturnRequestService.name)

    constructor(
        private prisma: PrismaService,
        private customerReturns: CustomerReturnService,
    ) {}

    /**
     * Storefront path: the customer is authenticated, so the order must belong
     * to them and company scope is resolved server-side (never client-supplied).
     */
    async createForCustomer(
        clientId: string,
        salesOrderId: string,
        input: CreateCustomerReturnInput,
    ) {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            include: { lines: true },
        })
        if (!order || order.customerId !== clientId) {
            throw new NotFoundException('Sales order not found')
        }
        if (!order.companyId) {
            throw new BadRequestException(
                'Order has no company scope — contact support to request a return',
            )
        }
        assertReturnableOrder(order)
        const existing = await this.prisma.sdReturnRequest.findFirst({
            where: { salesOrderId: order.id, status: 'REQUESTED' },
            select: { id: true },
        })
        if (existing) {
            throw new BadRequestException(
                'A return request is already pending for this order',
            )
        }
        return this.create({
            companyId: order.companyId,
            salesOrderId: order.id,
            customerId: order.customerId,
            reason: input.reason,
            conditionNote: input.conditionNote,
            photos: input.photos,
            preferredResolution: input.preferredResolution,
            lines: input.lines,
        })
    }

    /** Company-scoped list with module columns (filters: status, refundStatus). */
    async list(
        companyId: string,
        query: { status?: string; refundStatus?: string } = {},
    ) {
        return this.prisma.sdReturnRequest.findMany({
            where: {
                companyId,
                ...(query.status ? { status: query.status } : {}),
                ...(query.refundStatus ? { refundStatus: query.refundStatus } : {}),
            },
            include: this.listInclude,
            orderBy: { createdAt: 'desc' },
            take: 200,
        })
    }

    /**
     * Storefront: the signed-in customer's own return requests (newest first),
     * with line product snapshots and the refund record / credit memo.
     */
    async listForCustomer(clientId: string) {
        return this.prisma.sdReturnRequest.findMany({
            where: { customerId: clientId },
            include: this.listInclude,
            orderBy: { createdAt: 'desc' },
            take: 100,
        })
    }

    /** Idempotent: an open (REQUESTED) request for the same order + lines is returned. */
    async create(input: CreateReturnRequestInput) {
        return this.prisma.$transaction((tx) => this.createIn(tx, input))
    }

    private async createIn(
        client: PrismaClientLike,
        input: CreateReturnRequestInput,
    ) {
        const order = await client.sdSalesOrder.findUnique({
            where: { id: input.salesOrderId },
            include: {
                lines: { orderBy: { lineNumber: 'asc' } },
                invoices: { take: 1, select: { invoiceNumber: true } },
            },
        })
        if (!order || order.companyId !== input.companyId) {
            throw new NotFoundException(
                'Sales order not found in company scope',
            )
        }
        assertReturnableOrder(order)

        const lineIds = input.lines.map((l) => l.salesOrderLineId)
        const existing = await client.sdReturnRequest.findFirst({
            where: { salesOrderId: order.id, status: 'REQUESTED' },
            include: { lines: { select: { salesOrderLineId: true } } },
        })
        if (
            existing &&
            existing.lines.length === lineIds.length &&
            lineIds.every((id) =>
                existing.lines.some((l) => l.salesOrderLineId === id),
            )
        ) {
            return this.findOneInclude(existing.id)
        }

        // Delivered quantities per material from dispatched packages (base UOM).
        const dispatchedPackages = await client.wmPackage.findMany({
            where: { salesOrderId: order.id, status: 'DISPATCHED' },
            select: { items: { select: { materialId: true, expectedQty: true } } },
        })
        const packageQtyByMaterial = new Map<string, Decimal>()
        for (const pkg of dispatchedPackages) {
            for (const item of pkg.items) {
                packageQtyByMaterial.set(
                    item.materialId,
                    (packageQtyByMaterial.get(item.materialId) ?? new Decimal(0)).plus(
                        item.expectedQty,
                    ),
                )
            }
        }

        const targets = input.lines.map((line, index) => {
            const soLine = order.lines.find(
                (l) => l.id === line.salesOrderLineId,
            )
            if (!soLine) {
                throw new BadRequestException(
                    `Line ${line.salesOrderLineId} is not on sales order ${order.orderNumber}`,
                )
            }
            const delivered = deliveredQuantityForLine(
                soLine,
                soLine.materialId ?? '',
                packageQtyByMaterial,
            )
            if (delivered.lte(0)) {
                throw new BadRequestException(
                    `Line ${index + 1}: no delivered quantity recorded for this item — cannot request a return`,
                )
            }
            if (new Decimal(line.quantity).lte(0)) {
                throw new BadRequestException(
                    'Return quantity must be positive',
                )
            }
            return { soLine, requested: new Decimal(line.quantity), delivered }
        })

        // Row-lock the order lines in a fixed order to serialize the
        // returnable-quantity check (same pattern as SalesReturnService).
        const sorted = [...targets.map((t) => t.soLine)].sort((a, b) =>
            a.id.localeCompare(b.id),
        )
        for (const soLine of sorted) {
            const locked = await client.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "sd_sales_order_lines" WHERE "id" = ${soLine.id} FOR UPDATE`
            if (!locked[0]) {
                throw new NotFoundException(`Order line ${soLine.id} not found`)
            }
        }

        // Subtract quantities already claimed by non-terminal return requests.
        const prior = await client.sdReturnRequestLine.groupBy({
            by: ['salesOrderLineId'],
            where: {
                salesOrderLineId: { in: lineIds },
                returnRequest: {
                    status: { notIn: [...TERMINAL_RETURN_STATUSES] },
                },
            },
            _sum: { quantity: true },
        })
        const priorByLine = new Map(
            prior.map((row) => [row.salesOrderLineId, row._sum.quantity ?? new Decimal(0)]),
        )

        for (const target of targets) {
            const priorQty = priorByLine.get(target.soLine.id) ?? new Decimal(0)
            const returnable = target.delivered.minus(priorQty)
            if (target.requested.gt(returnable)) {
                throw new ConflictException(
                    `Line ${target.soLine.lineNumber ?? ''}: requested ${target.requested.toString()} exceeds the returnable quantity ${returnable.toString()} (delivered ${target.delivered.toString()} minus prior returns ${priorQty.toString()})`,
                )
            }
        }

        const preferredResolution = validateResolution(
            input.preferredResolution,
        )

        const created = await client.sdReturnRequest.create({
            data: {
                requestNumber: await this.nextRequestNumber(client),
                companyId: order.companyId,
                salesOrderId: order.id,
                customerId: input.customerId,
                reason: input.reason,
                conditionNote: input.conditionNote,
                photos: (input.photos as Prisma.InputJsonValue) ?? undefined,
                branchId: order.branchId ?? null,
                warehouseId: order.warehouseId ?? null,
                invoiceNumber: order.invoices[0]?.invoiceNumber ?? null,
                preferredResolution,
                refundStatus: 'NONE',
                requestedBy: input.requestedBy,
                status: 'REQUESTED',
                lines: {
                    create: targets.map((target, index) => {
                        const reason =
                            input.lines[index].reason ?? input.reason
                        return {
                            salesOrderLineId: target.soLine.id,
                            variantId: target.soLine.variantId ?? undefined,
                            materialId: target.soLine.materialId ?? undefined,
                            quantity: target.requested,
                            reason,
                            conditionNote:
                                input.lines[index].conditionNote ??
                                input.conditionNote,
                            // Damaged/defective/expired → inspection-only (never
                            // auto-restock); missing → refund-only (no goods).
                            disposition: initialDisposition(reason),
                        }
                    }),
                },
            },
            include: {
                lines: true,
                salesOrder: {
                    select: { orderNumber: true, customerName: true },
                },
            },
        })
        return created
    }

    /** Reload helper so an idempotent hit returns the same shape as a create. */
    private async findOneInclude(id: string) {
        return this.prisma.sdReturnRequest.findUnique({
            where: { id },
            include: {
                lines: true,
                salesOrder: {
                    select: { orderNumber: true, customerName: true },
                },
            },
        })
    }

    /**
     * Approval routes the request to MM customer returns for intake/inspection
     * and final disposition (restock / quality hold / damaged / scrap / disposal
     * / refund-only). Idempotent via a unique MM return link per request.
     * Once approved the return awaits the physical goods (AWAITING_RETURN).
     */
    async approve(
        id: string,
        companyId: string,
        approvedBy?: string,
    ) {
        const request = await this.prisma.sdReturnRequest.findFirst({
            where: { id, companyId },
            include: { lines: true },
        })
        if (!request) {
            throw new NotFoundException('Return request not found in company scope')
        }
        if (request.status === 'AWAITING_RETURN' || request.status === 'APPROVED') {
            return this.findOne(request.id)
        }
        if (request.status !== 'REQUESTED') {
            throw new ConflictException(
                `Only a REQUESTED return can be approved (current: ${request.status})`,
            )
        }

        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: request.salesOrderId },
            select: { warehouseId: true },
        })
        if (!order?.warehouseId) {
            throw new BadRequestException(
                'Order has no warehouse — cannot route the return to receiving',
            )
        }
        if (request.lines.some((l) => !l.materialId)) {
            throw new BadRequestException(
                'Return lines need an MM material mapping before approval',
            )
        }

        let mmCustomerReturnId = request.mmCustomerReturnId
        if (!mmCustomerReturnId) {
            // Resolve base UoM per material first (never ''), then create lines.
            const uomByMaterial = new Map<string, string>()
            for (const line of request.lines) {
                if (!uomByMaterial.has(line.materialId!)) {
                    uomByMaterial.set(
                        line.materialId!,
                        await this.materialBaseUom(line.materialId!),
                    )
                }
            }
            const mmReturn = await this.prisma.mmCustomerReturn.create({
                data: {
                    returnNumber: `CR-${request.requestNumber}`,
                    companyId: request.companyId,
                    warehouseId: request.warehouseId ?? order.warehouseId,
                    sdReturnRequestRef: request.id,
                    customerRef: request.customerId,
                    reason: request.reason,
                    status: 'DRAFT',
                    lines: {
                        create: request.lines.map((line, index) => ({
                            lineNumber: index + 1,
                            materialId: line.materialId!,
                            uomId: uomByMaterial.get(line.materialId!)!,
                            quantity: line.quantity,
                            unitCost: 0,
                            // Damaged/defective/expired → blocked until inspection
                            // decides; missing → refund-only (no stock movement).
                            disposition:
                                line.disposition === 'QUALITY_HOLD'
                                    ? 'BLOCK'
                                    : (line.disposition ?? 'RESTOCK'),
                            dispositionStatus: 'PENDING',
                        })),
                    },
                },
            })
            mmCustomerReturnId = mmReturn.id
            await this.prisma.sdReturnRequest.update({
                where: { id: request.id },
                data: { mmCustomerReturnId },
            })
        }

        return this.prisma.sdReturnRequest.update({
            where: { id: request.id },
            data: {
                status: 'AWAITING_RETURN',
                approvedBy,
                approvedAt: new Date(),
            },
            include: { lines: true },
        })
    }

    /** REQUESTED → REJECTED (admin refuses the return). */
    async reject(
        id: string,
        companyId: string,
        input: { reason?: string; performedBy?: string } = {},
    ) {
        return this.transition(id, companyId, ['REQUESTED'], 'REJECTED', {
            rejectReason: input.reason?.trim() || null,
            rejectedAt: new Date(),
            ...(input.performedBy ? { approvedBy: input.performedBy } : {}),
        })
    }

    /**
     * AWAITING_RETURN → RECEIVED. The physical goods arrive at the warehouse:
     * opens the MM intake (receivedAt stamped by MM).
     */
    async receive(id: string, companyId: string, performedBy?: string) {
        const request = await this.scoped(id, companyId)
        const mmId = await this.mmReturnId(request)
        await this.customerReturns.startIntake(mmId, performedBy)
        return this.transition(
            id,
            companyId,
            ['AWAITING_RETURN', 'APPROVED'],
            'RECEIVED',
        )
    }

    /** RECEIVED → UNDER_INSPECTION (registers the inspection with MM). */
    async inspect(
        id: string,
        companyId: string,
        input: { result?: string; notes?: string; performedBy?: string } = {},
    ) {
        const request = await this.scoped(id, companyId)
        const mmId = await this.mmReturnId(request)
        await this.customerReturns.inspect(mmId, {
            result: input.result ?? undefined,
            decisionNotes: input.notes ?? undefined,
            performedBy: input.performedBy,
        })
        return this.transition(
            id,
            companyId,
            ['RECEIVED', 'UNDER_INSPECTION'],
            'UNDER_INSPECTION',
        )
    }

    /**
     * Authorized disposition mark (Phase 5 inspection result / Phase 6 stock
     * movement):
     * - RESTOCK → sellable stock (UNRESTRICTED) — the ONLY path back to
     *   available stock; never automatic for damaged items.
     * - BLOCK  → damaged/blocked stock (no available increase).
     * - SCRAP  → scrap from return (removed from usable inventory).
     * - REPAIR → quality-inspection stock (needs further decision).
     * Drives the MM-owned customer return (setDisposition → submit →
     * complete) so every stock movement goes through InventoryPostingService.
     * Large-value returns that require MM approval stay UNDER_INSPECTION.
     */
    async mark(
        id: string,
        companyId: string,
        disposition: MarkDisposition,
        performedBy?: string,
    ) {
        if (!(MARK_DISPOSITIONS as readonly string[]).includes(disposition)) {
            throw new BadRequestException(
                `Unknown mark disposition ${disposition}`,
            )
        }
        const request = await this.scoped(id, companyId)
        if (request.status !== 'UNDER_INSPECTION') {
            throw new ConflictException(
                `Only returns under inspection can be marked (current: ${request.status})`,
            )
        }
        const mmId = await this.mmReturnId(request)
        const mm = await this.customerReturns.findOne(mmId)

        let marked = 0
        for (const line of request.lines) {
            if (line.disposition === 'REFUND_ONLY') continue
            const mmLine = mm.lines.find(
                (l) =>
                    l.materialId === line.materialId &&
                    l.disposition !== 'REFUND_ONLY' &&
                    !['POSTED', 'LINKED_DISPOSAL'].includes(l.dispositionStatus) &&
                    l.quantity.eq(line.quantity),
            )
            if (!mmLine) continue
            await this.customerReturns.setDisposition(mmLine.id, {
                disposition,
                performedBy,
            })
            marked += 1
        }
        if (marked === 0) {
            throw new BadRequestException(
                'No return lines can be marked — the lines are refund-only or already posted',
            )
        }

        const submitted = await this.customerReturns.submit(mmId, performedBy)
        if (submitted.status === 'APPROVED') {
            await this.customerReturns.complete(mmId, { performedBy })
            const target = SD_STATUS_BY_MARK[disposition]
            return this.transition(
                id,
                companyId,
                ['UNDER_INSPECTION'],
                target,
            )
        }
        // PENDING_APPROVAL on the MM side: the return awaits the MM
        // disposition approval before stock moves; SD stays under inspection.
        return this.findOne(id)
    }

    /**
     * Phase 7 — create the refund record. Only owed/paid amounts are refunded:
     * - COD never collected → NOT_REQUIRED (markRefundNotRequired), no record.
     * - COD paid/collected or demo e-payment paid → refund record created with
     *   a DEMO-ONLY status flow: PENDING_REFUND → APPROVED → PAID (or FAILED).
     * No real payment processing is ever invoked.
     */
    async createRefund(
        id: string,
        companyId: string,
        input: { refundMethod?: string; performedBy?: string } = {},
    ) {
        const { request, payment, refundAmount, returnQuantity } =
            await this.loadRefundContext(id, companyId)
        if (!payment || payment.status !== 'Paid') {
            throw new BadRequestException(
                'Only a Paid/collected payment can be refunded — an unpaid Cash on Delivery has no refund payable',
            )
        }

        const existing = await this.prisma.sdRefund.findUnique({
            where: { returnRequestId: id },
        })
        if (existing && existing.status !== 'FAILED') {
            return this.findOne(id)
        }

        const refundMethod = resolveRefundMethod(
            input.refundMethod,
            payment?.paymentMethod ?? null,
        )
        const invoice = request.salesOrder.invoices[0] ?? null
        await this.prisma.$transaction(async (tx) => {
            let refund
            if (existing) {
                // Retry after a failed refund attempt.
                refund = await tx.sdRefund.update({
                    where: { id: existing.id },
                    data: {
                        status: 'PENDING_REFUND',
                        refundMethod,
                        failReason: null,
                        failedAt: null,
                    },
                })
            } else {
                refund = await tx.sdRefund.create({
                    data: {
                        refundNumber: await this.nextRefundNumber(tx),
                        companyId,
                        salesOrderId: request.salesOrderId,
                        salesInvoiceId: invoice?.id ?? null,
                        returnRequestId: id,
                        customerId: request.customerId,
                        paymentMethod: payment?.paymentMethod ?? null,
                        refundMethod,
                        amount: refundAmount,
                        currency: request.salesOrder.currency ?? 'PHP',
                        status: 'PENDING_REFUND',
                        returnQuantity,
                        returnReason: request.reason,
                        // Demo Only: our payments are simulated, never live.
                        isDemo:
                            payment?.paymentMethod === undefined
                                ? Boolean(request.salesOrder.isDemoPayment)
                                : DEMO_PAYMENT_METHODS.has(payment.paymentMethod),
                        createdBy: input.performedBy ?? null,
                    },
                })
            }
            await tx.sdReturnRequest.update({
                where: { id },
                data: {
                    refundStatus: 'PENDING_REFUND',
                    refundAmount,
                    refundedBy: null,
                    refundedAt: null,
                },
            })
            return refund
        })
        return this.findOne(id)
    }

    /**
     * COD (Cash on Delivery) that was never collected/paid → no refund
     * payable. Marks the refund NOT_REQUIRED without creating a record.
     */
    async markRefundNotRequired(id: string, companyId: string, performedBy?: string) {
        const { request, payment } = await this.loadRefundContext(id, companyId)
        if (payment?.status === 'Paid') {
            throw new ConflictException(
                'This order was already paid — create the refund instead',
            )
        }
        const existing = await this.prisma.sdRefund.findUnique({
            where: { returnRequestId: id },
        })
        if (existing && existing.status !== 'FAILED') {
            throw new ConflictException(
                'A refund record already exists for this return',
            )
        }
        if (request.refundStatus === 'NOT_REQUIRED') {
            return this.findOne(id)
        }
        return this.updateRefundStatusDirect(id, companyId, 'NOT_REQUIRED', performedBy)
    }

    private async updateRefundStatusDirect(
        id: string,
        companyId: string,
        refundStatus: string,
        performedBy?: string,
    ) {
        const claim = await this.prisma.sdReturnRequest.updateMany({
            where: { id, companyId },
            data: { refundStatus, refundedBy: performedBy ?? null },
        })
        if (claim.count === 0) {
            throw new NotFoundException('Return request not found in company scope')
        }
        return this.findOne(id)
    }

    /** PENDING_REFUND → APPROVED and the credit memo (Phase 8) is issued. */
    async approveRefund(id: string, companyId: string, performedBy?: string) {
        const { request } = await this.loadRefundContext(id, companyId)
        const refund = await this.prisma.sdRefund.findUnique({
            where: { returnRequestId: id },
        })
        if (!refund) {
            throw new BadRequestException(
                'No refund record exists — create the refund first',
            )
        }
        if (refund.status !== 'PENDING_REFUND') {
            if (refund.status === 'APPROVED') return this.findOne(id)
            throw new ConflictException(
                `Cannot approve a ${refund.status} refund`,
            )
        }
        await this.prisma.$transaction(async (tx) => {
            const claim = await tx.sdRefund.updateMany({
                where: { id: refund.id, status: 'PENDING_REFUND' },
                data: {
                    status: 'APPROVED',
                    approvedBy: performedBy ?? null,
                    approvedAt: new Date(),
                },
            })
            if (claim.count === 0) {
                throw new ConflictException(
                    'Refund changed since loading — refresh and retry',
                )
            }
            await tx.sdReturnRequest.update({
                where: { id },
                data: { refundStatus: 'APPROVED' },
            })
            // Credit memo linked to the ORIGINAL sales invoice — the original
            // invoice is never deleted or overwritten (audit history).
            const existingMemo = await tx.sdCreditMemo.findUnique({
                where: { refundId: refund.id },
            })
            if (!existingMemo) {
                await tx.sdCreditMemo.create({
                    data: {
                        creditMemoNumber: await this.nextCreditMemoNumber(tx),
                        companyId: refund.companyId,
                        salesOrderId: refund.salesOrderId,
                        salesInvoiceId: refund.salesInvoiceId ?? null,
                        refundId: refund.id,
                        customerId: refund.customerId,
                        branchId: request.branchId ?? null,
                        amount: refund.amount,
                        currency: refund.currency,
                        returnQuantity: refund.returnQuantity,
                        returnReason: refund.returnReason,
                        status: 'ISSUED',
                        createdBy: performedBy ?? null,
                    },
                })
            }
        })
        return this.findOne(id)
    }

    /**
     * APPROVED → PAID. DEMO ONLY: flips the paid payment to Refunded, marks
     * the original invoice REFUNDED (amounts unchanged), and closes the
     * refund on the return (status REFUNDED).
     */
    async payRefund(id: string, companyId: string, performedBy?: string) {
        const { request, payment } = await this.loadRefundContext(id, companyId)
        const refund = await this.prisma.sdRefund.findUnique({
            where: { returnRequestId: id },
        })
        if (!refund || refund.status !== 'APPROVED') {
            throw new ConflictException(
                `Only an APPROVED refund can be paid (current: ${refund?.status ?? 'none'})`,
            )
        }
        if (!payment || payment.status !== 'Paid') {
            throw new BadRequestException(
                'Only a Paid payment can be refunded for a returned order',
            )
        }
        const paidAt = new Date()
        await this.prisma.$transaction(async (tx) => {
            const claim = await tx.sdSalesOrderPayment.updateMany({
                where: { id: payment.id, status: 'Paid' },
                data: { status: 'Refunded' },
            })
            if (claim.count === 0) {
                throw new ConflictException(
                    'Payment changed since loading — refresh and retry',
                )
            }
            await tx.sdSalesOrder.update({
                where: { id: request.salesOrderId },
                data: { paymentStatus: 'Refunded' },
            })
            await tx.sdSalesInvoice.updateMany({
                where: {
                    salesOrderId: request.salesOrderId,
                    status: { notIn: ['CANCELLED', 'REFUNDED'] },
                },
                data: { status: 'REFUNDED' },
            })
            const claimed = await tx.sdRefund.updateMany({
                where: { id: refund.id, status: 'APPROVED' },
                data: {
                    status: 'PAID',
                    paidBy: performedBy ?? null,
                    paidAt,
                },
            })
            if (claimed.count === 0) {
                throw new ConflictException(
                    'Refund changed since loading — refresh and retry',
                )
            }
            await tx.sdReturnRequest.update({
                where: { id },
                data: {
                    status: 'REFUNDED',
                    refundStatus: 'PAID',
                    refundAmount: refund.amount,
                    refundedAt: paidAt,
                    refundedBy: performedBy ?? null,
                },
            })
        })
        return this.findOne(id)
    }

    /** PENDING_REFUND | APPROVED → FAILED (no payment changes). */
    async failRefund(
        id: string,
        companyId: string,
        input: { reason?: string; performedBy?: string } = {},
    ) {
        const refund = await this.prisma.sdRefund.findUnique({
            where: { returnRequestId: id },
        })
        if (!refund || !['PENDING_REFUND', 'APPROVED'].includes(refund.status)) {
            throw new ConflictException(
                `Cannot fail a ${refund?.status ?? 'missing'} refund`,
            )
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.sdRefund.update({
                where: { id: refund.id },
                data: {
                    status: 'FAILED',
                    failReason: input.reason?.trim() || null,
                    failedAt: new Date(),
                },
            })
            await tx.sdReturnRequest.update({
                where: { id },
                data: { refundStatus: 'FAILED' },
            })
        })
        return this.findOne(id)
    }

    /**
     * Close a settled return. Phase 10: closing requires the inspection
     * (disposition) to be done AND the refund decision to be made
     * (PAID or NOT_REQUIRED); rejected returns close without a refund.
     */
    async close(id: string, companyId: string, performedBy?: string) {
        const request = await this.scoped(id, companyId)
        if (request.status === 'REJECTED') {
            return this.transition(id, companyId, ['REJECTED'], 'CLOSED', {
                closedAt: new Date(),
                ...(performedBy ? { approvedBy: performedBy } : {}),
            })
        }
        if ((request.preferredResolution ?? 'REFUND') === 'REFUND') {
            if (!['PAID', 'NOT_REQUIRED'].includes(request.refundStatus)) {
                throw new ConflictException(
                    'Closing requires a refund decision: pay the refund or mark it not required',
                )
            }
            return this.transition(
                id,
                companyId,
                ['REFUNDED', 'RESTOCKED', 'MARKED_DAMAGED', 'SCRAPPED'],
                'CLOSED',
                { closedAt: new Date(), ...(performedBy ? { approvedBy: performedBy } : {}) },
            )
        }
        // REPLACEMENT / STORE_CREDIT resolutions close directly after
        // disposition (no money refund path).
        return this.transition(
            id,
            companyId,
            ['RESTOCKED', 'MARKED_DAMAGED', 'SCRAPPED'],
            'CLOSED',
            { closedAt: new Date(), ...(performedBy ? { approvedBy: performedBy } : {}) },
        )
    }

    /** Shared loader for refund operations (request + order + payment + invoice). */
    private async loadRefundContext(id: string, companyId: string) {
        const request = await this.prisma.sdReturnRequest.findFirst({
            where: { id, companyId },
            include: {
                lines: true,
                salesOrder: {
                    include: {
                        lines: { orderBy: { lineNumber: 'asc' } },
                        payments: { orderBy: { createdAt: 'desc' } },
                        invoices: { take: 1 },
                    },
                },
            },
        })
        if (!request) {
            throw new NotFoundException('Return request not found in company scope')
        }
        if ((request.preferredResolution ?? 'REFUND') !== 'REFUND') {
            throw new BadRequestException(
                `This return was resolved as ${request.preferredResolution} — process that resolution instead of a refund`,
            )
        }
        const refundOnly = request.lines.every(
            (l) => l.disposition === 'REFUND_ONLY',
        )
        const terminal = ['RESTOCKED', 'MARKED_DAMAGED', 'SCRAPPED'].includes(
            request.status,
        )
        if (!terminal && !(refundOnly && request.status !== 'REQUESTED')) {
            throw new ConflictException(
                `Refunds are processed after the return is settled (current: ${request.status})`,
            )
        }
        const payment = request.salesOrder.payments[0] ?? null

        let amount = new Decimal(0)
        for (const line of request.lines) {
            const soLine = request.salesOrder.lines.find(
                (l) => l.id === line.salesOrderLineId,
            )
            if (!soLine) {
                throw new BadRequestException(
                    `Return line ${line.id} has no matching order line for refund pricing`,
                )
            }
            const unitPrice = new Decimal(
                soLine.unitPrice ?? soLine.lineTotal ?? 0,
            )
            amount = amount.plus(unitPrice.mul(line.quantity))
        }
        const orderTotal = new Decimal(
            request.salesOrder.totalAmount ?? request.salesOrder.subtotal ?? 0,
        )
        if (amount.gt(orderTotal)) amount = orderTotal
        if (amount.lte(0)) {
            throw new BadRequestException(
                'Refund amount is zero — nothing to refund',
            )
        }
        const returnQuantity = request.lines.reduce(
            (sum, l) => sum.plus(l.quantity),
            new Decimal(0),
        )
        return {
            request,
            payment,
            refundAmount: amount.toDecimalPlaces(2),
            returnQuantity: returnQuantity.toDecimalPlaces(3),
        }
    }

    private async nextRefundNumber(client: Prisma.TransactionClient) {
        const prefix = `REF-${new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '')}`
        const count = await client.sdRefund.count({
            where: { refundNumber: { startsWith: prefix } },
        })
        return `${prefix}-${String(count + 1).padStart(4, '0')}`
    }

    private async nextCreditMemoNumber(client: Prisma.TransactionClient) {
        const prefix = `CM-${new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '')}`
        const count = await client.sdCreditMemo.count({
            where: { creditMemoNumber: { startsWith: prefix } },
        })
        return `${prefix}-${String(count + 1).padStart(4, '0')}`
    }

    /** Company-scoped fetch with lines (warehouse actions need line dispositions). */
    private async scoped(id: string, companyId: string) {
        const row = await this.prisma.sdReturnRequest.findFirst({
            where: { id, companyId },
            include: { lines: true },
        })
        if (!row) {
            throw new NotFoundException('Return request not found in company scope')
        }
        return row
    }

    /** The linked MM customer return (must exist before warehouse actions). */
    private async mmReturnId(request: { id: string; mmCustomerReturnId?: string | null }) {
        if (!request.mmCustomerReturnId) {
            throw new BadRequestException(
                'This return has no MM processing record — approve it first',
            )
        }
        return request.mmCustomerReturnId
    }

    /** Full record used by list-dependent transitions. */
    private async findOne(id: string) {
        const row = await this.prisma.sdReturnRequest.findUnique({
            where: { id },
            include: this.listInclude,
        })
        if (!row) throw new NotFoundException('Return request not found')
        return row
    }

    /** Guarded status transition with a company-scoped optimistic update. */
    private async transition(
        id: string,
        companyId: string,
        from: readonly string[],
        to: string,
        extra: Record<string, unknown> = {},
    ) {
        await this.prisma.$transaction(async (tx) => {
            const claim = await tx.sdReturnRequest.updateMany({
                where: { id, companyId, status: { in: [...from] } },
                data: { ...extra, status: to },
            })
            if (claim.count === 0) {
                const current = await tx.sdReturnRequest.findFirst({
                    where: { id, companyId },
                    select: { status: true },
                })
                if (!current) {
                    throw new NotFoundException(
                        'Return request not found in company scope',
                    )
                }
                if (current.status === to) {
                    throw new ConflictException(
                        `Return request is already ${to}`,
                    )
                }
                throw new ConflictException(
                    `Return request cannot move from ${current.status} to ${to}`,
                )
            }
        })
        return this.findOne(id)
    }

    private readonly listInclude = {
        lines: {
            orderBy: { id: 'asc' as const },
            include: {
                salesOrderLine: {
                    select: {
                        productNameSnapshot: true,
                        productSkuSnapshot: true,
                        materialCodeSnapshot: true,
                        sku: true,
                    },
                },
            },
        },
        refunds: {
            take: 1,
            orderBy: { createdAt: 'desc' as const },
            include: {
                creditMemo: {
                    select: {
                        id: true,
                        creditMemoNumber: true,
                        amount: true,
                        status: true,
                    },
                },
            },
        },
        salesOrder: {
            select: {
                orderNumber: true,
                customerName: true,
                status: true,
                company: { select: { id: true, code: true, name: true } },
            },
        },
    } satisfies Prisma.SdReturnRequestInclude

    /** Material base UoM (Phase 3 fix: never create intake lines with empty UoM). */
    private async materialBaseUom(materialId: string): Promise<string> {
        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: materialId },
            select: { baseUomId: true },
        })
        if (!material?.baseUomId) {
            throw new BadRequestException(
                `Material ${materialId} has no unit of measure — cannot route the return to receiving`,
            )
        }
        return material.baseUomId
    }

    private async nextRequestNumber(client: PrismaClientLike) {
        const prefix = `RET-${new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '')}`
        const count = await client.sdReturnRequest.count({
            where: { requestNumber: { startsWith: prefix } },
        })
        return `${prefix}-${String(count + 1).padStart(4, '0')}`
    }
}

function assertReturnableOrder(order: {
    status: string | null
    orderNumber?: string
}) {
    if (!RETURNABLE_ORDER_STATUSES.has(order.status ?? '')) {
        throw new BadRequestException(
            `Returns are only allowed after the order is delivered (current status: ${order.status ?? 'UNKNOWN'})`,
        )
    }
}

function validateResolution(value?: string): string | null {
    if (value === undefined || value === null || value === '') return null
    const normalized = value.toUpperCase()
    if (!(PREFERRED_RESOLUTIONS as readonly string[]).includes(normalized)) {
        throw new BadRequestException(
            `preferredResolution must be one of: ${PREFERRED_RESOLUTIONS.join(', ')}`,
        )
    }
    return normalized
}

function normalizeReason(reason?: string | null): string {
    if (!reason) return ''
    return reason.toUpperCase().replace(/[^A-Z_]+/g, '_')
}

function initialDisposition(reason?: string | null): string {
    const normalized = normalizeReason(reason)
    if (DAMAGED_REASONS.has(normalized)) return 'QUALITY_HOLD'
    if (MISSING_REASONS.has(normalized)) return 'REFUND_ONLY'
    return 'RESTOCK'
}

/** Admin-selected refund method or a sensible demo default per payment method. */
function resolveRefundMethod(
    input?: string,
    paymentMethod?: string | null,
): string | null {
    if (input) {
        const normalized = input.toUpperCase()
        if (!(REFUND_METHODS as readonly string[]).includes(normalized)) {
            throw new BadRequestException(
                `refundMethod must be one of: ${REFUND_METHODS.join(', ')}`,
            )
        }
        return normalized
    }
    switch (paymentMethod) {
        case 'WALLET_DEMO':
        case 'QR_DEMO':
            return 'DIGITAL_WALLET'
        case 'BANK_TRANSFER_DEMO':
            return 'BANK_TRANSFER'
        default:
            return 'CASH_REFUND'
    }
}

/**
 * Delivered quantity for one order line in sales UOM:
 * ledger-issued base qty (SALES_ORDER GIs mirror) + dispatched package base qty
 * (e-commerce GIs at trip start), converted back through the order line's
 * base/sales ratio. Never exceeds the ordered quantity.
 */
function deliveredQuantityForLine(
    soLine: {
        quantity: Decimal | number
        baseQuantity?: Decimal | number | null
        issuedQuantity?: Decimal | number | null
    },
    materialId: string,
    packageQtyByMaterial: ReadonlyMap<string, Decimal>,
): Decimal {
    const signed = new Decimal(soLine.issuedQuantity ?? 0).plus(
        packageQtyByMaterial.get(materialId) ?? new Decimal(0),
    )
    if (signed.lte(0)) return new Decimal(0)

    // base → sales factor (linear UOM conversion); default 1:1 when unknown.
    const quantity = new Decimal(soLine.quantity)
    const baseQuantity = new Decimal(soLine.baseQuantity ?? 0)
    const factor =
        quantity.gt(0) && baseQuantity.gt(0) ? baseQuantity.div(quantity) : new Decimal(1)
    let delivered = signed.div(factor).toDecimalPlaces(3)
    if (delivered.gt(quantity)) delivered = quantity
    return delivered
}