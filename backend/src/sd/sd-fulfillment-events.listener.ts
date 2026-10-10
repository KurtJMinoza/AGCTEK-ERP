import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../prisma/prisma.service'
import { SalesInvoiceService } from './sales-invoice.service'

/**
 * SD reaction to fulfillment lifecycle events emitted by MM / SCM in the same
 * process (EventEmitter2):
 *
 *  - `goods-issue.posted` (dispatch) → SD shipment marker + order SHIPPED +
 *    sales invoice created & issued (timing: dispatch, ERP standard).
 *  - `shipment.delivered` → sales order DELIVERED + invoice finalized.
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

        // Invoice timing (ERP standard): auto-create + issue at dispatch.
        await this.invoices.issueForSalesOrder(salesOrderId)
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
        const rows = await this.prisma.shipment.findMany({
            where: { id: { in: ids } },
            select: {
                package: {
                    select: {
                        salesOrderId: true,
                        pickingTask: { select: { salesOrderId: true } },
                    },
                },
            },
        })
        const orderIds = [
            ...new Set(
                rows
                    .map(
                        (row) =>
                            row.package?.salesOrderId ??
                            row.package?.pickingTask?.salesOrderId,
                    )
                    .filter(Boolean) as string[],
            ),
        ]
        if (!orderIds.length) return

        await this.prisma.sdSalesOrder.updateMany({
            where: { id: { in: orderIds } },
            data: { status: 'DELIVERED' },
        })
        for (const salesOrderId of orderIds) {
            await this.invoices.issueForSalesOrder(salesOrderId)
        }
    }
}
