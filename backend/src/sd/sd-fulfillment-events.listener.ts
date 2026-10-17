import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../prisma/prisma.service'
import { SalesInvoiceService } from './sales-invoice.service'
import {
    COURIER_EVENTS,
    type CourierConsignmentChangedEvent,
} from '../scm/couriers/courier-events'

/**
 * SD reaction to fulfillment lifecycle events emitted by MM / SCM in the same
 * process (EventEmitter2):
 *
 *  - `goods-issue.posted` (dispatch) → SD shipment marker + order SHIPPED +
 *    DRAFT sales invoice.
 *  - `shipment.delivered` (driver POD per stop, or trip completion) → sales
 *    order DELIVERED + invoice POSTED (ISSUED, or PAID when already collected).
 *  - `courier.consignment.changed` (3PL booked / cancelled) → order
 *    `courierName` / `trackingNumber` projection (SCM consignment is the source).
 *
 * Every handler is idempotent (unique salesOrderId invoice, guarded updates).
 */
@Injectable()
export class SdFulfillmentEventsListener {
    private readonly logger = new Logger(SdFulfillmentEventsListener.name)

    constructor(
        private prisma: PrismaService,
        private invoices: SalesInvoiceService,
    ) {}

    @OnEvent('goods-issue.posted')
    async onGoodsIssuePosted(payload: { goodsIssueId?: string }) {
        try {
            await this.onDispatched(payload)
        } catch (err) {
            this.logger.warn(
                `SD dispatch handling failed for goods issue ${payload?.goodsIssueId}: ${
                    err instanceof Error ? err.message : 'unknown'
                }`,
            )
        }
    }

    private async onDispatched({ goodsIssueId }: { goodsIssueId?: string }) {
        if (!goodsIssueId) return
        const gi = await this.prisma.mmGoodsIssue.findUnique({
            where: { id: goodsIssueId },
            select: {
                sourceDocumentType: true,
                sourceDocumentId: true,
                warehouseId: true,
            },
        })
        if (!gi || gi.sourceDocumentType !== 'SALES_ORDER') return
        const salesOrderId = gi.sourceDocumentId
        if (!salesOrderId) return

        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            select: { companyId: true, warehouseId: true },
        })
        if (!order?.companyId) return

        // SD shipment marker (GI reference) — one row per sales order.
        const marker = await this.prisma.sdShipment.findFirst({
            where: { salesOrderId },
        })
        if (marker) {
            await this.prisma.sdShipment.update({
                where: { id: marker.id },
                data: { goodsIssueId, status: 'ISSUED' },
            })
        } else {
            await this.prisma.sdShipment.create({
                data: {
                    shipmentNumber: `SD-SHP-${salesOrderId}`,
                    salesOrderId,
                    companyId: order.companyId,
                    warehouseId: order.warehouseId ?? gi.warehouseId ?? '',
                    goodsIssueId,
                    status: 'ISSUED',
                },
            })
        }

        await this.prisma.sdSalesOrder.update({
            where: { id: salesOrderId },
            data: { status: 'SHIPPED' },
        })
        // First dispatch wins; replayed events must not move the milestone.
        await this.prisma.sdSalesOrder.updateMany({
            where: { id: salesOrderId, shippedAt: null },
            data: { shippedAt: new Date() },
        })

        // Posting rule: the invoice posts on delivery (POD); dispatch only drafts it.
        await this.invoices.createForSalesOrder(salesOrderId)
    }

    @OnEvent('shipment.delivered')
    async onShipmentDelivered(payload: { shipmentIds?: string[] }) {
        try {
            await this.onDelivered(payload)
        } catch (err) {
            this.logger.warn(
                `SD delivery handling failed: ${
                    err instanceof Error ? err.message : 'unknown'
                }`,
            )
        }
    }

    private async onDelivered({ shipmentIds }: { shipmentIds?: string[] }) {
        const ids = shipmentIds ?? []
        if (!ids.length) return

        // SCM shipment → package → sales order. New order-level packages carry
        // the direct SD link; the picking-task relation remains a legacy
        // fallback for historical packages.
        // Trip completion reports every shipment on the trip; failed stops
        // leave theirs on EXCEPTION_HOLD and must not deliver the order.
        const rows = await this.prisma.shipment.findMany({
            where: { id: { in: ids }, status: 'DELIVERED' },
            select: {
                deliveredAt: true,
                package: {
                    select: {
                        salesOrderId: true,
                        pickingTask: { select: { salesOrderId: true } },
                    },
                },
            },
        })
        // Latest POD time per order (an order may span several shipments).
        const deliveredAtByOrder = new Map<string, Date>()
        for (const row of rows) {
            const orderId =
                row.package?.salesOrderId ??
                row.package?.pickingTask?.salesOrderId
            if (!orderId) continue
            const at = row.deliveredAt ?? new Date()
            const current = deliveredAtByOrder.get(orderId)
            if (!current || at > current) deliveredAtByOrder.set(orderId, at)
        }
        const orderIds = [...deliveredAtByOrder.keys()]
        if (!orderIds.length) return

        await this.prisma.sdSalesOrder.updateMany({
            where: { id: { in: orderIds } },
            data: { status: 'DELIVERED' },
        })
        for (const [salesOrderId, deliveredAt] of deliveredAtByOrder) {
            await this.prisma.sdSalesOrder.updateMany({
                where: { id: salesOrderId, deliveredAt: null },
                data: { deliveredAt },
            })
            await this.invoices.issueForSalesOrder(salesOrderId)
        }
    }

    @OnEvent(COURIER_EVENTS.CONSIGNMENT_CHANGED)
    async onCourierChanged(payload: CourierConsignmentChangedEvent) {
        try {
            await this.projectCourier(payload)
        } catch (err) {
            this.logger.warn(
                `SD courier projection failed for shipment ${payload?.shipmentId}: ${
                    err instanceof Error ? err.message : 'unknown'
                }`,
            )
        }
    }

    private async projectCourier({
        shipmentId,
        carrierName,
        trackingNumber,
    }: CourierConsignmentChangedEvent) {
        if (!shipmentId) return
        const shipment = await this.prisma.shipment.findUnique({
            where: { id: shipmentId },
            select: {
                package: {
                    select: {
                        salesOrderId: true,
                        pickingTask: { select: { salesOrderId: true } },
                    },
                },
            },
        })
        const orderId =
            shipment?.package?.salesOrderId ??
            shipment?.package?.pickingTask?.salesOrderId
        if (!orderId) return
        await this.prisma.sdSalesOrder.update({
            where: { id: orderId },
            data: {
                courierName: carrierName ?? null,
                trackingNumber: trackingNumber ?? null,
            },
        })
    }
}
