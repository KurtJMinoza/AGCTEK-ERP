import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    ApproveStoDto,
    CreateStockTransferOrderDto,
    DispatchStoDto,
    ReceiveStoDto,
    StoQueryDto,
} from './dto/stock-transfer.dto'
import { StockTransferValidationService } from './stock-transfer-validation.service'
import { StockTransferAllocationService } from './stock-transfer-allocation.service'
import { StockTransferShipmentService } from './stock-transfer-shipment.service'
import { StockTransferReceiptService } from './stock-transfer-receipt.service'
import { StockTransferWarehouseBridgeService } from './stock-transfer-warehouse-bridge.service'
import { PRE_DISPATCH_STATUSES } from './stock-transfer.constants'

@Injectable()
export class StockTransferOrderService {
    constructor(
        private prisma: PrismaService,
        private validation: StockTransferValidationService,
        private allocation: StockTransferAllocationService,
        private shipments: StockTransferShipmentService,
        private receipts: StockTransferReceiptService,
        private warehouseBridge: StockTransferWarehouseBridgeService,
    ) {}

    private readonly includes = {
        sourceWarehouse: true,
        destinationWarehouse: true,
        lines: {
            include: {
                material: true,
                sourceBin: true,
                destinationBin: true,
                batch: true,
                serialNumber: true,
            },
        },
        shipments: { include: { lines: true } },
        receipts: { include: { lines: true } },
    }

    async create(dto: CreateStockTransferOrderDto) {
        await this.validation.assertWarehouses(
            dto.companyId,
            dto.transferType,
            dto.sourceWarehouseId,
            dto.destinationWarehouseId,
        )
        await this.validation.assertLines(
            dto.companyId,
            dto.sourceWarehouseId,
            dto.transferType,
            dto.lines,
        )

        const orderNumber = await this.nextOrderNumber()
        return this.prisma.mmStockTransferOrder.create({
            data: {
                orderNumber,
                companyId: dto.companyId,
                transferType: dto.transferType,
                sourceWarehouseId: dto.sourceWarehouseId,
                destinationWarehouseId: dto.destinationWarehouseId,
                postingDate: dto.postingDate ? new Date(dto.postingDate) : new Date(),
                requestedBy: dto.requestedBy ?? null,
                notes: dto.notes ?? null,
                status: 'DRAFT',
                lines: {
                    create: dto.lines.map((l, idx) => ({
                        lineNumber: idx + 1,
                        materialId: l.materialId,
                        quantity: new Decimal(l.quantity),
                        uomId: l.uomId,
                        sourceBinId: l.sourceBinId ?? null,
                        destinationBinId: l.destinationBinId ?? null,
                        batchId: l.batchId ?? null,
                        serialNumberId: l.serialNumberId ?? null,
                        status: 'PENDING',
                    })),
                },
            },
            include: this.includes,
        })
    }

    async findAll(query: StoQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const where: Record<string, unknown> = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.sourceWarehouseId) where.sourceWarehouseId = query.sourceWarehouseId
        if (query.destinationWarehouseId) where.destinationWarehouseId = query.destinationWarehouseId
        if (query.status) where.status = query.status
        if (query.transferType) where.transferType = query.transferType
        if (query.search) {
            where.OR = [
                { orderNumber: { contains: query.search, mode: 'insensitive' } },
                { notes: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const [data, total] = await Promise.all([
            this.prisma.mmStockTransferOrder.findMany({
                where,
                include: this.includes,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmStockTransferOrder.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const order = await this.prisma.mmStockTransferOrder.findUnique({
            where: { id },
            include: this.includes,
        })
        if (!order) throw new NotFoundException('Stock transfer order not found')
        return order
    }

    async submit(id: string) {
        const order = await this.findOne(id)
        if (order.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot submit: order is ${order.status}`)
        }
        return this.prisma.mmStockTransferOrder.update({
            where: { id },
            data: {
                status: 'PENDING_APPROVAL',
                submittedAt: new Date(),
            },
            include: this.includes,
        })
    }

    async approve(id: string, dto: ApproveStoDto = {}) {
        const order = await this.findOne(id)
        if (order.status !== 'PENDING_APPROVAL' && order.status !== 'SUBMITTED') {
            // Allow approve from DRAFT for bridge compat (skip submit)
            if (order.status !== 'DRAFT') {
                throw new BadRequestException(`Cannot approve: order is ${order.status}`)
            }
        }
        return this.prisma.mmStockTransferOrder.update({
            where: { id },
            data: {
                status: 'APPROVED',
                approvedBy: dto.approvedBy ?? null,
                approvedAt: new Date(),
                submittedAt: order.submittedAt ?? new Date(),
            },
            include: this.includes,
        })
    }

    async allocate(id: string) {
        await this.allocation.allocateOrder(id)
        await this.warehouseBridge.createPickTasksForOrder(id)
        return this.findOne(id)
    }

    async dispatch(id: string, dto: DispatchStoDto = {}) {
        return this.shipments.dispatch(id, dto)
    }

    async receive(id: string, dto: ReceiveStoDto) {
        return this.receipts.receive(id, dto)
    }

    async cancel(id: string) {
        const order = await this.findOne(id)
        if (!PRE_DISPATCH_STATUSES.has(order.status)) {
            throw new BadRequestException(`Cannot cancel: order is ${order.status}`)
        }
        await this.allocation.releaseReservation(id)
        return this.prisma.mmStockTransferOrder.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: this.includes,
        })
    }

    /** Bridge helper: create STO from legacy Wm transfer payload shape */
    async createFromLegacyWm(input: {
        companyId: string
        sourceWarehouseId: string
        destinationWarehouseId: string
        requestedBy?: string
        notes?: string
        lines: Array<{
            materialId: string
            quantity: number
            uomId: string
            sourceBinId?: string
            destinationBinId?: string
            batchId?: string
            serialId?: string
        }>
    }) {
        return this.create({
            companyId: input.companyId,
            transferType:
                input.sourceWarehouseId === input.destinationWarehouseId
                    ? 'BIN_TO_BIN'
                    : 'WAREHOUSE_TO_WAREHOUSE',
            sourceWarehouseId: input.sourceWarehouseId,
            destinationWarehouseId: input.destinationWarehouseId,
            requestedBy: input.requestedBy,
            notes: input.notes,
            lines: input.lines.map((l) => ({
                materialId: l.materialId,
                quantity: l.quantity,
                uomId: l.uomId,
                sourceBinId: l.sourceBinId,
                destinationBinId: l.destinationBinId,
                batchId: l.batchId,
                serialNumberId: l.serialId,
            })),
        })
    }

    private async nextOrderNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `STO-${today}-`
        const last = await this.prisma.mmStockTransferOrder.findFirst({
            where: { orderNumber: { startsWith: pfx } },
            orderBy: { orderNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.orderNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
