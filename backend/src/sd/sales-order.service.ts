import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import {
    ChangeSalesOrderLineQtyDto,
    CreateSalesOrderDto,
} from './dto/sales-order.dto'
import { SdEventEmitterService } from './sd-event-emitter.service'
import { SD_EVENTS } from './sd-event.types'

@Injectable()
export class SalesOrderService {
    constructor(
        private prisma: PrismaService,
        private sdEvents: SdEventEmitterService,
    ) {}

    private readonly includes = {
        lines: { include: { material: true }, orderBy: { lineNumber: 'asc' as const } },
        warehouse: true,
        company: true,
    }

    async create(dto: CreateSalesOrderDto) {
        if (!dto.lines?.length) {
            throw new BadRequestException('At least one line is required')
        }
        const orderNumber = await this.nextOrderNumber()
        const correlationId = randomUUID()
        return this.prisma.sdSalesOrder.create({
            data: {
                orderNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                customerId: dto.customerId,
                correlationId,
                idempotencyKey: dto.idempotencyKey ?? null,
                createdBy: dto.createdBy ?? null,
                status: 'DRAFT',
                lines: {
                    create: dto.lines.map((line, idx) => ({
                        lineNumber: idx + 1,
                        materialId: line.materialId,
                        quantity: new Decimal(line.quantity),
                    })),
                },
            },
            include: this.includes,
        })
    }

    async findOne(id: string) {
        const row = await this.prisma.sdSalesOrder.findUnique({
            where: { id },
            include: this.includes,
        })
        if (!row) throw new NotFoundException('Sales order not found')
        return row
    }

    async confirm(id: string) {
        const order = await this.findOne(id)
        if (order.status === 'CANCELLED') {
            throw new BadRequestException('Cannot confirm a cancelled sales order')
        }
        if (order.status === 'CONFIRMED') {
            return order
        }
        if (order.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot confirm order in status ${order.status}`)
        }

        const updated = await this.prisma.sdSalesOrder.update({
            where: { id },
            data: { status: 'CONFIRMED' },
            include: this.includes,
        })

        await this.sdEvents.emit(SD_EVENTS.SALES_ORDER_CONFIRMED, this.toEventPayload(updated))
        return updated
    }

    async cancel(id: string) {
        const order = await this.findOne(id)
        if (order.status === 'CANCELLED') return order

        const updated = await this.prisma.sdSalesOrder.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: this.includes,
        })

        await this.sdEvents.emit(SD_EVENTS.SALES_ORDER_CANCELLED, this.toEventPayload(updated))
        return updated
    }

    async changeQuantity(
        orderId: string,
        lineId: string,
        dto: ChangeSalesOrderLineQtyDto,
    ) {
        const order = await this.findOne(orderId)
        if (order.status === 'CANCELLED') {
            throw new BadRequestException('Cannot change quantity on cancelled order')
        }
        const line = order.lines.find((l) => l.id === lineId)
        if (!line) throw new NotFoundException('Sales order line not found')

        const newQty = new Decimal(dto.quantity)
        if (newQty.lt(line.issuedQuantity)) {
            throw new BadRequestException(
                'New quantity cannot be less than already issued quantity',
            )
        }

        const previousQuantity = line.quantity.toString()
        await this.prisma.sdSalesOrderLine.update({
            where: { id: lineId },
            data: { quantity: newQty },
        })

        const refreshed = await this.findOne(orderId)
        await this.sdEvents.emit(SD_EVENTS.SALES_DEMAND_CHANGED, {
            ...this.toEventPayload(refreshed),
            changedLines: [
                {
                    lineId,
                    demandReferenceLineId: lineId,
                    previousQuantity,
                    newQuantity: newQty.toString(),
                },
            ],
        })
        return refreshed
    }

    async applyReservationCreated(args: {
        salesOrderId: string
        reservationHeaderId: string
        lines: Array<{
            lineId: string
            reservedQuantity: string
            integrationStatus: string
        }>
    }) {
        for (const line of args.lines) {
            await this.prisma.sdSalesOrderLine.update({
                where: { id: line.lineId },
                data: {
                    reservationHeaderId: args.reservationHeaderId,
                    reservedQuantity: new Decimal(line.reservedQuantity),
                    integrationStatus: line.integrationStatus,
                },
            })
        }
    }

    async applyReservationReleased(salesOrderId: string, reason?: string) {
        const order = await this.findOne(salesOrderId)
        for (const line of order.lines) {
            const status =
                order.status === 'CANCELLED' ? 'CANCELLED' : 'OPEN'
            await this.prisma.sdSalesOrderLine.update({
                where: { id: line.id },
                data: {
                    reservedQuantity: new Decimal(0),
                    reservationHeaderId: null,
                    integrationStatus: status,
                },
            })
        }
        return { salesOrderId, reason: reason ?? 'RELEASED' }
    }

    async applyPartialRelease(args: {
        salesOrderId: string
        lineId: string
        newReservedQuantity: string
    }) {
        await this.prisma.sdSalesOrderLine.update({
            where: { id: args.lineId },
            data: {
                reservedQuantity: new Decimal(args.newReservedQuantity),
                integrationStatus: 'RESERVED',
            },
        })
    }

    async applyGoodsIssuePosted(args: {
        salesOrderId: string
        lines: Array<{ lineId: string; issuedQuantity: string }>
    }) {
        for (const line of args.lines) {
            const existing = await this.prisma.sdSalesOrderLine.findUnique({
                where: { id: line.lineId },
            })
            if (!existing) continue
            const issued = new Decimal(existing.issuedQuantity).plus(
                line.issuedQuantity,
            )
            const fulfilled = issued.gte(existing.quantity)
            await this.prisma.sdSalesOrderLine.update({
                where: { id: line.lineId },
                data: {
                    issuedQuantity: issued,
                    integrationStatus: fulfilled ? 'FULFILLED' : 'RESERVED',
                },
            })
        }
    }

    private toEventPayload(order: Awaited<ReturnType<typeof this.findOne>>) {
        return {
            salesOrderId: order.id,
            orderNumber: order.orderNumber,
            companyId: order.companyId,
            warehouseId: order.warehouseId,
            customerId: order.customerId,
            correlationId: order.correlationId,
            idempotencyKey: order.idempotencyKey,
            lines: order.lines.map((line) => ({
                lineId: line.id,
                lineNumber: line.lineNumber,
                materialId: line.materialId,
                quantity: line.quantity.toString(),
                demandReferenceLineId: line.id,
            })),
        }
    }

    private async nextOrderNumber() {
        const count = await this.prisma.sdSalesOrder.count()
        return `SO-${String(count + 1).padStart(6, '0')}`
    }
}
