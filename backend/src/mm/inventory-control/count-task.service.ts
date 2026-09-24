import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CountTaskQueryDto } from './dto/count-engine.dto'
import { CountSessionService } from './count-session.service'

@Injectable()
export class CountTaskService {
    constructor(
        private prisma: PrismaService,
        private sessions: CountSessionService,
    ) {}

    async findAll(query: CountTaskQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 50
        const where: Record<string, unknown> = {}
        if (query.sessionId) where.sessionId = query.sessionId
        if (query.status) where.status = query.status
        if (query.assignedCounter) where.assignedCounter = query.assignedCounter

        const [rows, total] = await Promise.all([
            this.prisma.mmCountTask.findMany({
                where,
                include: {
                    material: true,
                    storageBin: true,
                    session: true,
                    entries: true,
                    variances: true,
                },
                orderBy: { taskNumber: 'asc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmCountTask.count({ where }),
        ])

        const blind =
            query.blind ||
            rows.some((r) => r.session?.blindMode) ||
            false
        const data = blind
            ? rows.map((t) => this.sessions.stripSystemQty(t))
            : rows
        return { data, total, page, pageSize }
    }

    async findOne(id: string, opts?: { blind?: boolean }) {
        const task = await this.prisma.mmCountTask.findUnique({
            where: { id },
            include: {
                material: true,
                storageBin: true,
                session: true,
                entries: { orderBy: { sequence: 'asc' } },
                variances: true,
                recounts: true,
            },
        })
        if (!task) throw new NotFoundException('Count task not found')
        if (opts?.blind || task.session.blindMode) {
            return this.sessions.stripSystemQty(task)
        }
        return task
    }
}
