import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { ReservationEngineService } from '../inventory/reservation-allocation/reservation-engine.service'
import { AllocationEngineService } from '../inventory/reservation-allocation/allocation-engine.service'

@Injectable()
export class StockTransferAllocationService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => ReservationEngineService))
        private reservations: ReservationEngineService,
        @Inject(forwardRef(() => AllocationEngineService))
        private allocations: AllocationEngineService,
    ) {}

    async allocateOrder(orderId: string) {
        const order = await this.prisma.mmStockTransferOrder.findUnique({
            where: { id: orderId },
            include: { lines: true },
        })
        if (!order) throw new BadRequestException('Stock transfer order not found')
        if (order.status !== 'APPROVED') {
            throw new BadRequestException(`Cannot allocate: order is ${order.status}`)
        }

        const header = await this.reservations.create({
            companyId: order.companyId,
            warehouseId: order.sourceWarehouseId,
            sourceModule: 'STOCK_TRANSFER',
            sourceDocumentType: 'STOCK_TRANSFER_ORDER',
            sourceDocumentId: order.id,
            demandReferenceType: 'STOCK_TRANSFER_ORDER',
            demandReferenceId: order.id,
            createdBy: order.requestedBy ?? undefined,
            lines: order.lines.map((l) => ({
                materialId: l.materialId,
                quantity: Number(l.quantity),
                batchId: l.batchId ?? undefined,
                serialNumberId: l.serialNumberId ?? undefined,
                uomId: l.uomId,
            })),
        })

        const allocation = await this.allocations.allocateHeader(header.id, {
            strategy: 'FIFO',
            generatePickTasks: true,
            createdBy: order.requestedBy ?? undefined,
        })

        for (const line of order.lines) {
            await this.prisma.mmStockTransferOrderLine.update({
                where: { id: line.id },
                data: {
                    allocatedQty: line.quantity,
                    status: 'ALLOCATED',
                },
            })
        }

        return this.prisma.mmStockTransferOrder.update({
            where: { id: orderId },
            data: {
                status: 'ALLOCATED',
                reservationHeaderId: header.id,
            },
            include: {
                lines: true,
                sourceWarehouse: true,
                destinationWarehouse: true,
                shipments: true,
                receipts: true,
            },
        })
    }

    async releaseReservation(orderId: string) {
        const order = await this.prisma.mmStockTransferOrder.findUnique({
            where: { id: orderId },
        })
        if (!order?.reservationHeaderId) return
        try {
            await this.reservations.cancel(order.reservationHeaderId)
        } catch {
            /* already released */
        }
        void new Decimal(0)
    }
}
