import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { ReservationService } from '../outbound/reservation.service'
import { AllocationEngineService } from '../inventory/reservation-allocation/allocation-engine.service'
import { ReservationEngineService } from '../inventory/reservation-allocation/reservation-engine.service'
import { CreateGoodsIssueDto } from './dto/create-goods-issue.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'
import { Decimal } from '@prisma/client/runtime/library'
import { postingKey } from '../common/idempotency.util'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { MmPostingPeriodGuard } from '../integration/fico/mm-posting-period.guard'

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
        private allocationEngine: AllocationEngineService,
        private reservationEngine: ReservationEngineService,
        private events: EventEmitter2,
        private domainEvents: MmDomainEventsService,
        private periodGuard: MmPostingPeriodGuard,
    ) {}

    async create(dto: CreateGoodsIssueDto) {
        this.assertSalesIssueContract(dto)
        this.assertProductionIssueContract(dto)

        if (dto.packageId) {
            await this.validatePackageForIssue(dto.packageId)
        }
        if (dto.reservationId) {
            await this.validateReservation(dto.reservationId)
        }
        if (dto.reservationHeaderId) {
            await this.validateReservationHeader(dto.reservationHeaderId)
        }

        const resolvedLines = await this.resolveLinesFromReservationHeader(dto)

        for (const line of resolvedLines) {
            await this.validateLinePreconditions(dto, line)
        }

        const docNumber = await this.generateDocNumber('GI')

        const lines = resolvedLines.map((l) => {
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
                reservationHeaderId: dto.reservationHeaderId ?? null,
                packageId: dto.packageId ?? null,
                sourceDocumentType: dto.sourceDocumentType ?? null,
                sourceDocumentId: dto.sourceDocumentId ?? null,
                postingDate: new Date(dto.postingDate),
                documentDate: new Date(dto.documentDate),
                issuePurpose: dto.issuePurpose ?? 'INTERNAL',
                remarks: dto.remarks ?? null,
                createdBy: dto.createdBy ?? null,
                status: 'DRAFT',
                lines: { create: lines },
            },
            include: { lines: true },
        })
    }

    /**
     * Create + post GI from package for SCM trip start (idempotent).
     * Returns existing posted GI for the package when already issued.
     */
    async issueAndPostFromPackage(
        packageId: string,
        opts?: { createdBy?: string },
    ) {
        const posted = await this.prisma.mmGoodsIssue.findFirst({
            where: { packageId, status: 'POSTED' },
            include: { lines: true },
        })
        if (posted) return posted

        const draft = await this.prisma.mmGoodsIssue.findFirst({
            where: { packageId, status: 'DRAFT' },
            include: { lines: true },
        })
        if (draft) {
            return this.post(draft.id)
        }

        const pkg = await this.prisma.wmPackage.findUnique({
            where: { id: packageId },
            include: { warehouse: true },
        })
        if (!pkg) throw new NotFoundException('Package not found')

        const today = new Date().toISOString().slice(0, 10)
        const created = await this.createFromPackage(packageId, {
            companyId: pkg.warehouse.companyId,
            postingDate: today,
            documentDate: today,
            issuePurpose: 'SALES',
            createdBy: opts?.createdBy,
        })
        return this.post(created.id)
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

        await this.periodGuard.assertCanPost(doc.companyId, doc.postingDate)

        const lineTxnIds: string[] = []

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
            const consumeReserved = !!(reservationId || doc.reservationHeaderId)

            const txn = await this.postingService.postTransaction({
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
                idempotencyKey: postingKey('gi', doc.id, line.id),
            })

            if (line.pickingTaskId) {
                const pickTask = await this.prisma.wmPickingTask.findUnique({
                    where: { id: line.pickingTaskId },
                })
                if (pickTask?.allocationLineId) {
                    await this.allocationEngine.recordIssue(
                        pickTask.allocationLineId,
                        new Decimal(line.quantity),
                    )
                } else if (reservationId) {
                    await this.reservations.fulfill(reservationId, line.quantity)
                }
            } else if (doc.reservationHeaderId) {
                const rLine = await this.findReservationLineForIssue(
                    doc.reservationHeaderId,
                    line.materialId,
                )
                if (rLine) {
                    await this.reservationEngine.recordIssue(
                        rLine.id,
                        new Decimal(line.quantity),
                    )
                }
            } else if (reservationId) {
                await this.reservations.fulfill(reservationId, line.quantity)
            }

            if (txn?.id) lineTxnIds.push(txn.id)
        }

        const updated = await this.prisma.mmGoodsIssue.update({
            where: { id },
            data: { status: 'POSTED' },
            include: { lines: true },
        })

        const sdLines = await this.buildSdIssueLines(doc)
        const integrationLines = sdLines.length
            ? sdLines
            : await this.buildProductionIssueLines(doc)
        const enrichedLines = integrationLines.length
            ? integrationLines
            : doc.lines.map((l) => ({
                  materialId: l.materialId,
                  quantity: Number(l.quantity),
                  unitCost: Number(l.unitCost),
                  totalCost: Number(l.totalCost),
              }))

        // FICO: emit COGS/expense accounting event — do not hardcode GL accounts
        const payload = {
            sourceModule: 'STOCK_OPS',
            documentType: 'GOODS_ISSUE',
            documentId: doc.id,
            companyId: doc.companyId,
            postingDate: doc.postingDate.toISOString(),
            warehouseId: doc.warehouseId,
            issuePurpose: doc.issuePurpose,
            salesOrderId:
                doc.sourceDocumentType === 'SALES_ORDER'
                    ? doc.sourceDocumentId
                    : undefined,
            productionOrderId:
                doc.sourceDocumentType === 'PRODUCTION_ORDER'
                    ? doc.sourceDocumentId
                    : undefined,
            reservationHeaderId: doc.reservationHeaderId ?? undefined,
            lines: enrichedLines,
        }
        this.events.emit('goods-issue.posted', { goodsIssueId: doc.id })
        void this.domainEvents.goodsIssuePosted({
            companyId: doc.companyId,
            goodsIssueId: doc.id,
            payload: {
                ...payload,
                lines: enrichedLines.map((l) => ({
                    ...l,
                    warehouseId: doc.warehouseId,
                    movementType: 'ISSUE',
                })),
            },
            plantId: doc.warehouse?.plantId ?? null,
            documentReferences: this.buildIssueDocumentReferences(
                doc,
                lineTxnIds,
            ),
        })

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

        await this.periodGuard.assertCanPost(doc.companyId, doc.postingDate)

        void this.domainEvents.goodsIssueReversed({
            companyId: doc.companyId,
            goodsIssueId: doc.id,
            plantId: doc.warehouse?.plantId ?? null,
            payload: {
                sourceModule: 'STOCK_OPS',
                documentType: 'GOODS_ISSUE',
                documentId: doc.id,
                companyId: doc.companyId,
                postingDate: doc.postingDate.toISOString(),
                warehouseId: doc.warehouseId,
                issuePurpose: doc.issuePurpose,
                lines: doc.lines.map((l) => ({
                    materialId: l.materialId,
                    warehouseId: doc.warehouseId,
                    movementType: 'ISSUE_REVERSAL',
                    quantity: Number(l.quantity),
                    unitCost: Number(l.unitCost),
                    totalCost: Number(l.totalCost),
                })),
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

    private assertSalesIssueContract(dto: CreateGoodsIssueDto) {
        const salesPath =
            dto.issuePurpose === 'SALES' || dto.sourceDocumentType === 'SALES_ORDER'
        if (!salesPath) return
        if (dto.issuePurpose !== 'SALES') {
            throw new BadRequestException(
                'Sales goods issue requires issuePurpose=SALES',
            )
        }
        if (dto.sourceDocumentType !== 'SALES_ORDER' || !dto.sourceDocumentId) {
            throw new BadRequestException(
                'Sales goods issue requires sourceDocumentType=SALES_ORDER and sourceDocumentId',
            )
        }
    }

    private assertProductionIssueContract(dto: CreateGoodsIssueDto) {
        const productionPath =
            dto.issuePurpose === 'PRODUCTION' ||
            dto.sourceDocumentType === 'PRODUCTION_ORDER'
        if (!productionPath) return
        if (dto.issuePurpose !== 'PRODUCTION') {
            throw new BadRequestException(
                'Production goods issue requires issuePurpose=PRODUCTION',
            )
        }
        if (
            dto.sourceDocumentType !== 'PRODUCTION_ORDER' ||
            !dto.sourceDocumentId
        ) {
            throw new BadRequestException(
                'Production goods issue requires sourceDocumentType=PRODUCTION_ORDER and sourceDocumentId',
            )
        }
    }

    private buildIssueDocumentReferences(
        doc: Awaited<ReturnType<typeof this.findOneOrFail>>,
        lineTxnIds: string[],
    ) {
        if (!doc.sourceDocumentId) return undefined
        if (
            doc.sourceDocumentType !== 'SALES_ORDER' &&
            doc.sourceDocumentType !== 'PRODUCTION_ORDER'
        ) {
            return undefined
        }
        return [
            {
                entityType: doc.sourceDocumentType,
                entityId: doc.sourceDocumentId,
            },
            ...(doc.reservationHeaderId
                ? [
                      {
                          entityType: 'RESERVATION',
                          entityId: doc.reservationHeaderId,
                      },
                  ]
                : []),
            {
                entityType: 'GOODS_ISSUE',
                entityId: doc.id,
            },
            ...lineTxnIds.map((txnId) => ({
                entityType: 'INVENTORY_TRANSACTION',
                entityId: txnId,
            })),
        ]
    }

    private async validateReservationHeader(reservationHeaderId: string) {
        const header = await this.prisma.mmInventoryReservationHeader.findUnique({
            where: { id: reservationHeaderId },
            include: { lines: true },
        })
        if (!header) throw new NotFoundException('Reservation header not found')
        return header
    }

    private async resolveLinesFromReservationHeader(dto: CreateGoodsIssueDto) {
        if (!dto.reservationHeaderId) return dto.lines

        const header = await this.validateReservationHeader(dto.reservationHeaderId)
        const legacyByLineId = new Map<string, string>()
        const legacyRows = await this.prisma.mmInventoryReservation.findMany({
            where: { reservationHeaderId: dto.reservationHeaderId },
        })
        for (const legacy of legacyRows) {
            if (legacy.reservationLineId) {
                legacyByLineId.set(legacy.reservationLineId, legacy.id)
            }
        }

        return dto.lines.map((line) => {
            const rLine = header.lines.find((l) => l.materialId === line.materialId)
            const reservationId =
                line.reservationId ??
                dto.reservationId ??
                (rLine ? legacyByLineId.get(rLine.id) : undefined)
            return { ...line, reservationId }
        })
    }

    private async findReservationLineForIssue(
        reservationHeaderId: string,
        materialId: string,
    ) {
        return this.prisma.mmInventoryReservationLine.findFirst({
            where: { headerId: reservationHeaderId, materialId },
        })
    }

    private async buildSdIssueLines(
        doc: Awaited<ReturnType<typeof this.findOneOrFail>>,
    ) {
        if (doc.sourceDocumentType !== 'SALES_ORDER' || !doc.reservationHeaderId) {
            return []
        }
        return this.buildIntegrationIssueLines(doc)
    }

    private async buildProductionIssueLines(
        doc: Awaited<ReturnType<typeof this.findOneOrFail>>,
    ) {
        if (
            doc.sourceDocumentType !== 'PRODUCTION_ORDER' ||
            !doc.reservationHeaderId
        ) {
            return []
        }
        return this.buildIntegrationIssueLines(doc)
    }

    private async buildIntegrationIssueLines(
        doc: Awaited<ReturnType<typeof this.findOneOrFail>>,
    ) {
        const header = await this.prisma.mmInventoryReservationHeader.findUnique({
            where: { id: doc.reservationHeaderId! },
            include: { lines: true },
        })
        if (!header) return []

        return doc.lines.map((l) => {
            const rLine = header.lines.find((rl) => rl.materialId === l.materialId)
            return {
                materialId: l.materialId,
                quantity: Number(l.quantity),
                unitCost: Number(l.unitCost),
                totalCost: Number(l.totalCost),
                demandReferenceLineId: rLine?.demandReferenceLineId ?? undefined,
                lineId: rLine?.demandReferenceLineId ?? undefined,
            }
        })
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
