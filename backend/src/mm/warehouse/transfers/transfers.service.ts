import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { InventoryPostingService } from '../../inventory/inventory-posting.service'
import { CreateTransferDto } from './dto/create-transfer.dto'
import { TransferQueryDto } from './dto/transfer-query.dto'
import { Decimal } from '@prisma/client/runtime/library'
import {
    postInterWarehouseDispatch,
    postInterWarehouseReceive,
} from './inter-warehouse-posting'

@Injectable()
export class TransfersService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => InventoryPostingService))
        private posting: InventoryPostingService,
    ) {}

    private readonly listIncludes = {
        sourceWarehouse: true,
        destinationWarehouse: true,
        lines: true,
    }

    private readonly detailIncludes = {
        sourceWarehouse: true,
        destinationWarehouse: true,
        lines: {
            include: {
                material: true,
                sourceBin: true,
                destinationBin: true,
            },
        },
    }

    async findAll(query: TransferQueryDto) {
        const {
            page = 1,
            limit = 20,
            status,
            sourceWarehouseId,
            destinationWarehouseId,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = query

        const where: any = {}
        if (status) where.status = status
        if (sourceWarehouseId) where.sourceWarehouseId = sourceWarehouseId
        if (destinationWarehouseId) where.destinationWarehouseId = destinationWarehouseId
        if (search) {
            where.OR = [
                { transferNumber: { contains: search, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await Promise.all([
            this.prisma.wmWarehouseTransfer.findMany({
                where,
                include: this.listIncludes,
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.wmWarehouseTransfer.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const transfer = await this.prisma.wmWarehouseTransfer.findUnique({
            where: { id },
            include: this.detailIncludes,
        })
        if (!transfer) throw new NotFoundException('Warehouse transfer not found')
        return transfer
    }

    async create(dto: CreateTransferDto) {
        const transferNumber = await this.generateNextCode()

        return this.prisma.wmWarehouseTransfer.create({
            data: {
                transferNumber,
                sourceWarehouseId: dto.sourceWarehouseId,
                destinationWarehouseId: dto.destinationWarehouseId,
                requestedBy: dto.requestedBy ?? null,
                notes: dto.notes ?? null,
                status: 'DRAFT',
                lines: {
                    create: dto.lines.map((line) => ({
                        materialId: line.materialId,
                        quantity: line.quantity,
                        batchId: line.batchId ?? null,
                        serialId: line.serialId ?? null,
                        sourceBinId: line.sourceBinId ?? null,
                        destinationBinId: line.destinationBinId ?? null,
                        status: 'PENDING',
                    })),
                },
            },
            include: this.detailIncludes,
        })
    }

    async approve(id: string, approvedBy?: string) {
        const transfer = await this.findOne(id)
        if (transfer.status !== 'DRAFT') {
            throw new BadRequestException('Only DRAFT transfers can be approved')
        }
        return this.prisma.wmWarehouseTransfer.update({
            where: { id },
            data: { status: 'APPROVED', approvedBy: approvedBy ?? null },
            include: this.detailIncludes,
        })
    }

    async pick(id: string, lineId: string, pickedQty: number) {
        const transfer = await this.findOne(id)
        if (transfer.status !== 'APPROVED' && transfer.status !== 'PICKED') {
            throw new BadRequestException('Transfer must be APPROVED before picking')
        }

        const line = transfer.lines.find((l) => l.id === lineId)
        if (!line) throw new NotFoundException('Transfer line not found')

        const newPickedQty = new Decimal(line.pickedQty).plus(pickedQty)
        await this.prisma.wmWarehouseTransferLine.update({
            where: { id: lineId },
            data: { pickedQty: newPickedQty },
        })

        const updatedTransfer = await this.findOne(id)
        const allPicked = updatedTransfer.lines.every(
            (l) => new Decimal(l.pickedQty).gte(l.quantity),
        )

        if (allPicked) {
            return this.prisma.wmWarehouseTransfer.update({
                where: { id },
                data: { status: 'PICKED' },
                include: this.detailIncludes,
            })
        }

        return updatedTransfer
    }

    /**
     * Dispatch: require PICKED. Source UNRESTRICTED OUT + dest IN_TRANSIT IN.
     */
    async dispatch(id: string) {
        const claimed = await this.prisma.wmWarehouseTransfer.updateMany({
            where: {
                id,
                status: 'PICKED',
            },
            data: { status: 'IN_TRANSIT' },
        })
        if (claimed.count === 0) {
            const transfer = await this.findOne(id)
            throw new BadRequestException(
                `Cannot dispatch: transfer must be PICKED (status ${transfer.status})`,
            )
        }

        const transfer = await this.findOne(id)
        const sourceWh = await this.prisma.warehouse.findUnique({
            where: { id: transfer.sourceWarehouseId },
        })
        if (!sourceWh) throw new NotFoundException('Source warehouse not found')

        const today = new Date().toISOString()
        const materialIds = [...new Set(transfer.lines.map((l) => l.materialId))]
        const materials = await this.prisma.mmMaterial.findMany({
            where: { id: { in: materialIds } },
            select: { id: true, baseUomId: true },
        })
        const uomByMaterial = new Map(materials.map((m) => [m.id, m.baseUomId]))

        const lines = transfer.lines.map((line) => {
            const uomId = uomByMaterial.get(line.materialId)
            if (!uomId) {
                throw new BadRequestException(`Material ${line.materialId} not found`)
            }
            const qty = Number(line.pickedQty.gt(0) ? line.pickedQty : line.quantity)
            return {
                id: line.id,
                materialId: line.materialId,
                quantity: qty,
                uomId,
                sourceBinId: line.sourceBinId,
                destinationBinId: line.destinationBinId,
                batchId: line.batchId,
                serialNumberId: line.serialId,
            }
        })

        await postInterWarehouseDispatch({
            posting: this.posting,
            companyId: sourceWh.companyId,
            sourceWarehouseId: transfer.sourceWarehouseId,
            destinationWarehouseId: transfer.destinationWarehouseId,
            documentId: transfer.id,
            sourceDocumentType: 'WM_TRANSFER',
            sourceModule: 'WAREHOUSE',
            postingDate: today,
            createdBy: transfer.requestedBy ?? undefined,
            lines,
            idempotencyPrefix: `wm-xfer:${transfer.id}`,
        })

        return this.findOne(id)
    }

    async receive(id: string, lineId: string, receivedQty: number) {
        if (receivedQty <= 0) {
            throw new BadRequestException('Received quantity must be positive')
        }

        const transfer = await this.findOne(id)
        if (transfer.status !== 'IN_TRANSIT' && transfer.status !== 'RECEIVED') {
            throw new BadRequestException('Transfer must be IN_TRANSIT to receive')
        }

        const line = transfer.lines.find((l) => l.id === lineId)
        if (!line) throw new NotFoundException('Transfer line not found')

        const prevReceived = new Decimal(line.receivedQty)
        const newReceivedQty = prevReceived.plus(receivedQty)
        if (newReceivedQty.gt(line.quantity)) {
            throw new BadRequestException('Received quantity exceeds transferred quantity')
        }

        const destWh = await this.prisma.warehouse.findUnique({
            where: { id: transfer.destinationWarehouseId },
        })
        if (!destWh) throw new NotFoundException('Destination warehouse not found')

        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: line.materialId },
            select: { id: true, baseUomId: true },
        })
        if (!material) {
            throw new BadRequestException(`Material ${line.materialId} not found`)
        }

        const today = new Date().toISOString()
        const idemSeq = `${prevReceived.toString()}-${newReceivedQty.toString()}`

        await postInterWarehouseReceive({
            posting: this.posting,
            companyId: destWh.companyId,
            destinationWarehouseId: transfer.destinationWarehouseId,
            documentId: transfer.id,
            sourceDocumentType: 'WM_TRANSFER',
            sourceModule: 'WAREHOUSE',
            postingDate: today,
            createdBy: transfer.requestedBy ?? undefined,
            line: {
                id: line.id,
                materialId: line.materialId,
                quantity: Number(line.quantity),
                uomId: material.baseUomId,
                destinationBinId: line.destinationBinId,
                batchId: line.batchId,
                serialNumberId: line.serialId,
            },
            receivedQty,
            idempotencyKey: `wm-xfer:${transfer.id}:${line.id}:in:${idemSeq}`,
        })

        const lineStatus = newReceivedQty.gte(line.quantity) ? 'RECEIVED' : 'PENDING'
        await this.prisma.wmWarehouseTransferLine.update({
            where: { id: lineId },
            data: { receivedQty: newReceivedQty, status: lineStatus },
        })

        const updated = await this.findOne(id)
        const allReceived = updated.lines.every((l) =>
            new Decimal(l.receivedQty).gte(l.quantity),
        )
        if (allReceived && updated.status === 'IN_TRANSIT') {
            return this.prisma.wmWarehouseTransfer.update({
                where: { id },
                data: { status: 'RECEIVED' },
                include: this.detailIncludes,
            })
        }

        return updated
    }

    /**
     * Complete: close document after lines are received. TRANSFER_IN is posted on receive.
     */
    async complete(id: string) {
        const transfer = await this.findOne(id)
        if (transfer.status !== 'IN_TRANSIT' && transfer.status !== 'RECEIVED') {
            throw new BadRequestException('Transfer must be IN_TRANSIT or RECEIVED to complete')
        }

        const incomplete = transfer.lines.filter(
            (l) => new Decimal(l.receivedQty).lt(l.quantity),
        )
        if (incomplete.length > 0) {
            throw new BadRequestException(
                `${incomplete.length} line(s) not fully received — receive stock before complete`,
            )
        }

        const claimed = await this.prisma.wmWarehouseTransfer.updateMany({
            where: {
                id,
                status: { in: ['IN_TRANSIT', 'RECEIVED'] },
            },
            data: { status: 'COMPLETED' },
        })
        if (claimed.count === 0) {
            throw new BadRequestException(
                `Cannot complete transfer in status ${transfer.status}`,
            )
        }

        return this.findOne(id)
    }

    async cancel(id: string) {
        const transfer = await this.findOne(id)
        if (transfer.status !== 'DRAFT' && transfer.status !== 'APPROVED') {
            throw new BadRequestException('Can only cancel DRAFT or APPROVED transfers')
        }
        return this.prisma.wmWarehouseTransfer.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: this.detailIncludes,
        })
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.wmWarehouseTransfer.findFirst({
            where: { transferNumber: { startsWith: 'TO-' } },
            orderBy: { transferNumber: 'desc' },
            select: { transferNumber: true },
        })
        let seq = 1
        if (last) {
            const num = parseInt(last.transferNumber.replace('TO-', ''), 10)
            if (!isNaN(num)) seq = num + 1
        }
        return `TO-${String(seq).padStart(6, '0')}`
    }
}
