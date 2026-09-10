import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { AdjustmentService } from '../stock-ops/adjustment.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    CreateInventoryCountDto,
    InventoryCountQueryDto,
    GenerateCountDto,
    BlindCountDto,
    RecountDto,
    ApproveCountDto,
    RejectCountDto,
    CountLineQueryDto,
} from './dto/inventory-control.dto'

const SESSION_INCLUDES = {
    warehouse: true,
    company: true,
    rule: true,
    adjustment: true,
    lines: {
        include: {
            material: true,
            storageBin: true,
        },
        orderBy: { lineNumber: 'asc' as const },
    },
}

@Injectable()
export class InventoryCountService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => AdjustmentService))
        private adjustments: AdjustmentService,
    ) {}

    async findAll(query: InventoryCountQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 20
        const where: any = {}
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.countType) where.countType = query.countType
        if (query.status) where.status = query.status
        if (query.search) {
            where.countNumber = { contains: query.search, mode: 'insensitive' }
        }

        const [data, total] = await Promise.all([
            this.prisma.mmInventoryCount.findMany({
                where,
                include: {
                    warehouse: true,
                    rule: true,
                    _count: { select: { lines: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmInventoryCount.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string, opts?: { blind?: boolean }) {
        const count = await this.prisma.mmInventoryCount.findUnique({
            where: { id },
            include: SESSION_INCLUDES,
        })
        if (!count) throw new NotFoundException('Inventory count not found')
        if (opts?.blind) {
            return {
                ...count,
                lines: count.lines.map((l) => this.toBlindLine(l)),
            }
        }
        return count
    }

    async create(dto: CreateInventoryCountDto) {
        if (dto.countType === 'CYCLE' && !dto.ruleId) {
            throw new BadRequestException('Cycle counts require a count rule')
        }

        let dueDate: Date | null = dto.dueDate ? new Date(dto.dueDate) : null
        if (dto.ruleId) {
            const rule = await this.prisma.mmCountRule.findUnique({
                where: { id: dto.ruleId },
            })
            if (!rule || !rule.isActive) {
                throw new BadRequestException('Count rule not found or inactive')
            }
            if (!dueDate) {
                dueDate = new Date()
                dueDate.setDate(dueDate.getDate() + rule.frequencyDays)
            }
        }

        const countNumber = await this.generateCountNumber(dto.countType)

        return this.prisma.mmInventoryCount.create({
            data: {
                countNumber,
                countType: dto.countType,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                ruleId: dto.ruleId ?? null,
                dueDate,
                createdBy: dto.createdBy ?? null,
                status: 'OPEN',
            },
            include: SESSION_INCLUDES,
        })
    }

    /**
     * Snapshot balances into count lines.
     * CYCLE: filter by rule (ABC / velocity / risk / value / category / type / warehouse).
     * PHYSICAL: unrestricted balances in warehouse (optional bin filter; zeros by default).
     */
    async generate(id: string, dto: GenerateCountDto = {}) {
        const count = await this.findOne(id)
        if (count.status !== 'OPEN') {
            throw new BadRequestException('Can only generate lines for OPEN counts')
        }
        if (count.lines.length > 0) {
            throw new BadRequestException('Count already has lines — cancel and recreate to regenerate')
        }

        const includeZero =
            dto.includeZeroBalances !== undefined
                ? dto.includeZeroBalances
                : count.countType === 'PHYSICAL'

        const balanceWhere: any = {
            companyId: count.companyId,
            warehouseId: count.warehouseId,
            stockStatus: 'UNRESTRICTED',
            quantity: includeZero ? { gte: 0 } : { gt: 0 },
        }
        if (dto.storageBinIds?.length) {
            balanceWhere.storageBinId = { in: dto.storageBinIds }
        }

        if (count.countType === 'CYCLE' && count.ruleId) {
            const rule = await this.prisma.mmCountRule.findUnique({
                where: { id: count.ruleId },
            })
            if (!rule) throw new BadRequestException('Count rule missing')
            if (rule.warehouseId && rule.warehouseId !== count.warehouseId) {
                throw new BadRequestException(
                    'Count rule warehouse does not match session warehouse',
                )
            }

            const materialWhere: any = {
                deletedAt: null,
                inventoryManaged: true,
                status: 'ACTIVE',
            }
            if (rule.abcClass) materialWhere.abcClass = rule.abcClass
            if (rule.velocityClass) materialWhere.velocityClass = rule.velocityClass
            if (rule.riskClass) materialWhere.riskClass = rule.riskClass
            if (rule.materialCategoryId) {
                materialWhere.materialCategoryId = rule.materialCategoryId
            }
            if (rule.materialTypeId) {
                materialWhere.materialTypeId = rule.materialTypeId
            }
            if (rule.minUnitValue != null || rule.maxUnitValue != null) {
                materialWhere.standardCost = {}
                if (rule.minUnitValue != null) {
                    materialWhere.standardCost.gte = rule.minUnitValue
                }
                if (rule.maxUnitValue != null) {
                    materialWhere.standardCost.lte = rule.maxUnitValue
                }
            }

            const materials = await this.prisma.mmMaterial.findMany({
                where: materialWhere,
                select: { id: true, standardCost: true },
            })
            const materialIds = materials.map((m) => m.id)
            if (materialIds.length === 0) {
                throw new BadRequestException('No materials match the count rule')
            }
            balanceWhere.materialId = { in: materialIds }
        }

        const balances = await this.prisma.mmInventoryBalance.findMany({
            where: balanceWhere,
            include: { material: true },
            orderBy: [{ storageBinId: 'asc' }, { materialId: 'asc' }],
        })

        if (balances.length === 0) {
            throw new BadRequestException('No stock balances found to count')
        }

        // Previous-discrepancy boost: materials with recent non-zero variance get priority line numbers first
        const recentVariance = await this.prisma.mmInventoryCountLine.findMany({
            where: {
                status: 'ADJUSTED',
                varianceQuantity: { not: 0 },
                materialId: { in: balances.map((b) => b.materialId) },
                updatedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            },
            select: { materialId: true },
            distinct: ['materialId'],
        })
        const discrepancySet = new Set(recentVariance.map((r) => r.materialId))
        balances.sort((a, b) => {
            const ad = discrepancySet.has(a.materialId) ? 0 : 1
            const bd = discrepancySet.has(b.materialId) ? 0 : 1
            if (ad !== bd) return ad - bd
            return 0
        })

        let lineNumber = 1
        const linesData = balances.map((b) => ({
            countId: id,
            lineNumber: lineNumber++,
            storageBinId: b.storageBinId,
            materialId: b.materialId,
            batchId: b.batchId,
            serialNumberId: b.serialNumberId,
            systemQuantity: b.quantity,
            unitCost: b.material.standardCost ?? new Decimal(0),
            assignedCounter: dto.assignedCounter ?? null,
            status: 'PENDING',
        }))

        await this.prisma.mmInventoryCountLine.createMany({ data: linesData })

        return this.findOne(id)
    }

    async start(id: string) {
        const count = await this.findOne(id)
        if (count.status !== 'OPEN') {
            throw new BadRequestException('Only OPEN counts can be started')
        }
        if (count.lines.length === 0) {
            throw new BadRequestException('Generate count lines before starting')
        }
        return this.prisma.mmInventoryCount.update({
            where: { id },
            data: { status: 'COUNTING' },
            include: SESSION_INCLUDES,
        })
    }

    /** Blind count — response never includes systemQuantity */
    async blindCount(lineId: string, dto: BlindCountDto) {
        const line = await this.prisma.mmInventoryCountLine.findUnique({
            where: { id: lineId },
            include: { count: true },
        })
        if (!line) throw new NotFoundException('Count line not found')
        if (!['COUNTING', 'RECOUNT'].includes(line.count.status)) {
            throw new BadRequestException(
                `Cannot count while session is ${line.count.status}`,
            )
        }
        if (!['PENDING', 'COUNTED'].includes(line.status)) {
            throw new BadRequestException(`Line status ${line.status} cannot accept blind count`)
        }

        if (dto.idempotencyKey) {
            const dup = await this.prisma.mmInventoryCountLine.findFirst({
                where: { lastIdempotencyKey: dto.idempotencyKey },
            })
            if (dup) {
                if (dup.id === lineId) return this.toBlindLine(dup)
                throw new BadRequestException('Duplicate idempotency key')
            }
        }

        const updated = await this.prisma.mmInventoryCountLine.update({
            where: { id: lineId },
            data: {
                countedQuantity: new Decimal(dto.countedQuantity),
                originalCount: new Decimal(dto.countedQuantity),
                status: 'COUNTED',
                countedBy: dto.countedBy ?? null,
                countedAt: new Date(),
                lastIdempotencyKey: dto.idempotencyKey ?? line.lastIdempotencyKey,
            },
            include: { material: true, storageBin: true },
        })

        return this.toBlindLine(updated)
    }

    async computeVariances(countId: string) {
        const count = await this.findOne(countId)
        if (!['COUNTING', 'RECOUNT'].includes(count.status)) {
            throw new BadRequestException(
                `Cannot compute variances in status ${count.status}`,
            )
        }

        const qtyTol = count.rule
            ? new Decimal(count.rule.varianceQtyTolerance)
            : new Decimal(0)
        const valTol = count.rule
            ? new Decimal(count.rule.varianceValueTolerance)
            : new Decimal(0)

        let requireRecount = false
        let pending = 0

        for (const line of count.lines) {
            if (line.status === 'PENDING') {
                pending += 1
                continue
            }

            const physical =
                line.status === 'RECOUNTED' || line.recountQuantity != null
                    ? new Decimal(line.recountQuantity ?? line.countedQuantity ?? 0)
                    : new Decimal(line.countedQuantity ?? 0)

            const system = new Decimal(line.systemQuantity)
            const varianceQty = physical.minus(system)
            const varianceValue = varianceQty.abs().mul(line.unitCost)

            const overTol =
                varianceQty.abs().gt(qtyTol) ||
                (valTol.gt(0) && varianceValue.gt(valTol))

            let newStatus = line.status
            if (overTol && line.status === 'COUNTED') {
                newStatus = 'REQUIRE_RECOUNT'
                requireRecount = true
            } else if (
                line.status === 'RECOUNTED' ||
                (line.status === 'COUNTED' && !overTol)
            ) {
                // ready for approval path — keep RECOUNTED or COUNTED
                newStatus = line.status === 'RECOUNTED' ? 'RECOUNTED' : 'COUNTED'
            } else if (line.status === 'REQUIRE_RECOUNT') {
                requireRecount = true
            }

            await this.prisma.mmInventoryCountLine.update({
                where: { id: line.id },
                data: {
                    finalQuantity: physical,
                    varianceQuantity: varianceQty,
                    varianceValue,
                    status: newStatus,
                },
            })
        }

        if (pending > 0) {
            throw new BadRequestException(
                `${pending} line(s) still PENDING — complete blind counts first`,
            )
        }

        const nextStatus = requireRecount ? 'RECOUNT' : 'APPROVAL'
        return this.prisma.mmInventoryCount.update({
            where: { id: countId },
            data: { status: nextStatus },
            include: SESSION_INCLUDES,
        })
    }

    async recount(lineId: string, dto: RecountDto) {
        const line = await this.prisma.mmInventoryCountLine.findUnique({
            where: { id: lineId },
            include: { count: true, material: true, storageBin: true },
        })
        if (!line) throw new NotFoundException('Count line not found')
        if (line.status !== 'REQUIRE_RECOUNT') {
            throw new BadRequestException('Line is not marked REQUIRE_RECOUNT')
        }
        if (line.count.status !== 'RECOUNT' && line.count.status !== 'COUNTING') {
            throw new BadRequestException(
                `Cannot recount while session is ${line.count.status}`,
            )
        }

        const physical = new Decimal(dto.recountQuantity)
        const system = new Decimal(line.systemQuantity)
        const varianceQty = physical.minus(system)
        const varianceValue = varianceQty.abs().mul(line.unitCost)

        return this.prisma.mmInventoryCountLine.update({
            where: { id: lineId },
            data: {
                recountQuantity: physical,
                finalQuantity: physical,
                varianceQuantity: varianceQty,
                varianceValue,
                status: 'RECOUNTED',
                recountBy: dto.recountBy ?? null,
                recountedAt: new Date(),
            },
            include: { material: true, storageBin: true },
        })
    }

    async submitApproval(countId: string) {
        const count = await this.findOne(countId)
        const openRecount = count.lines.filter((l) => l.status === 'REQUIRE_RECOUNT')
        if (openRecount.length > 0) {
            throw new BadRequestException(
                `${openRecount.length} line(s) still require recount`,
            )
        }
        const incomplete = count.lines.filter((l) =>
            ['PENDING'].includes(l.status),
        )
        if (incomplete.length > 0) {
            throw new BadRequestException('All lines must be counted before approval')
        }

        // Recompute variances for recount lines
        for (const line of count.lines) {
            if (['COUNTED', 'RECOUNTED'].includes(line.status)) {
                const physical = new Decimal(
                    line.recountQuantity ?? line.countedQuantity ?? 0,
                )
                const varianceQty = physical.minus(line.systemQuantity)
                await this.prisma.mmInventoryCountLine.update({
                    where: { id: line.id },
                    data: {
                        finalQuantity: physical,
                        varianceQuantity: varianceQty,
                        varianceValue: varianceQty.abs().mul(line.unitCost),
                    },
                })
            }
        }

        return this.prisma.mmInventoryCount.update({
            where: { id: countId },
            data: { status: 'APPROVAL' },
            include: SESSION_INCLUDES,
        })
    }

    async approve(countId: string, dto: ApproveCountDto) {
        const count = await this.findOne(countId)
        if (count.status !== 'APPROVAL') {
            throw new BadRequestException(
                `Cannot approve count in status ${count.status}`,
            )
        }

        const now = new Date()
        for (const line of count.lines) {
            await this.prisma.mmInventoryCountLine.update({
                where: { id: line.id },
                data: {
                    status: 'APPROVED',
                    approvedBy: dto.approvedBy ?? null,
                    approvedAt: now,
                    finalQuantity: new Decimal(
                        line.finalQuantity ??
                            line.recountQuantity ??
                            line.countedQuantity ??
                            line.systemQuantity,
                    ),
                },
            })
        }

        return this.findOne(countId)
    }

    async reject(countId: string, dto: RejectCountDto) {
        const count = await this.findOne(countId)
        if (count.status !== 'APPROVAL') {
            throw new BadRequestException(
                `Cannot reject count in status ${count.status}`,
            )
        }

        for (const line of count.lines) {
            await this.prisma.mmInventoryCountLine.update({
                where: { id: line.id },
                data: { status: 'REJECTED' },
            })
        }

        return this.prisma.mmInventoryCount.update({
            where: { id: countId },
            data: { status: 'CLOSED' },
            include: SESSION_INCLUDES,
        })
    }

    /**
     * Create linked adjustment and post COUNT_GAIN / COUNT_LOSS for non-zero variances.
     * Call after approve() (lines must be APPROVED).
     */
    async postAdjustments(countId: string, dto: ApproveCountDto = {}) {
        let session = await this.findOne(countId)

        if (session.status === 'APPROVAL') {
            const needsApprove = session.lines.some((l) =>
                ['COUNTED', 'RECOUNTED'].includes(l.status),
            )
            if (needsApprove) {
                await this.approve(countId, dto)
                session = await this.findOne(countId)
            }
        }

        const approved = session.lines.filter((l) => l.status === 'APPROVED')
        if (approved.length === 0 && session.status !== 'APPROVAL') {
            // maybe already posted
            if (session.status === 'POSTED' || session.status === 'CLOSED') {
                return session
            }
        }

        if (session.lines.some((l) => !['APPROVED', 'ADJUSTED'].includes(l.status))) {
            if (session.status === 'APPROVAL') {
                await this.approve(countId, dto)
                session = await this.findOne(countId)
            } else {
                throw new BadRequestException(
                    'Approve the count before posting adjustments',
                )
            }
        }

        session = await this.findOne(countId)

        if (session.adjustment) {
            throw new BadRequestException('Adjustment already created for this count')
        }

        const varianceLines = session.lines.filter(
            (l) => !new Decimal(l.varianceQuantity).isZero(),
        )

        if (varianceLines.length === 0) {
            for (const l of session.lines) {
                await this.prisma.mmInventoryCountLine.update({
                    where: { id: l.id },
                    data: { status: 'ADJUSTED', finalAdjustmentQty: 0 },
                })
            }
            return this.prisma.mmInventoryCount.update({
                where: { id: countId },
                data: { status: 'CLOSED' },
                include: SESSION_INCLUDES,
            })
        }

        const reason = dto.adjustmentReason ?? 'COUNT_VARIANCE'
        const threshold = dto.approvalThreshold ?? 10000

        const materialIds = [...new Set(varianceLines.map((l) => l.materialId))]
        const materials = await this.prisma.mmMaterial.findMany({
            where: { id: { in: materialIds } },
            select: { id: true, baseUomId: true },
        })
        const uomByMaterial = new Map(materials.map((m) => [m.id, m.baseUomId]))

        const adj = await this.adjustments.create({
            companyId: session.companyId,
            warehouseId: session.warehouseId,
            sourceCountId: session.id,
            postingDate: new Date().toISOString(),
            adjustmentReason: reason,
            justification: `Inventory count ${session.countNumber}`,
            approvalThreshold: threshold,
            createdBy: dto.approvedBy ?? session.createdBy ?? undefined,
            lines: varianceLines.map((l) => ({
                materialId: l.materialId,
                quantity: Number(l.varianceQuantity),
                uomId: uomByMaterial.get(l.materialId)!,
                storageBinId: l.storageBinId ?? undefined,
                batchId: l.batchId ?? undefined,
                serialNumberId: l.serialNumberId ?? undefined,
                unitCost: Number(l.unitCost),
                remarks: `Count line ${l.lineNumber}`,
            })),
        })

        const submitted = await this.adjustments.submit(adj.id)

        if (submitted.status === 'POSTED') {
            for (const l of session.lines) {
                await this.prisma.mmInventoryCountLine.update({
                    where: { id: l.id },
                    data: {
                        status: 'ADJUSTED',
                        finalAdjustmentQty: l.varianceQuantity,
                    },
                })
            }
            return this.prisma.mmInventoryCount.update({
                where: { id: countId },
                data: { status: 'POSTED' },
                include: SESSION_INCLUDES,
            })
        }

        // PENDING_APPROVAL — session stays APPROVAL until adjustment is approved
        return this.findOne(countId)
    }

    async close(countId: string) {
        const count = await this.findOne(countId)
        if (count.status !== 'POSTED') {
            throw new BadRequestException('Only POSTED counts can be closed')
        }
        return this.prisma.mmInventoryCount.update({
            where: { id: countId },
            data: { status: 'CLOSED' },
            include: SESSION_INCLUDES,
        })
    }

    async listLines(query: CountLineQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.countId) where.countId = query.countId
        if (query.status) where.status = query.status
        if (query.assignedCounter) where.assignedCounter = query.assignedCounter
        if (query.warehouseId) {
            where.count = { warehouseId: query.warehouseId }
        }

        const [rows, total] = await Promise.all([
            this.prisma.mmInventoryCountLine.findMany({
                where,
                include: {
                    material: true,
                    storageBin: true,
                    count: { include: { warehouse: true } },
                },
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmInventoryCountLine.count({ where }),
        ])

        const data = query.blind ? rows.map((l) => this.toBlindLine(l)) : rows

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    private toBlindLine(line: any) {
        const {
            systemQuantity: _s,
            varianceQuantity: _v,
            varianceValue: _vv,
            ...rest
        } = line
        return rest
    }

    private async generateCountNumber(countType: string): Promise<string> {
        const prefix = countType === 'PHYSICAL' ? 'PI-' : 'CC-'
        const last = await this.prisma.mmInventoryCount.findFirst({
            where: { countNumber: { startsWith: prefix } },
            orderBy: { countNumber: 'desc' },
            select: { countNumber: true },
        })
        let seq = 1
        if (last) {
            const num = parseInt(last.countNumber.replace(prefix, ''), 10)
            if (!isNaN(num)) seq = num + 1
        }
        return `${prefix}${String(seq).padStart(6, '0')}`
    }
}
