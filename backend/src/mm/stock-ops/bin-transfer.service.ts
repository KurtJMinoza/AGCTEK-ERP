import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { CreateBinTransferDto } from './dto/create-bin-transfer.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'
import { Decimal } from '@prisma/client/runtime/library'

@Injectable()
export class BinTransferService {
    constructor(
        private prisma: PrismaService,
        private postingService: InventoryPostingService,
        private events: EventEmitter2,
    ) {}

    async create(dto: CreateBinTransferDto) {
        const docNumber = await this.generateDocNumber('BT')

        const lines = dto.lines.map((l) => ({
            materialId: l.materialId,
            quantity: new Decimal(l.quantity),
            uomId: l.uomId,
            sourceBinId: l.sourceBinId,
            destinationBinId: l.destinationBinId,
            batchId: l.batchId ?? null,
            serialNumberId: l.serialNumberId ?? null,
        }))

        return this.prisma.mmBinTransfer.create({
            data: {
                documentNumber: docNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                postingDate: new Date(dto.postingDate),
                remarks: dto.remarks ?? null,
                createdBy: dto.createdBy ?? null,
                status: 'DRAFT',
                lines: { create: lines },
            },
            include: { lines: true },
        })
    }

    async post(id: string, idempotencyKey?: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot post: document is ${doc.status}`)
        }

        for (const line of doc.lines) {
            const baseFields = {
                companyId: doc.companyId,
                warehouseId: doc.warehouseId,
                materialId: line.materialId,
                batchId: line.batchId ?? undefined,
                serialNumberId: line.serialNumberId ?? undefined,
                stockStatus: 'UNRESTRICTED',
                quantity: Number(line.quantity),
                uomId: line.uomId,
                postingDate: doc.postingDate.toISOString(),
                documentDate: doc.postingDate.toISOString(),
                sourceModule: 'STOCK_OPS',
                sourceDocumentType: 'BIN_TRANSFER',
                sourceDocumentId: doc.id,
                sourceDocumentLineId: line.id,
                createdBy: doc.createdBy ?? undefined,
            }

            await this.postingService.postTransaction({
                ...baseFields,
                storageBinId: line.sourceBinId,
                movementType: 'TRANSFER_OUT',
                idempotencyKey: idempotencyKey
                    ? `${idempotencyKey}:${line.id}:out`
                    : undefined,
            })

            await this.postingService.postTransaction({
                ...baseFields,
                storageBinId: line.destinationBinId,
                movementType: 'TRANSFER_IN',
                idempotencyKey: idempotencyKey
                    ? `${idempotencyKey}:${line.id}:in`
                    : undefined,
            })
        }

        return this.prisma.mmBinTransfer.update({
            where: { id },
            data: { status: 'POSTED' },
            include: { lines: true },
        })
    }

    async cancel(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot cancel: document is ${doc.status}`)
        }

        return this.prisma.mmBinTransfer.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: { lines: true },
        })
    }

    async reverse(id: string, createdBy?: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'POSTED') {
            throw new BadRequestException(`Cannot reverse: document is ${doc.status}`)
        }

        const ledgerTxns = await this.prisma.mmInventoryTransaction.findMany({
            where: { sourceDocumentId: id, sourceDocumentType: 'BIN_TRANSFER' },
        })

        for (const txn of ledgerTxns) {
            await this.postingService.reverseTransaction(txn.id, {
                reasonCode: 'REVERSAL',
                remarks: `Reversal of bin transfer ${doc.documentNumber}`,
                createdBy,
            })
        }

        return this.prisma.mmBinTransfer.update({
            where: { id },
            data: { status: 'REVERSED' },
            include: { lines: true },
        })
    }

    async findAll(query: StockOpsQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.search) {
            where.documentNumber = { contains: query.search, mode: 'insensitive' }
        }

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20

        const [data, total] = await Promise.all([
            this.prisma.mmBinTransfer.findMany({
                where,
                include: {
                    lines: { include: { material: true, uom: true, sourceBin: true, destinationBin: true } },
                    warehouse: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmBinTransfer.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    private async findOneOrFail(id: string) {
        const doc = await this.prisma.mmBinTransfer.findUnique({
            where: { id },
            include: {
                lines: { include: { material: true, uom: true, sourceBin: true, destinationBin: true } },
                warehouse: true,
            },
        })
        if (!doc) throw new NotFoundException('Bin transfer not found')
        return doc
    }

    private async generateDocNumber(prefix: string): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `${prefix}-${dateStr}-`

        const last = await this.prisma.mmBinTransfer.findFirst({
            where: { documentNumber: { startsWith: pfx } },
            orderBy: { documentNumber: 'desc' },
        })

        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.documentNumber.replace(pfx, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }

        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
