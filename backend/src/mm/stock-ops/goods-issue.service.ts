import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { ReservationService } from '../outbound/reservation.service'
import { CreateGoodsIssueDto } from './dto/create-goods-issue.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'
import { Decimal } from '@prisma/client/runtime/library'

/**
 * Goods Issue is the hard inventory deduction:
 * Picking → Packing → Goods Issue → Inventory Ledger (+ COGS/expense accounting event)
 */
@Injectable()
export class GoodsIssueService {
    constructor(
        private prisma: PrismaService,
        private postingService: InventoryPostingService,
        private reservations: ReservationService,
        private events: EventEmitter2,
    ) {}

    async create(dto: CreateGoodsIssueDto) {
        if (dto.idempotencyKey) {
            const existing = await this.prisma.mmGoodsIssue.findFirst({
                where: { remarks: `idem:${dto.idempotencyKey}` },
                include: { lines: true },
            })
            // Prefer a dedicated column if present later; remarks tag is transitional.
            if (existing) return existing
        }

        if (dto.packageId) {
            await this.validatePackageForIssue(dto.packageId)
        }
        if (dto.reservationId) {
            await this.validateReservation(dto.reservationId)
        }

        for (const line of dto.lines) {
            await this.validateLinePreconditions(dto, line)
        }

        const docNumber = await this.generateDocNumber('GI')

        const lines = dto.lines.map((l) => {
            const unitCost = new Decimal(l.unitCost ?? 0)
            const totalCost =
                l.totalCost !== undefined
                    ? new Decimal(l.totalCost)
                    : unitCost.mul(l.quantity)
            return {
                materialId: l.materialId,
                quantity: new Decimal(l.quantity),
                uomId: l.uomId,
                storageBinId: l.storageBinId ?? null,
                batchId: l.batchId ?? null,
                serialNumberId: l.serialNumberId ?? null,
                reservationId: l.reservationId ?? dto.reservationId ?? null,
                pickingTaskId: l.pickingTaskId ?? null,
                unitCost,
                totalCost,
                remarks: l.remarks ?? null,
            }
        })

        return this.prisma.mmGoodsIssue.create({
            data: {
                documentNumber: docNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                reservationId: dto.reservationId ?? null,
                packageId: dto.packageId ?? null,
                sourceDocumentType: dto.sourceDocumentType ?? null,
                sourceDocumentId: dto.sourceDocumentId ?? null,
                postingDate: new Date(dto.postingDate),
                documentDate: new Date(dto.documentDate),
                issuePurpose: dto.issuePurpose ?? 'INTERNAL',
                remarks: dto.idempotencyKey
                    ? `idem:${dto.idempotencyKey}${dto.remarks ? ` | ${dto.remarks}` : ''}`
                    : (dto.remarks ?? null),
                createdBy: dto.createdBy ?? null,
                status: 'DRAFT',
                lines: { create: lines },
            },
            include: { lines: true },
        })
    }

    async createFromPackage(packageId: string, opts: {
        companyId: string
        postingDate: string
        documentDate: string
        issuePurpose?: string
        createdBy?: string
        unitCostByMaterial?: Record<string, number>
    }) {
        const pkg = await this.validatePackageForIssue(packageId)
        const lines = pkg.items.map((item) => ({
            materialId: item.materialId,
            quantity: Number(item.scannedQty),
            uomId: '', // filled below
            storageBinId: pkg.pickingTask?.sourceBinId,
            batchId: item.batchId ?? undefined,
            serialNumberId: item.serialId ?? undefined,
            reservationId: pkg.reservationId ?? undefined,
            pickingTaskId: pkg.pickingTaskId ?? undefined,
            unitCost: opts.unitCostByMaterial?.[item.materialId] ?? 0,
        }))

        for (const line of lines) {
            const mat = await this.prisma.mmMaterial.findUnique({
                where: { id: line.materialId },
            })
            if (!mat) throw new BadRequestException(`Material ${line.materialId} not found`)
            line.uomId = mat.baseUomId
        }

        return this.create({
            companyId: opts.companyId,
            warehouseId: pkg.warehouseId,
            packageId,
            reservationId: pkg.reservationId ?? undefined,
            postingDate: opts.postingDate,
            documentDate: opts.documentDate,
            issuePurpose: opts.issuePurpose ?? 'SALES',
            createdBy: opts.createdBy,
            sourceDocumentType: 'PACKAGE',
            sourceDocumentId: packageId,
            lines,
        })
    }

    async post(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot post: document is ${doc.status}`)
        }

        if (doc.packageId) {
            await this.validatePackageForIssue(doc.packageId)
        }

        for (const line of doc.lines) {
            if (!line.storageBinId) {
                throw new BadRequestException(
                    `Line ${line.id}: source bin is required for goods issue`,
                )
            }

            const material = await this.prisma.mmMaterial.findUnique({
                where: { id: line.materialId },
            })
            if (!material) throw new BadRequestException('Material not found')
            if (material.batchManaged && !line.batchId) {
                throw new BadRequestException('Batch is required for batch-managed material')
            }
            if (material.serialManaged && !line.serialNumberId) {
                throw new BadRequestException('Serial is required for serial-managed material')
            }

            if (line.pickingTaskId) {
                const task = await this.prisma.wmPickingTask.findUnique({
                    where: { id: line.pickingTaskId },
                })
                if (!task) throw new BadRequestException('Picking task not found')
                if (new Decimal(task.pickedQty).lt(line.quantity)) {
                    throw new BadRequestException(
                        `Picked quantity insufficient for issue. Picked: ${task.pickedQty}, Issue: ${line.quantity}`,
                    )
                }
                if (task.sourceBinId !== line.storageBinId) {
                    throw new BadRequestException('Issue bin does not match picking source bin')
                }
            }

            const reservationId = line.reservationId ?? doc.reservationId
            const consumeReserved = !!reservationId

            await this.postingService.postTransaction({
                companyId: doc.companyId,
                warehouseId: doc.warehouseId,
                storageBinId: line.storageBinId,
                materialId: line.materialId,
                batchId: line.batchId ?? undefined,
                serialNumberId: line.serialNumberId ?? undefined,
                stockStatus: 'UNRESTRICTED',
                movementType: 'ISSUE',
                quantity: Number(line.quantity),
                uomId: line.uomId,
                unitCost: Number(line.unitCost),
                totalCost: Number(line.totalCost),
                postingDate: doc.postingDate.toISOString(),
                documentDate: doc.documentDate.toISOString(),
                sourceModule: 'STOCK_OPS',
                sourceDocumentType: 'GOODS_ISSUE',
                sourceDocumentId: doc.id,
                sourceDocumentLineId: line.id,
                createdBy: doc.createdBy ?? undefined,
                stockCheckMode: consumeReserved ? 'ON_HAND' : 'AVAILABLE',
                releaseReservedQuantity: consumeReserved
                    ? Number(line.quantity)
                    : undefined,
                idempotencyKey: `gi:${doc.id}:${line.id}`,
            })

            if (reservationId) {
                await this.reservations.fulfill(reservationId, line.quantity)
            }
        }

        const updated = await this.prisma.mmGoodsIssue.update({
            where: { id },
            data: { status: 'POSTED' },
            include: { lines: true },
        })

        // FICO: emit COGS/expense accounting event — do not hardcode GL accounts
        const payload = {
            sourceModule: 'STOCK_OPS',
            documentType: 'GOODS_ISSUE',
            documentId: doc.id,
            companyId: doc.companyId,
            eventHint: 'COGS_OR_EXPENSE',
            issuePurpose: doc.issuePurpose,
            lines: doc.lines.map((l) => ({
                materialId: l.materialId,
                quantity: Number(l.quantity),
                unitCost: Number(l.unitCost),
                totalCost: Number(l.totalCost),
            })),
        }
        await this.prisma.mmAccountingEvent.create({
            data: {
                eventType: 'GOODS_ISSUE_POSTED',
                sourceModule: 'STOCK_OPS',
                documentType: 'GOODS_ISSUE',
                documentId: doc.id,
                companyId: doc.companyId,
                payload,
                status: 'PENDING',
            },
        })
        this.events.emit('accounting.entry.requested', payload)
        this.events.emit('goods-issue.posted', { goodsIssueId: doc.id })

        return updated
    }

    async cancel(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot cancel: document is ${doc.status}`)
        }

        return this.prisma.mmGoodsIssue.update({
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
            where: {
                sourceDocumentId: id,
                sourceDocumentType: 'GOODS_ISSUE',
                reversalOfId: null,
                quantity: { gt: 0 },
            },
        })

        for (const txn of ledgerTxns) {
            await this.postingService.reverseTransaction(txn.id, {
                reasonCode: 'REVERSAL',
                remarks: `Reversal of goods issue ${doc.documentNumber}`,
                createdBy,
            })
        }

        for (const line of doc.lines) {
            const reservationId = line.reservationId ?? doc.reservationId
            if (reservationId) {
                await this.reservations.restoreAfterReversal(reservationId, line.quantity)
            }
        }

        await this.prisma.mmAccountingEvent.create({
            data: {
                eventType: 'GOODS_ISSUE_REVERSED',
                sourceModule: 'STOCK_OPS',
                documentType: 'GOODS_ISSUE',
                documentId: doc.id,
                companyId: doc.companyId,
                payload: {
                    sourceModule: 'STOCK_OPS',
                    documentType: 'GOODS_ISSUE_REVERSAL',
                    documentId: doc.id,
                    companyId: doc.companyId,
                    eventHint: 'COGS_OR_EXPENSE_REVERSAL',
                },
                status: 'PENDING',
            },
        })

        return this.prisma.mmGoodsIssue.update({
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
            this.prisma.mmGoodsIssue.findMany({
                where,
                include: {
                    lines: { include: { material: true, uom: true } },
                    warehouse: true,
                    reservation: true,
                    package: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmGoodsIssue.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    private async validatePackageForIssue(packageId: string) {
        const pkg = await this.prisma.wmPackage.findUnique({
            where: { id: packageId },
            include: {
                items: true,
                pickingTask: true,
            },
        })
        if (!pkg) throw new NotFoundException('Package not found')
        if (pkg.status !== 'READY_FOR_DISPATCH' && pkg.status !== 'SEALED') {
            throw new BadRequestException(
                `Package must be READY_FOR_DISPATCH (or SEALED). Current: ${pkg.status}`,
            )
        }
        const mismatch = pkg.items.some(
            (item) => !new Decimal(item.scannedQty).eq(item.expectedQty),
        )
        if (mismatch) {
            throw new BadRequestException(
                'Package contents do not match expected order — cannot goods-issue',
            )
        }
        return pkg
    }

    private async validateReservation(reservationId: string) {
        const reservation = await this.prisma.mmInventoryReservation.findUnique({
            where: { id: reservationId },
        })
        if (!reservation) throw new NotFoundException('Reservation not found')
        if (!['OPEN', 'PARTIAL'].includes(reservation.status)) {
            throw new BadRequestException(`Reservation is ${reservation.status}`)
        }
        return reservation
    }

    private async validateLinePreconditions(
        dto: CreateGoodsIssueDto,
        line: CreateGoodsIssueDto['lines'][number],
    ) {
        if (!line.storageBinId) {
            throw new BadRequestException('Each GI line requires storageBinId (source bin)')
        }
        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: line.materialId },
        })
        if (!material) throw new BadRequestException(`Material ${line.materialId} not found`)
        if (material.batchManaged && !line.batchId) {
            throw new BadRequestException('Batch required for batch-managed material')
        }
        if (material.serialManaged && !line.serialNumberId) {
            throw new BadRequestException('Serial required for serial-managed material')
        }

        const reservationId = line.reservationId ?? dto.reservationId
        if (reservationId) {
            const reservation = await this.validateReservation(reservationId)
            const open = new Decimal(reservation.quantity).minus(reservation.fulfilledQuantity)
            if (open.lt(line.quantity)) {
                throw new BadRequestException(
                    `Reservation open qty ${open} is less than issue qty ${line.quantity}`,
                )
            }
        }

        if (line.pickingTaskId) {
            const task = await this.prisma.wmPickingTask.findUnique({
                where: { id: line.pickingTaskId },
            })
            if (!task) throw new BadRequestException('Picking task not found')
            if (new Decimal(task.pickedQty).lt(line.quantity)) {
                throw new BadRequestException('Insufficient picked quantity for goods issue')
            }
        }
    }

    private async findOneOrFail(id: string) {
        const doc = await this.prisma.mmGoodsIssue.findUnique({
            where: { id },
            include: {
                lines: {
                    include: {
                        material: true,
                        uom: true,
                        storageBin: true,
                    },
                },
                warehouse: true,
                reservation: true,
                package: true,
            },
        })
        if (!doc) throw new NotFoundException('Goods issue not found')
        return doc
    }

    private async generateDocNumber(prefix: string): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `${prefix}-${dateStr}-`

        const last = await this.prisma.mmGoodsIssue.findFirst({
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
