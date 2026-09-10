import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { CreatePickWaveDto } from './dto/create-pick-wave.dto'
import { PickWaveQueryDto } from './dto/pick-wave-query.dto'
import { PickingService } from './picking.service'

@Injectable()
export class PickWaveService {
    constructor(
        private prisma: PrismaService,
        private picking: PickingService,
    ) {}

    private readonly includes = {
        warehouse: true,
        tasks: {
            include: {
                material: true,
                sourceBin: true,
                reservation: true,
            },
            orderBy: { priority: 'asc' as const },
        },
    }

    async findAll(query: PickWaveQueryDto) {
        const {
            page = 1,
            limit = 20,
            warehouseId,
            status,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = query

        const where: any = {}
        if (warehouseId) where.warehouseId = warehouseId
        if (status) where.status = status

        const [data, total] = await Promise.all([
            this.prisma.wmPickWave.findMany({
                where,
                include: this.includes,
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.wmPickWave.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const wave = await this.prisma.wmPickWave.findUnique({
            where: { id },
            include: this.includes,
        })
        if (!wave) throw new NotFoundException('Pick wave not found')
        return wave
    }

    async create(dto: CreatePickWaveDto) {
        const waveNumber = await this.generateNextCode()
        const strategy = (dto.strategy ?? 'FIFO').toUpperCase()
        const priority = dto.priority ?? 5
        const zoneCode = dto.zoneCode ?? null

        const wave = await this.prisma.wmPickWave.create({
            data: {
                waveNumber,
                warehouseId: dto.warehouseId,
                strategy,
                priority,
                status: 'DRAFT',
                taskCount: 0,
            },
        })

        const taskIds = [...(dto.taskIds ?? [])]

        if (dto.reservationIds?.length) {
            for (const reservationId of dto.reservationIds) {
                const task = await this.picking.createFromReservation(
                    reservationId,
                    strategy,
                    zoneCode,
                )
                taskIds.push(task.id)
            }
        }

        if (taskIds.length) {
            await this.prisma.wmPickingTask.updateMany({
                where: { id: { in: taskIds } },
                data: { waveId: wave.id, priority },
            })
        }

        await this.optimizeSequence(wave.id, strategy)

        return this.findOne(wave.id)
    }

    /**
     * Optimized pick sequence: by bin code (path) then priority, respecting FEFO/FIFO batch order.
     */
    async optimizeSequence(waveId: string, strategy?: string) {
        const wave = await this.findOne(waveId)
        const strat = strategy ?? wave.strategy

        const tasks = [...wave.tasks]
        tasks.sort((a, b) => {
            const binA = a.sourceBin?.code ?? ''
            const binB = b.sourceBin?.code ?? ''
            if (binA !== binB) return binA.localeCompare(binB)
            if (a.priority !== b.priority) return a.priority - b.priority
            return a.taskNumber.localeCompare(b.taskNumber)
        })

        let seq = 1
        for (const task of tasks) {
            await this.prisma.wmPickingTask.update({
                where: { id: task.id },
                data: {
                    // Encode sequence into priority (lower = earlier) while preserving relative urgency
                    priority: seq,
                },
            })
            seq += 1
        }

        return this.prisma.wmPickWave.update({
            where: { id: waveId },
            data: {
                strategy: strat,
                taskCount: tasks.length,
            },
            include: this.includes,
        })
    }

    async start(id: string) {
        const wave = await this.findOne(id)
        if (wave.status !== 'DRAFT') {
            throw new BadRequestException('Only DRAFT waves can be started')
        }
        await this.optimizeSequence(id, wave.strategy)
        return this.prisma.wmPickWave.update({
            where: { id },
            data: { status: 'IN_PROGRESS' },
            include: this.includes,
        })
    }

    async complete(id: string) {
        const wave = await this.findOne(id)
        if (wave.status !== 'IN_PROGRESS') {
            throw new BadRequestException('Only IN_PROGRESS waves can be completed')
        }
        const incomplete = wave.tasks.filter(
            (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED',
        )
        if (incomplete.length > 0) {
            throw new BadRequestException(
                `${incomplete.length} picking task(s) still open in this wave`,
            )
        }
        return this.prisma.wmPickWave.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                completedCount: wave.tasks.filter((t) => t.status === 'COMPLETED').length,
            },
            include: this.includes,
        })
    }

    async cancel(id: string) {
        const wave = await this.findOne(id)
        if (wave.status === 'COMPLETED') {
            throw new BadRequestException('Cannot cancel a completed wave')
        }
        return this.prisma.wmPickWave.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: this.includes,
        })
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.wmPickWave.findFirst({
            where: { waveNumber: { startsWith: 'WV-' } },
            orderBy: { waveNumber: 'desc' },
            select: { waveNumber: true },
        })
        let seq = 1
        if (last) {
            const num = parseInt(last.waveNumber.replace('WV-', ''), 10)
            if (!isNaN(num)) seq = num + 1
        }
        return `WV-${String(seq).padStart(6, '0')}`
    }
}
