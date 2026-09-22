import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import {
    ChangeProductionMaterialQtyDto,
    CreateProductionOrderDto,
} from './dto/production-order.dto'
import { BomService } from './bom.service'
import { PpEventEmitterService } from './pp-event-emitter.service'
import { PP_EVENTS } from './pp-event.types'

@Injectable()
export class ProductionOrderService {
    constructor(
        private prisma: PrismaService,
        private bom: BomService,
        private ppEvents: PpEventEmitterService,
    ) {}

    private readonly includes = {
        materials: { include: { material: true }, orderBy: { lineNumber: 'asc' as const } },
        finishedMaterial: true,
        warehouse: true,
        company: true,
    }

    async create(dto: CreateProductionOrderDto) {
        const orderNumber = await this.nextOrderNumber()
        const correlationId = randomUUID()
        return this.prisma.ppProductionOrder.create({
            data: {
                orderNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                plantId: dto.plantId ?? null,
                finishedMaterialId: dto.finishedMaterialId,
                plannedQuantity: new Decimal(dto.plannedQuantity),
                correlationId,
                idempotencyKey: dto.idempotencyKey ?? null,
                createdBy: dto.createdBy ?? null,
                status: 'DRAFT',
            },
            include: this.includes,
        })
    }

    async findOne(id: string) {
        const row = await this.prisma.ppProductionOrder.findUnique({
            where: { id },
            include: this.includes,
        })
        if (!row) throw new NotFoundException('Production order not found')
        return row
    }

    async release(id: string) {
        const order = await this.findOne(id)
        if (order.status === 'CANCELLED') {
            throw new BadRequestException('Cannot release a cancelled production order')
        }
        if (order.status === 'RELEASED') {
            return order
        }
        if (order.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot release order in status ${order.status}`)
        }

        if (!order.materials.length) {
            const exploded = await this.bom.explodeRequirements({
                companyId: order.companyId,
                parentMaterialId: order.finishedMaterialId,
                orderQuantity: Number(order.plannedQuantity),
                plantId: order.plantId,
            })
            await this.prisma.ppProductionOrderMaterial.createMany({
                data: exploded.map((c, idx) => ({
                    productionOrderId: order.id,
                    lineNumber: idx + 1,
                    materialId: c.materialId,
                    requiredQuantity: c.quantity,
                })),
            })
        }

        const updated = await this.prisma.ppProductionOrder.update({
            where: { id },
            data: { status: 'RELEASED' },
            include: this.includes,
        })

        const payload = this.toEventPayload(updated)
        await this.ppEvents.emit(PP_EVENTS.PRODUCTION_ORDER_RELEASED, payload)
        await this.ppEvents.emit(
            PP_EVENTS.PRODUCTION_MATERIAL_REQUIREMENT_CREATED,
            payload,
        )
        return updated
    }

    async cancel(id: string) {
        const order = await this.findOne(id)
        if (order.status === 'CANCELLED') return order

        const updated = await this.prisma.ppProductionOrder.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: this.includes,
        })

        await this.ppEvents.emit(
            PP_EVENTS.PRODUCTION_ORDER_CANCELLED,
            this.toEventPayload(updated),
        )
        return updated
    }

    async changeMaterialQuantity(
        orderId: string,
        lineId: string,
        dto: ChangeProductionMaterialQtyDto,
    ) {
        const order = await this.findOne(orderId)
        if (order.status === 'CANCELLED') {
            throw new BadRequestException('Cannot change quantity on cancelled order')
        }
        const line = order.materials.find((m) => m.id === lineId)
        if (!line) throw new NotFoundException('Production material line not found')

        const newQty = new Decimal(dto.quantity)
        if (newQty.lt(line.issuedQuantity)) {
            throw new BadRequestException(
                'New quantity cannot be less than already issued quantity',
            )
        }

        const previousQuantity = line.requiredQuantity.toString()
        await this.prisma.ppProductionOrderMaterial.update({
            where: { id: lineId },
            data: { requiredQuantity: newQty },
        })

        const refreshed = await this.findOne(orderId)
        await this.ppEvents.emit(PP_EVENTS.PRODUCTION_MATERIAL_REQUIREMENT_CHANGED, {
            ...this.toEventPayload(refreshed),
            changedMaterials: [
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
        productionOrderId: string
        reservationHeaderId: string
        lines: Array<{
            lineId: string
            reservedQuantity: string
            integrationStatus: string
        }>
    }) {
        for (const line of args.lines) {
            await this.prisma.ppProductionOrderMaterial.update({
                where: { id: line.lineId },
                data: {
                    reservationHeaderId: args.reservationHeaderId,
                    reservedQuantity: new Decimal(line.reservedQuantity),
                    integrationStatus: line.integrationStatus,
                },
            })
        }
    }

    async applyReservationReleased(productionOrderId: string) {
        const order = await this.findOne(productionOrderId)
        for (const line of order.materials) {
            const status =
                order.status === 'CANCELLED' ? 'CANCELLED' : 'OPEN'
            await this.prisma.ppProductionOrderMaterial.update({
                where: { id: line.id },
                data: {
                    reservedQuantity: new Decimal(0),
                    reservationHeaderId: null,
                    integrationStatus: status,
                },
            })
        }
    }

    async applyPartialRelease(args: {
        productionOrderId: string
        lineId: string
        newReservedQuantity: string
    }) {
        await this.prisma.ppProductionOrderMaterial.update({
            where: { id: args.lineId },
            data: {
                reservedQuantity: new Decimal(args.newReservedQuantity),
                integrationStatus: 'RESERVED',
            },
        })
    }

    async applyGoodsIssuePosted(args: {
        productionOrderId: string
        lines: Array<{ lineId: string; issuedQuantity: string }>
    }) {
        for (const line of args.lines) {
            const existing = await this.prisma.ppProductionOrderMaterial.findUnique({
                where: { id: line.lineId },
            })
            if (!existing) continue
            const issued = new Decimal(existing.issuedQuantity).plus(line.issuedQuantity)
            const fulfilled = issued.gte(existing.requiredQuantity)
            await this.prisma.ppProductionOrderMaterial.update({
                where: { id: line.lineId },
                data: {
                    issuedQuantity: issued,
                    integrationStatus: fulfilled ? 'ISSUED' : 'RESERVED',
                },
            })
        }
    }

    async applyGoodsReceiptPosted(args: {
        productionOrderId: string
        outputId: string
        goodsReceiptId: string
    }) {
        await this.prisma.ppProductionOutput.update({
            where: { id: args.outputId },
            data: {
                goodsReceiptId: args.goodsReceiptId,
                status: 'RECEIVED',
            },
        })
        const order = await this.findOne(args.productionOrderId)
        const allIssued = order.materials.every(
            (m) => m.integrationStatus === 'ISSUED',
        )
        if (allIssued) {
            await this.prisma.ppProductionOrder.update({
                where: { id: args.productionOrderId },
                data: { status: 'COMPLETED' },
            })
        }
    }

    private toEventPayload(order: Awaited<ReturnType<typeof this.findOne>>) {
        return {
            productionOrderId: order.id,
            orderNumber: order.orderNumber,
            companyId: order.companyId,
            warehouseId: order.warehouseId,
            plantId: order.plantId,
            finishedMaterialId: order.finishedMaterialId,
            plannedQuantity: order.plannedQuantity.toString(),
            correlationId: order.correlationId,
            idempotencyKey: order.idempotencyKey,
            materials: order.materials.map((m) => ({
                lineId: m.id,
                lineNumber: m.lineNumber,
                materialId: m.materialId,
                quantity: m.requiredQuantity.toString(),
                demandReferenceLineId: m.id,
            })),
        }
    }

    private async nextOrderNumber() {
        const count = await this.prisma.ppProductionOrder.count()
        return `PO-${String(count + 1).padStart(6, '0')}`
    }
}
