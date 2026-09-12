import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    CreateCountSessionDto,
    CountSessionQueryDto,
} from './dto/count-engine.dto'
import { CountPlanService } from './count-plan.service'

@Injectable()
export class CountSessionService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => CountPlanService))
        private plans: CountPlanService,
    ) {}

    async findAll(query: CountSessionQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const where: Record<string, unknown> = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.planId) where.planId = query.planId
        if (query.status) where.status = query.status

        const [data, total] = await Promise.all([
            this.prisma.mmCountSession.findMany({
                where,
                include: {
                    warehouse: true,
                    plan: { include: { policy: true } },
                    _count: { select: { tasks: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmCountSession.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string, opts?: { blind?: boolean }) {
        const session = await this.prisma.mmCountSession.findUnique({
            where: { id },
            include: {
                warehouse: true,
                plan: { include: { policy: true } },
                tasks: {
                    include: {
                        material: true,
                        storageBin: true,
                        entries: true,
                        variances: true,
                        recounts: true,
                    },
                    orderBy: { taskNumber: 'asc' },
                },
                adjustmentRequests: { include: { lines: true } },
            },
        })
        if (!session) throw new NotFoundException('Count session not found')
        const blind = opts?.blind || session.blindMode
        if (blind) {
            return {
                ...session,
                tasks: session.tasks.map((t) => this.stripSystemQty(t)),
            }
        }
        return session
    }

    async create(dto: CreateCountSessionDto) {
        const plan = await this.prisma.mmCountPlan.findUnique({
            where: { id: dto.planId },
            include: { policy: true, sessions: true },
        })
        if (!plan) throw new NotFoundException('Count plan not found')

        const blindMode =
            dto.blindMode ??
            (plan.countType === 'BLIND_COUNT' || !!plan.policy?.blindCountRequired)

        const sessionNumber = await this.nextSessionNumber()
        return this.prisma.mmCountSession.create({
            data: {
                sessionNumber,
                planId: plan.id,
                companyId: plan.companyId,
                warehouseId: plan.warehouseId,
                countType: plan.countType,
                status: 'OPEN',
                blindMode,
            },
            include: { warehouse: true, plan: true },
        })
    }

    async start(id: string) {
        const session = await this.findOne(id)
        if (session.status !== 'OPEN') {
            throw new BadRequestException('Only OPEN sessions can be started')
        }
        if (!session.tasks.length) {
            throw new BadRequestException('Generate tasks before starting')
        }
        const claimed = await this.prisma.mmCountSession.updateMany({
            where: { id, status: 'OPEN' },
            data: { status: 'IN_PROGRESS', startedAt: new Date() },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Concurrent start failed')
        }
        await this.plans.syncLegacyStatus(session.planId, 'IN_PROGRESS')
        return this.findOne(id)
    }

    async close(id: string) {
        const session = await this.findOne(id)
        if (!['ADJUSTED', 'APPROVED', 'COUNTED'].includes(session.status)) {
            throw new BadRequestException(`Cannot close session in ${session.status}`)
        }
        await this.prisma.mmCountSession.update({
            where: { id },
            data: { status: 'CLOSED', closedAt: new Date() },
        })
        await this.plans.syncLegacyStatus(session.planId, 'CLOSED')
        return this.findOne(id)
    }

    stripSystemQty<T extends { systemQuantity?: unknown }>(task: T): T {
        const { systemQuantity: _, ...rest } = task as T & { systemQuantity?: unknown }
        return { ...rest, systemQuantity: undefined } as T
    }

    private async nextSessionNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `CSE-${today}-`
        const last = await this.prisma.mmCountSession.findFirst({
            where: { sessionNumber: { startsWith: pfx } },
            orderBy: { sessionNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.sessionNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
