import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    CreateCountPlanDto,
    CountPlanQueryDto,
    GenerateCountPlanDto,
} from './dto/count-engine.dto'
import { CountGenerationService } from './count-generation.service'
import { CountSessionService } from './count-session.service'
import {
    toLegacyCountStatus,
    toLegacyCountType,
} from './count-engine.constants'

@Injectable()
export class CountPlanService {
    constructor(
        private prisma: PrismaService,
        private generation: CountGenerationService,
        @Inject(forwardRef(() => CountSessionService))
        private sessions: CountSessionService,
    ) {}

    private readonly includes = {
        warehouse: true,
        company: true,
        policy: true,
        sessions: { include: { _count: { select: { tasks: true } } } },
    }

    async findAll(query: CountPlanQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const where: Record<string, unknown> = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.status) where.status = query.status
        if (query.countType) where.countType = query.countType
        if (query.search) {
            where.planNumber = { contains: query.search, mode: 'insensitive' }
        }
        const [data, total] = await Promise.all([
            this.prisma.mmCountPlan.findMany({
                where,
                include: this.includes,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmCountPlan.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const plan = await this.prisma.mmCountPlan.findUnique({
            where: { id },
            include: {
                ...this.includes,
                sessions: {
                    include: {
                        tasks: { include: { material: true, storageBin: true } },
                        adjustmentRequests: true,
                    },
                },
            },
        })
        if (!plan) throw new NotFoundException('Count plan not found')
        return plan
    }

    async create(dto: CreateCountPlanDto) {
        let dueDate = dto.dueDate ? new Date(dto.dueDate) : null
        let blindFromPolicy = dto.countType === 'BLIND_COUNT'
        if (dto.policyId) {
            const policy = await this.prisma.mmCountPolicy.findUnique({
                where: { id: dto.policyId },
            })
            if (!policy?.isActive) {
                throw new BadRequestException('Count policy not found or inactive')
            }
            if (!dueDate) {
                dueDate = new Date()
                dueDate.setDate(dueDate.getDate() + policy.frequencyDays)
            }
            if (policy.blindCountRequired) blindFromPolicy = true
        }

        const planNumber = await this.nextPlanNumber(dto.countType)
        const legacyType = toLegacyCountType(dto.countType)
        const legacyNumber = await this.nextLegacyCountNumber(legacyType)

        const legacy = await this.prisma.mmInventoryCount.create({
            data: {
                countNumber: legacyNumber,
                countType: legacyType,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                ruleId: dto.policyId
                    ? (
                          await this.prisma.mmCountPolicy.findUnique({
                              where: { id: dto.policyId },
                          })
                      )?.legacyCountRuleId ?? null
                    : null,
                dueDate,
                createdBy: dto.createdBy ?? null,
                status: 'OPEN',
            },
        })

        const plan = await this.prisma.mmCountPlan.create({
            data: {
                planNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                policyId: dto.policyId ?? null,
                countType: dto.countType,
                status: 'PLANNED',
                dueDate,
                plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null,
                plannedEnd: dto.plannedEnd ? new Date(dto.plannedEnd) : null,
                notes: dto.notes ?? null,
                createdBy: dto.createdBy ?? null,
                legacyInventoryCountId: legacy.id,
            },
            include: this.includes,
        })

        // Auto-open a session shell (tasks filled on generate)
        await this.sessions.create({
            planId: plan.id,
            blindMode: blindFromPolicy,
        })

        return this.findOne(plan.id)
    }

    async generate(planId: string, dto: GenerateCountPlanDto = {}) {
        const plan = await this.findOne(planId)
        if (!['PLANNED', 'OPEN'].includes(plan.status)) {
            throw new BadRequestException(`Cannot generate: plan is ${plan.status}`)
        }
        const session = plan.sessions[0]
        if (!session) throw new BadRequestException('Plan has no session')
        if (session.tasks?.length) {
            throw new BadRequestException('Session already has tasks')
        }

        const { balances, policy } = await this.generation.selectBalances({
            companyId: plan.companyId,
            warehouseId: plan.warehouseId,
            countType: plan.countType,
            policyId: plan.policyId,
            dto,
        })

        let taskNumber = 1
        await this.prisma.mmCountTask.createMany({
            data: balances.map((b) => ({
                sessionId: session.id,
                taskNumber: taskNumber++,
                materialId: b.materialId,
                storageBinId: b.storageBinId,
                batchId: b.batchId,
                serialNumberId: b.serialNumberId,
                uomId: b.material.baseUomId,
                systemQuantity: b.quantity,
                unitCost: b.material.standardCost ?? new Decimal(0),
                assignedCounter: dto.assignedCounter ?? null,
                status: 'PENDING',
            })),
        })

        // Dual-write legacy lines
        if (plan.legacyInventoryCountId) {
            let lineNumber = 1
            await this.prisma.mmInventoryCountLine.createMany({
                data: balances.map((b) => ({
                    countId: plan.legacyInventoryCountId!,
                    lineNumber: lineNumber++,
                    storageBinId: b.storageBinId,
                    materialId: b.materialId,
                    batchId: b.batchId,
                    serialNumberId: b.serialNumberId,
                    systemQuantity: b.quantity,
                    unitCost: b.material.standardCost ?? new Decimal(0),
                    assignedCounter: dto.assignedCounter ?? null,
                    status: 'PENDING',
                })),
            })
        }

        void policy
        await this.prisma.mmCountPlan.update({
            where: { id: planId },
            data: { status: 'OPEN' },
        })
        await this.prisma.mmCountSession.update({
            where: { id: session.id },
            data: {
                status: 'OPEN',
                blindMode:
                    plan.countType === 'BLIND_COUNT' ||
                    session.blindMode ||
                    !!policy?.blindCountRequired,
            },
        })

        return this.findOne(planId)
    }

    async syncLegacyStatus(planId: string, status: string) {
        const plan = await this.prisma.mmCountPlan.findUnique({ where: { id: planId } })
        if (!plan?.legacyInventoryCountId) return
        await this.prisma.mmInventoryCount.update({
            where: { id: plan.legacyInventoryCountId },
            data: { status: toLegacyCountStatus(status) },
        })
        await this.prisma.mmCountPlan.update({
            where: { id: planId },
            data: { status },
        })
    }

    private async nextPlanNumber(countType: string) {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `CPL-${countType.slice(0, 3)}-${today}-`
        const last = await this.prisma.mmCountPlan.findFirst({
            where: { planNumber: { startsWith: pfx } },
            orderBy: { planNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.planNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }

    private async nextLegacyCountNumber(countType: string) {
        const prefix = countType === 'PHYSICAL' ? 'PI-' : 'CC-'
        const last = await this.prisma.mmInventoryCount.findFirst({
            where: { countNumber: { startsWith: prefix } },
            orderBy: { countNumber: 'desc' },
            select: { countNumber: true },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.countNumber.replace(prefix, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${prefix}${String(seq).padStart(6, '0')}`
    }
}
