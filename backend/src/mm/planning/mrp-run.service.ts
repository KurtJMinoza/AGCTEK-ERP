import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MrpEngineService } from './mrp-engine.service'
import { CreateMrpRunDto, MrpRunQueryDto, MaterialRequirementQueryDto } from './dto/planning.dto'

const RUN_INCLUDE = {
    warehouse: { select: { id: true, code: true, name: true } },
    plant: { select: { id: true, code: true, name: true } },
    company: { select: { id: true, name: true } },
    _count: {
        select: {
            requirements: true,
            suggestions: true,
            plannedOrders: true,
        },
    },
}

@Injectable()
export class MrpRunService {
    constructor(
        private prisma: PrismaService,
        private engine: MrpEngineService,
    ) {}

    async findAll(query: MrpRunQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 20
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.plantId) where.plantId = query.plantId
        if (query.status) {
            if (query.status === 'PENDING' || query.status === 'QUEUED') {
                where.status = { in: ['QUEUED', 'PENDING'] }
            } else {
                where.status = query.status
            }
        }

        const [data, total] = await Promise.all([
            this.prisma.mmMrpRun.findMany({
                where,
                include: RUN_INCLUDE,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmMrpRun.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmMrpRun.findUnique({
            where: { id },
            include: {
                ...RUN_INCLUDE,
                requirements: {
                    include: {
                        material: {
                            select: {
                                id: true,
                                materialCode: true,
                                materialName: true,
                            },
                        },
                        warehouse: {
                            select: { id: true, code: true, name: true },
                        },
                    },
                    orderBy: [{ shortage: 'desc' }, { belowReorderPoint: 'desc' }],
                },
                suggestions: {
                    include: {
                        material: {
                            select: {
                                id: true,
                                materialCode: true,
                                materialName: true,
                            },
                        },
                        preferredSupplier: {
                            select: {
                                id: true,
                                supplierCode: true,
                                supplierName: true,
                            },
                        },
                    },
                },
                plannedOrders: true,
                supplyProposals: true,
            },
        })
        if (!row) throw new NotFoundException('MRP run not found')
        return row
    }

    async create(dto: CreateMrpRunDto) {
        const runNumber = await this.generateRunNumber()
        const parametersJson = {
            planningHorizonDays: dto.planningHorizonDays ?? 30,
            includeOpenReceipts: dto.includeOpenReceipts ?? true,
            autoCreatePurchaseRequisitions:
                dto.autoCreatePurchaseRequisitions ?? false,
            plantId: dto.plantId ?? null,
            warehouseId: dto.warehouseId ?? null,
        }
        const run = await this.prisma.mmMrpRun.create({
            data: {
                runNumber,
                companyId: dto.companyId,
                plantId: dto.plantId ?? null,
                warehouseId: dto.warehouseId ?? null,
                planningHorizonDays: dto.planningHorizonDays ?? 30,
                includeOpenReceipts: dto.includeOpenReceipts ?? true,
                autoCreatePurchaseRequisitions:
                    dto.autoCreatePurchaseRequisitions ?? false,
                parametersJson,
                status: 'QUEUED',
                createdBy: dto.createdBy ?? null,
            },
            include: RUN_INCLUDE,
        })

        if (dto.executeImmediately) {
            return this.engine.executeRun(run.id)
        }
        return run
    }

    async execute(id: string) {
        const run = await this.prisma.mmMrpRun.findUnique({ where: { id } })
        if (!run) throw new NotFoundException('MRP run not found')
        if (run.status === 'RUNNING') {
            throw new BadRequestException('MRP run is already executing')
        }
        if (run.status === 'CANCELLED') {
            throw new BadRequestException('Cancelled MRP runs cannot be executed')
        }
        return this.engine.executeRun(id)
    }

    async cancel(id: string) {
        const run = await this.prisma.mmMrpRun.findUnique({ where: { id } })
        if (!run) throw new NotFoundException('MRP run not found')
        if (run.status === 'RUNNING') {
            throw new BadRequestException('Cannot cancel a running MRP run')
        }
        if (run.status === 'COMPLETED') {
            throw new BadRequestException('Cannot cancel a completed MRP run')
        }
        return this.prisma.mmMrpRun.update({
            where: { id },
            data: { status: 'CANCELLED', completedAt: new Date() },
            include: RUN_INCLUDE,
        })
    }

    async listRequirements(query: MaterialRequirementQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.mrpRunId) where.mrpRunId = query.mrpRunId
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId
        if (query.shortage !== undefined) where.shortage = query.shortage
        if (query.belowReorderPoint !== undefined)
            where.belowReorderPoint = query.belowReorderPoint

        if (!query.mrpRunId && query.companyId) {
            const latest = await this.prisma.mmMrpRun.findFirst({
                where: { companyId: query.companyId, status: 'COMPLETED' },
                orderBy: { completedAt: 'desc' },
                select: { id: true },
            })
            if (latest) where.mrpRunId = latest.id
        }

        const [data, total] = await Promise.all([
            this.prisma.mmMaterialRequirement.findMany({
                where,
                include: {
                    material: {
                        select: {
                            id: true,
                            materialCode: true,
                            materialName: true,
                        },
                    },
                    warehouse: { select: { id: true, code: true, name: true } },
                    mrpRun: {
                        select: { id: true, runNumber: true, status: true },
                    },
                },
                orderBy: [
                    { shortage: 'desc' },
                    { belowReorderPoint: 'desc' },
                    { netRequirement: 'desc' },
                ],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmMaterialRequirement.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async listPlannedOrders(query: MaterialRequirementQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.mrpRunId) where.mrpRunId = query.mrpRunId
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId

        if (!query.mrpRunId && query.companyId) {
            const latest = await this.prisma.mmMrpRun.findFirst({
                where: { companyId: query.companyId, status: 'COMPLETED' },
                orderBy: { completedAt: 'desc' },
                select: { id: true },
            })
            if (latest) where.mrpRunId = latest.id
        }

        const [data, total] = await Promise.all([
            this.prisma.mmPlannedOrder.findMany({
                where,
                include: {
                    material: {
                        select: {
                            id: true,
                            materialCode: true,
                            materialName: true,
                        },
                    },
                    warehouse: { select: { id: true, code: true, name: true } },
                    mrpRun: {
                        select: { id: true, runNumber: true, status: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmPlannedOrder.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    private async generateRunNumber(): Promise<string> {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const prefix = `MRP-${dateStr}-`
        const last = await this.prisma.mmMrpRun.findFirst({
            where: { runNumber: { startsWith: prefix } },
            orderBy: { runNumber: 'desc' },
            select: { runNumber: true },
        })
        let seq = 1
        if (last?.runNumber) {
            const part = last.runNumber.slice(prefix.length)
            const n = parseInt(part, 10)
            if (!Number.isNaN(n)) seq = n + 1
        }
        return `${prefix}${String(seq).padStart(4, '0')}`
    }
}
