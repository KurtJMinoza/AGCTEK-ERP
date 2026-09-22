import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    CreateCorrectiveActionDto,
    UpdateCorrectiveActionDto,
    TransitionCorrectiveActionDto,
    CapaQueryDto,
} from './dto/quality.dto'
import { NonconformanceService } from './nonconformance.service'
import { assertCapaTransition, deriveCapaStatus } from './quality.constants'

@Injectable()
export class CorrectiveActionService {
    constructor(
        private prisma: PrismaService,
        private nc: NonconformanceService,
    ) {}

    async list(query: CapaQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.status) where.status = query.status
        if (query.search) {
            where.OR = [
                { actionNumber: { contains: query.search, mode: 'insensitive' } },
                { problem: { contains: query.search, mode: 'insensitive' } },
                { owner: { contains: query.search, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await Promise.all([
            this.prisma.mmCorrectiveAction.findMany({
                where,
                include: {
                    nonconformance: {
                        select: {
                            id: true,
                            ncNumber: true,
                            status: true,
                            severity: true,
                            inspectionLot: {
                                select: { id: true, lotNumber: true },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmCorrectiveAction.count({ where }),
        ])

        return {
            data: data.map((ca) => this.withDerivedStatus(ca)),
            total,
            page,
            pageSize,
        }
    }

    async findOne(id: string) {
        const ca = await this.prisma.mmCorrectiveAction.findUnique({
            where: { id },
            include: {
                nonconformance: {
                    select: {
                        id: true,
                        ncNumber: true,
                        status: true,
                        severity: true,
                        cause: true,
                        affectedQuantity: true,
                        inspectionLot: {
                            select: {
                                id: true,
                                lotNumber: true,
                                material: { select: { materialCode: true, materialName: true } },
                                supplier: { select: { supplierCode: true, supplierName: true } },
                            },
                        },
                    },
                },
            },
        })
        if (!ca) throw new NotFoundException(`CAPA ${id} not found`)
        return this.withDerivedStatus(ca)
    }

    async listForNc(nonconformanceId: string) {
        await this.nc.findOne(nonconformanceId)
        const data = await this.prisma.mmCorrectiveAction.findMany({
            where: { nonconformanceId },
            orderBy: { createdAt: 'desc' },
        })
        return data.map((ca) => this.withDerivedStatus(ca))
    }

    async create(nonconformanceId: string, dto: CreateCorrectiveActionDto) {
        const ncRecord = await this.nc.findOne(nonconformanceId)
        const actionNumber = await this.nextNumber()
        const action = await this.prisma.mmCorrectiveAction.create({
            data: {
                actionNumber,
                companyId: ncRecord.companyId,
                nonconformanceId,
                problem: dto.problem ?? null,
                rootCause: dto.rootCause ?? null,
                containment: dto.containment ?? null,
                correctiveAction: dto.correctiveAction ?? null,
                preventiveAction: dto.preventiveAction ?? null,
                owner: dto.owner ?? null,
                dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                notes: dto.notes ?? null,
                status: 'OPEN',
            },
        })
        if (ncRecord.status === 'OPEN') {
            await this.prisma.mmNonconformance.update({
                where: { id: nonconformanceId },
                data: { status: 'CORRECTIVE_ACTION' },
            })
        }
        return this.withDerivedStatus(action)
    }

    async update(id: string, dto: UpdateCorrectiveActionDto) {
        const existing = await this.findOne(id)
        if (existing.status === 'CLOSED') {
            throw new BadRequestException('Cannot edit a CLOSED CAPA')
        }

        const data: any = {}
        if (dto.problem !== undefined) data.problem = dto.problem
        if (dto.rootCause !== undefined) data.rootCause = dto.rootCause
        if (dto.containment !== undefined) data.containment = dto.containment
        if (dto.correctiveAction !== undefined) data.correctiveAction = dto.correctiveAction
        if (dto.preventiveAction !== undefined) data.preventiveAction = dto.preventiveAction
        if (dto.owner !== undefined) data.owner = dto.owner
        if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null
        if (dto.resolution !== undefined) data.resolution = dto.resolution
        if (dto.notes !== undefined) data.notes = dto.notes

        const updated = await this.prisma.mmCorrectiveAction.update({
            where: { id },
            data,
        })
        return this.withDerivedStatus(updated)
    }

    async transition(id: string, dto: TransitionCorrectiveActionDto) {
        const existing = await this.prisma.mmCorrectiveAction.findUnique({
            where: { id },
        })
        if (!existing) throw new NotFoundException(`CAPA ${id} not found`)

        assertCapaTransition(existing.status, dto.targetStatus)

        const data: any = { status: dto.targetStatus }

        if (dto.targetStatus === 'COMPLETED') {
            data.completedAt = new Date()
        }
        if (dto.targetStatus === 'VERIFIED') {
            data.verifiedAt = new Date()
            if (dto.verifiedBy) data.verifiedBy = dto.verifiedBy
        }
        if (dto.targetStatus === 'CLOSED') {
            data.closedAt = new Date()
            if (dto.closedBy) data.closedBy = dto.closedBy
        }
        if (dto.resolution) data.resolution = dto.resolution
        if (dto.notes) data.notes = dto.notes

        const updated = await this.prisma.mmCorrectiveAction.update({
            where: { id },
            data,
        })
        return this.withDerivedStatus(updated)
    }

    private withDerivedStatus<T extends { status: string; dueDate: Date | null }>(
        ca: T,
    ): T & { effectiveStatus: string } {
        return {
            ...ca,
            effectiveStatus: deriveCapaStatus(ca.status, ca.dueDate),
        }
    }

    private async nextNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `CA-${today}-`
        const count = await this.prisma.mmCorrectiveAction.count({
            where: { actionNumber: { startsWith: pfx } },
        })
        return `${pfx}${String(count + 1).padStart(5, '0')}`
    }
}
