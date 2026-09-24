import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateRecountDto } from './dto/count-engine.dto'

@Injectable()
export class CountRecountService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: {
        taskId?: string
        status?: string
        page?: number
        pageSize?: number
    }) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 50
        const where: Record<string, unknown> = {}
        if (query.taskId) where.taskId = query.taskId
        if (query.status) where.status = query.status
        const [data, total] = await Promise.all([
            this.prisma.mmCountRecount.findMany({
                where,
                include: {
                    variance: true,
                    task: { include: { material: true, session: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmCountRecount.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async create(dto: CreateRecountDto | { varianceId: string; reason?: string; requestedBy?: string }) {
        const variance = await this.prisma.mmCountVariance.findUnique({
            where: { id: dto.varianceId },
            include: { task: { include: { session: true } } },
        })
        if (!variance) throw new NotFoundException('Variance not found')

        const existing = await this.prisma.mmCountRecount.findFirst({
            where: { varianceId: variance.id, status: 'OPEN' },
        })
        if (existing) return existing

        const recount = await this.prisma.mmCountRecount.create({
            data: {
                varianceId: variance.id,
                taskId: variance.taskId,
                reason: dto.reason ?? null,
                status: 'OPEN',
                requestedBy: ('requestedBy' in dto ? dto.requestedBy : null) ?? null,
            },
            include: { variance: true, task: true },
        })

        await this.prisma.mmCountTask.update({
            where: { id: variance.taskId },
            data: { status: 'RECOUNT_REQUIRED' },
        })
        await this.prisma.mmCountVariance.update({
            where: { id: variance.id },
            data: { status: 'RECOUNT_REQUIRED' },
        })
        if (variance.task.sessionId) {
            await this.prisma.mmCountSession.update({
                where: { id: variance.task.sessionId },
                data: { status: 'RECOUNT_REQUIRED' },
            })
        }

        return recount
    }
}
