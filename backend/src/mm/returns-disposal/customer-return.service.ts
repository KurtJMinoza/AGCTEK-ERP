import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { postingKey } from '../common/idempotency.util'
import { ReturnsDisposalConfigService } from './returns-disposal-config.service'
import { DisposalService } from './disposal.service'
import {
    CreateCustomerReturnDto,
    UpdateCustomerReturnDto,
    CustomerReturnQueryDto,
    SetDispositionDto,
    ActionDto,
} from './dto/returns-disposal.dto'
import { Decimal } from '@prisma/client/runtime/library'

const LINE_INCLUDE = { material: true }

const DETAIL_INCLUDE = {
    lines: { include: LINE_INCLUDE },
    warehouse: true,
    audits: { orderBy: { performedAt: 'desc' as const } },
}

const DISPOSITION_STOCK: Record<string, string> = {
    RESTOCK: 'UNRESTRICTED',
    REPAIR: 'QUALITY_INSPECTION',
    BLOCK: 'BLOCKED',
    SCRAP: 'BLOCKED',
}

@Injectable()
export class CustomerReturnService {
    constructor(
        private prisma: PrismaService,
        private postingService: InventoryPostingService,
        private configService: ReturnsDisposalConfigService,
        @Inject(forwardRef(() => DisposalService))
        private disposalService: DisposalService,
        private events: EventEmitter2,
    ) {}

    async create(dto: CreateCustomerReturnDto) {
        await this.assertLineTracking(dto.lines)

        const returnNumber = await this.generateDocNumber('CRT')
        const lines = dto.lines.map((l, i) => ({
            lineNumber: i + 1,
            materialId: l.materialId,
            uomId: l.uomId,
            batchId: l.batchId ?? null,
            serialNumberId: l.serialNumberId ?? null,
            storageBinId: l.storageBinId ?? null,
            quantity: new Decimal(l.quantity),
            unitCost: new Decimal(l.unitCost ?? 0),
            disposition: l.disposition ?? null,
            dispositionStatus: 'PENDING',
            remarks: l.remarks ?? null,
        }))

        const estimatedValue = lines.reduce(
            (s, l) => s.plus(l.quantity.mul(l.unitCost)),
            new Decimal(0),
        )
        const totalQuantity = lines.reduce(
            (s, l) => s.plus(l.quantity),
            new Decimal(0),
        )

        const doc = await this.prisma.mmCustomerReturn.create({
            data: {
                returnNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                customerRef: dto.customerRef ?? null,
                customerName: dto.customerName ?? null,
                reason: dto.reason ?? null,
                remarks: dto.remarks ?? null,
                status: 'DRAFT',
                estimatedValue,
                totalQuantity,
                createdBy: dto.createdBy ?? null,
                lines: { create: lines },
            },
            include: DETAIL_INCLUDE,
        })

        await this.audit(doc.id, 'CREATED', undefined, undefined, undefined, dto.createdBy)
        return doc
    }

    async update(id: string, dto: UpdateCustomerReturnDto) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot update: status is ${doc.status}`)
        }

        const data: any = {}
        if (dto.customerRef !== undefined) data.customerRef = dto.customerRef
        if (dto.customerName !== undefined) data.customerName = dto.customerName
        if (dto.reason !== undefined) data.reason = dto.reason
        if (dto.remarks !== undefined) data.remarks = dto.remarks

        if (dto.lines) {
            await this.assertLineTracking(dto.lines)
            await this.prisma.mmCustomerReturnLine.deleteMany({
                where: { returnId: id },
            })
            const newLines = dto.lines.map((l, i) => ({
                returnId: id,
                lineNumber: i + 1,
                materialId: l.materialId,
                uomId: l.uomId,
                batchId: l.batchId ?? null,
                serialNumberId: l.serialNumberId ?? null,
                storageBinId: l.storageBinId ?? null,
                quantity: new Decimal(l.quantity),
                unitCost: new Decimal(l.unitCost ?? 0),
                disposition: l.disposition ?? null,
                dispositionStatus: 'PENDING',
                remarks: l.remarks ?? null,
            }))
            await this.prisma.mmCustomerReturnLine.createMany({ data: newLines })
            data.estimatedValue = newLines.reduce(
                (s, l) => s.plus(l.quantity.mul(l.unitCost)),
                new Decimal(0),
            )
            data.totalQuantity = newLines.reduce(
                (s, l) => s.plus(l.quantity),
                new Decimal(0),
            )
        }

        return this.prisma.mmCustomerReturn.update({
            where: { id },
            data,
            include: DETAIL_INCLUDE,
        })
    }

    async startIntake(id: string, actor?: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot start intake: status is ${doc.status}`)
        }
        const updated = await this.prisma.mmCustomerReturn.update({
            where: { id },
            data: { status: 'INTAKE' },
            include: DETAIL_INCLUDE,
        })
        await this.prisma.mmCustomerReturnIntake.upsert({
            where: { legacyCustomerReturnId: id },
            create: {
                legacyCustomerReturnId: id,
                companyId: doc.companyId,
                warehouseId: doc.warehouseId,
                receivedBy: actor ?? null,
            },
            update: {
                receivedBy: actor ?? null,
                receivedAt: new Date(),
            },
        })
        await this.audit(id, 'INTAKE', 'status', 'DRAFT', 'INTAKE', actor)
        return updated
    }

    async startInspection(id: string, actor?: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'INTAKE') {
            throw new BadRequestException(
                `Cannot start inspection: status is ${doc.status}`,
            )
        }
        const updated = await this.prisma.mmCustomerReturn.update({
            where: { id },
            data: { status: 'INSPECTION' },
            include: DETAIL_INCLUDE,
        })
        await this.prisma.mmReturnInspection.create({
            data: {
                legacyCustomerReturnId: id,
                inspectedBy: actor ?? null,
                result: null,
            },
        })
        await this.audit(id, 'INSPECTION', 'status', 'INTAKE', 'INSPECTION', actor)
        return updated
    }

    /** Canonical inspect: create/update MmReturnInspection notes/result. */
    async inspect(
        id: string,
        dto?: ActionDto & { result?: string; lotNotes?: string; decisionNotes?: string },
    ) {
        const doc = await this.findOneOrFail(id)
        if (!['INTAKE', 'INSPECTION'].includes(doc.status)) {
            throw new BadRequestException(`Cannot inspect: status is ${doc.status}`)
        }
        if (doc.status === 'INTAKE') {
            await this.startInspection(id, dto?.performedBy)
        }
        const latest = await this.prisma.mmReturnInspection.findFirst({
            where: { legacyCustomerReturnId: id },
            orderBy: { createdAt: 'desc' },
        })
        if (latest) {
            await this.prisma.mmReturnInspection.update({
                where: { id: latest.id },
                data: {
                    inspectedBy: dto?.performedBy ?? latest.inspectedBy,
                    inspectedAt: new Date(),
                    result: dto?.result ?? latest.result,
                    lotNotes: dto?.lotNotes ?? latest.lotNotes,
                    decisionNotes: dto?.decisionNotes ?? latest.decisionNotes,
                },
            })
        } else {
            await this.prisma.mmReturnInspection.create({
                data: {
                    legacyCustomerReturnId: id,
                    inspectedBy: dto?.performedBy ?? null,
                    result: dto?.result ?? null,
                    lotNotes: dto?.lotNotes ?? null,
                    decisionNotes: dto?.decisionNotes ?? null,
                },
            })
        }
        return this.findOneOrFail(id)
    }

    async setDisposition(lineId: string, dto: SetDispositionDto) {
        const line = await this.prisma.mmCustomerReturnLine.findUnique({
            where: { id: lineId },
            include: { customerReturn: true },
        })
        if (!line) throw new NotFoundException('Customer return line not found')
        if (!['INSPECTION', 'APPROVED', 'PENDING_APPROVAL'].includes(line.customerReturn.status)) {
            throw new BadRequestException(
                `Cannot set disposition while return is ${line.customerReturn.status}`,
            )
        }
        if (line.dispositionStatus === 'POSTED' || line.dispositionStatus === 'LINKED_DISPOSAL') {
            throw new BadRequestException('Disposition already posted')
        }

        const stockStatus = DISPOSITION_STOCK[dto.disposition] ?? null
        const updated = await this.prisma.mmCustomerReturnLine.update({
            where: { id: lineId },
            data: { disposition: dto.disposition },
            include: { material: true, customerReturn: true },
        })

        const existing = await this.prisma.mmReturnDisposition.findFirst({
            where: {
                legacyCustomerReturnId: line.returnId,
                customerReturnLineId: lineId,
            },
        })
        if (existing) {
            await this.prisma.mmReturnDisposition.update({
                where: { id: existing.id },
                data: {
                    disposition: dto.disposition,
                    stockStatus,
                    quantity: line.quantity,
                },
            })
        } else {
            await this.prisma.mmReturnDisposition.create({
                data: {
                    legacyCustomerReturnId: line.returnId,
                    customerReturnLineId: lineId,
                    lineNumber: line.lineNumber,
                    materialId: line.materialId,
                    quantity: line.quantity,
                    uomId: line.uomId,
                    batchId: line.batchId,
                    serialNumberId: line.serialNumberId,
                    disposition: dto.disposition,
                    stockStatus,
                    remarks: dto.performedBy ? `by ${dto.performedBy}` : null,
                },
            })
        }

        await this.audit(
            line.returnId,
            'DISPOSITION_SET',
            'disposition',
            line.disposition,
            dto.disposition,
            dto.performedBy,
            { lineId },
        )
        return updated
    }

    /** Canonical disposition: set dispositions for all provided lines. */
    async disposition(
        id: string,
        dto: { lines: Array<{ lineId: string; disposition: string }>; performedBy?: string },
    ) {
        const results = []
        for (const line of dto.lines ?? []) {
            results.push(
                await this.setDisposition(line.lineId, {
                    disposition: line.disposition as any,
                    performedBy: dto.performedBy,
                }),
            )
        }
        return { returnId: id, lines: results }
    }

    async submit(id: string, actor?: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'INSPECTION') {
            throw new BadRequestException(`Cannot submit: status is ${doc.status}`)
        }
        if (doc.lines.some((l) => !l.disposition)) {
            throw new BadRequestException('All lines require a disposition before submit')
        }

        const thresholds = await this.configService.getThresholds(doc.companyId)
        const needsApproval = this.configService.needsApproval(
            Number(doc.estimatedValue),
            Number(doc.totalQuantity),
            thresholds,
        )
        const newStatus = needsApproval ? 'PENDING_APPROVAL' : 'APPROVED'
        const updated = await this.prisma.mmCustomerReturn.update({
            where: { id },
            data: {
                status: newStatus,
                submittedBy: actor ?? null,
                submittedAt: new Date(),
                approvalThresholdSnapshot: new Decimal(thresholds.amountThreshold),
                ...(newStatus === 'APPROVED' && { approvedAt: new Date() }),
            },
            include: DETAIL_INCLUDE,
        })
        await this.audit(id, 'SUBMITTED', 'status', 'INSPECTION', newStatus, actor)
        return updated
    }

    async approve(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot approve: status is ${doc.status}`)
        }
        const updated = await this.prisma.mmCustomerReturn.update({
            where: { id },
            data: {
                status: 'APPROVED',
                approvedBy: dto?.performedBy ?? null,
                approvedAt: new Date(),
            },
            include: DETAIL_INCLUDE,
        })
        await this.audit(
            id,
            'APPROVED',
            'status',
            'PENDING_APPROVAL',
            'APPROVED',
            dto?.performedBy,
        )
        return updated
    }

    async reject(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot reject: status is ${doc.status}`)
        }
        const updated = await this.prisma.mmCustomerReturn.update({
            where: { id },
            data: {
                status: 'CANCELLED',
                rejectedBy: dto?.performedBy ?? null,
                rejectedAt: new Date(),
            },
            include: DETAIL_INCLUDE,
        })
        await this.audit(
            id,
            'REJECTED',
            'status',
            'PENDING_APPROVAL',
            'CANCELLED',
            dto?.performedBy,
            { reason: dto?.reason },
        )
        return updated
    }

    /**
     * Post dispositions: RESTOCK/REPAIR/BLOCK via RETURN_IN;
     * SCRAP → RETURN_IN BLOCKED + linked MmDisposal (submit; post if auto-approved).
     */
    async complete(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'APPROVED') {
            throw new BadRequestException(`Cannot complete: status is ${doc.status}`)
        }
        if (doc.lines.some((l) => !l.disposition)) {
            throw new BadRequestException('All lines need dispositions')
        }

        const claimed = await this.prisma.mmCustomerReturn.updateMany({
            where: { id, status: 'APPROVED' },
            data: {
                status: 'COMPLETED',
                completedBy: dto?.performedBy ?? null,
                completedAt: new Date(),
                closedAt: new Date(),
            },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Duplicate customer return posting blocked')
        }

        const now = new Date().toISOString()

        for (const line of doc.lines) {
            if (line.dispositionStatus === 'POSTED' || line.dispositionStatus === 'LINKED_DISPOSAL') {
                continue
            }
            const disposition = line.disposition!
            const stockStatus = DISPOSITION_STOCK[disposition]
            if (!stockStatus) {
                throw new BadRequestException(`Unknown disposition ${disposition}`)
            }

            const txn = await this.postingService.postTransaction({
                companyId: doc.companyId,
                warehouseId: doc.warehouseId,
                storageBinId: line.storageBinId ?? undefined,
                materialId: line.materialId,
                batchId: line.batchId ?? undefined,
                serialNumberId: line.serialNumberId ?? undefined,
                stockStatus,
                movementType: 'RETURN_IN',
                quantity: Number(line.quantity),
                uomId: line.uomId,
                unitCost: Number(line.unitCost),
                postingDate: now,
                documentDate: now,
                sourceModule: 'RETURNS_DISPOSAL',
                sourceDocumentType: 'CUSTOMER_RETURN',
                sourceDocumentId: doc.id,
                sourceDocumentLineId: line.id,
                reasonCode: disposition,
                idempotencyKey: postingKey('cust-ret', doc.id, line.id),
                createdBy: dto?.performedBy ?? undefined,
            })

            if (disposition === 'SCRAP') {
                const disposal = await this.disposalService.create({
                    companyId: doc.companyId,
                    warehouseId: doc.warehouseId,
                    disposalType: 'SCRAP',
                    reason: 'QUALITY_FAILURE',
                    remarks: `From customer return ${doc.returnNumber}`,
                    createdBy: dto?.performedBy,
                    lines: [
                        {
                            materialId: line.materialId,
                            uomId: line.uomId,
                            batchId: line.batchId ?? undefined,
                            serialNumberId: line.serialNumberId ?? undefined,
                            storageBinId: line.storageBinId ?? undefined,
                            quantity: Number(line.quantity),
                            unitCost: Number(line.unitCost),
                            reason: 'QUALITY_FAILURE',
                            stockStatus: 'BLOCKED',
                        },
                    ],
                })
                const submitted = await this.disposalService.submit(
                    disposal.id,
                    dto?.performedBy,
                )
                if (submitted.status === 'APPROVED') {
                    await this.disposalService.post(disposal.id, dto)
                }
                await this.prisma.mmCustomerReturnLine.update({
                    where: { id: line.id },
                    data: {
                        inventoryTxnId: txn.id,
                        disposalId: disposal.id,
                        dispositionStatus: 'LINKED_DISPOSAL',
                    },
                })
                await this.prisma.mmReturnDisposition.updateMany({
                    where: { customerReturnLineId: line.id },
                    data: {
                        inventoryTxnId: txn.id,
                        disposalId: disposal.id,
                        stockStatus,
                    },
                })
            } else {
                await this.prisma.mmCustomerReturnLine.update({
                    where: { id: line.id },
                    data: {
                        inventoryTxnId: txn.id,
                        dispositionStatus: 'POSTED',
                    },
                })
                await this.prisma.mmReturnDisposition.updateMany({
                    where: { customerReturnLineId: line.id },
                    data: {
                        inventoryTxnId: txn.id,
                        stockStatus,
                    },
                })
            }
        }

        await this.prisma.mmAccountingEvent.create({
            data: {
                eventType: 'CUSTOMER_RETURN_COMPLETED',
                sourceModule: 'RETURNS_DISPOSAL',
                documentType: 'CUSTOMER_RETURN',
                documentId: doc.id,
                companyId: doc.companyId,
                payload: {
                    returnNumber: doc.returnNumber,
                    lines: doc.lines.map((l) => ({
                        materialId: l.materialId,
                        quantity: Number(l.quantity),
                        disposition: l.disposition,
                    })),
                },
                status: 'PENDING',
            },
        })
        this.events.emit('accounting.entry.requested', {
            sourceModule: 'RETURNS_DISPOSAL',
            documentType: 'CUSTOMER_RETURN',
            documentId: doc.id,
            companyId: doc.companyId,
        })

        const updated = await this.prisma.mmCustomerReturn.update({
            where: { id },
            data: { status: 'CLOSED' },
            include: DETAIL_INCLUDE,
        })
        await this.audit(
            id,
            'COMPLETED',
            'status',
            'APPROVED',
            'CLOSED',
            dto?.performedBy,
        )
        return updated
    }

    async cancel(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (!['DRAFT', 'INTAKE', 'INSPECTION', 'REJECTED'].includes(doc.status)) {
            throw new BadRequestException(`Cannot cancel: status is ${doc.status}`)
        }
        const updated = await this.prisma.mmCustomerReturn.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: DETAIL_INCLUDE,
        })
        await this.audit(id, 'CANCELLED', 'status', doc.status, 'CANCELLED', dto?.performedBy)
        return updated
    }

    async reverse(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (!['COMPLETED', 'CLOSED'].includes(doc.status)) {
            throw new BadRequestException(`Cannot reverse: status is ${doc.status}`)
        }

        const txns = await this.prisma.mmInventoryTransaction.findMany({
            where: {
                sourceDocumentId: id,
                sourceDocumentType: 'CUSTOMER_RETURN',
            },
        })
        for (const txn of txns) {
            await this.postingService.reverseTransaction(txn.id, {
                reasonCode: 'REVERSAL',
                remarks: `Reversal of customer return ${doc.returnNumber}`,
                createdBy: dto?.performedBy,
            })
        }

        await this.prisma.mmAccountingEvent.create({
            data: {
                eventType: 'CUSTOMER_RETURN_REVERSED',
                sourceModule: 'RETURNS_DISPOSAL',
                documentType: 'CUSTOMER_RETURN',
                documentId: doc.id,
                companyId: doc.companyId,
                payload: { returnNumber: doc.returnNumber },
                status: 'PENDING',
            },
        })

        const updated = await this.prisma.mmCustomerReturn.update({
            where: { id },
            data: { status: 'REVERSED' },
            include: DETAIL_INCLUDE,
        })
        await this.audit(
            id,
            'REVERSED',
            'status',
            'COMPLETED',
            'REVERSED',
            dto?.performedBy,
        )
        return updated
    }

    async findAll(query: CustomerReturnQueryDto) {
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.status) where.status = query.status
        if (query.search) {
            where.OR = [
                { returnNumber: { contains: query.search, mode: 'insensitive' } },
                { customerName: { contains: query.search, mode: 'insensitive' } },
                { customerRef: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmCustomerReturn.findMany({
                where,
                include: {
                    warehouse: true,
                    lines: { include: LINE_INCLUDE },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmCustomerReturn.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    private async findOneOrFail(id: string) {
        const doc = await this.prisma.mmCustomerReturn.findUnique({
            where: { id },
            include: DETAIL_INCLUDE,
        })
        if (!doc) throw new NotFoundException('Customer return not found')
        return doc
    }

    private async assertLineTracking(
        lines: Array<{
            materialId: string
            batchId?: string
            serialNumberId?: string
            quantity: number
            unitCost?: number
        }>,
    ) {
        const materials = await this.prisma.mmMaterial.findMany({
            where: { id: { in: lines.map((l) => l.materialId) } },
            select: {
                id: true,
                batchManaged: true,
                serialManaged: true,
            },
        })
        const byId = new Map(materials.map((m) => [m.id, m]))
        for (const l of lines) {
            const m = byId.get(l.materialId)
            if (!m) throw new BadRequestException(`Material ${l.materialId} not found`)
            if (m.batchManaged && !l.batchId) {
                throw new BadRequestException('Batch required for batch-managed material')
            }
            if (m.serialManaged && !l.serialNumberId) {
                throw new BadRequestException('Serial required for serial-managed material')
            }
            if (l.quantity <= 0) {
                throw new BadRequestException('Quantity must be positive')
            }
        }
    }

    private async generateDocNumber(prefix: string) {
        const count = await this.prisma.mmCustomerReturn.count()
        return `${prefix}-${String(count + 1).padStart(6, '0')}`
    }

    private async audit(
        returnId: string,
        action: string,
        field?: string,
        oldValue?: string | null,
        newValue?: string | null,
        performedBy?: string,
        details?: any,
    ) {
        await this.prisma.mmCustomerReturnAudit.create({
            data: {
                returnId,
                action,
                field: field ?? null,
                oldValue: oldValue ?? null,
                newValue: newValue ?? null,
                performedBy: performedBy ?? null,
                details: details ?? undefined,
            },
        })
    }
}
