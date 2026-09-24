import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { ProjectedStockQueryDto } from './dto/planning.dto'

export type SupplyEvent = { date: Date; quantity: Decimal }
export type DemandEvent = { date: Date; quantity: Decimal }
export type ReservationEvent = { date: Date; quantity: Decimal }

export type ProjectedStockInput = {
    asOf: Date
    horizonEnd: Date
    openingAvailable: Decimal
    demands: DemandEvent[]
    supplies: SupplyEvent[]
    reservations?: ReservationEvent[]
}

export type ProjectedStockBucket = {
    bucketDate: Date
    openingQty: Decimal
    demandQty: Decimal
    supplyQty: Decimal
    reservationQty: Decimal
    closingQty: Decimal
}

function dayStart(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function sameDay(a: Date, b: Date): boolean {
    return dayStart(a).getTime() === dayStart(b).getTime()
}

function sumForDay(events: { date: Date; quantity: Decimal }[], bucket: Date): Decimal {
    let sum = new Decimal(0)
    for (const e of events) {
        if (sameDay(e.date, bucket)) sum = sum.plus(e.quantity)
    }
    return sum
}

/**
 * Pure time-phased projected stock buckets.
 * closing = opening - demand + supply - reservationQty
 */
export function buildProjectedStockBuckets(
    input: ProjectedStockInput,
): ProjectedStockBucket[] {
    const buckets: ProjectedStockBucket[] = []
    const reservations = input.reservations ?? []
    let closing = input.openingAvailable

    const cursor = dayStart(input.asOf)
    const end = dayStart(input.horizonEnd)

    while (cursor.getTime() <= end.getTime()) {
        const opening = closing
        const demandQty = sumForDay(input.demands, cursor)
        const supplyQty = sumForDay(input.supplies, cursor)
        const reservationQty = sumForDay(reservations, cursor)
        closing = opening.minus(demandQty).plus(supplyQty).minus(reservationQty)

        buckets.push({
            bucketDate: new Date(cursor),
            openingQty: opening,
            demandQty,
            supplyQty,
            reservationQty,
            closingQty: closing,
        })

        cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    return buckets
}

@Injectable()
export class ProjectedStockService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: ProjectedStockQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 100
        const where: any = {}

        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId

        if (query.mrpRunId) {
            where.mrpRunId = query.mrpRunId
        } else if (query.companyId) {
            const latest = await this.prisma.mmMrpRun.findFirst({
                where: { companyId: query.companyId, status: 'COMPLETED' },
                orderBy: { completedAt: 'desc' },
                select: { id: true },
            })
            if (latest) where.mrpRunId = latest.id
            else return { data: [], meta: { total: 0, page, limit, totalPages: 0 } }
        }

        if (query.dateFrom || query.dateTo) {
            where.bucketDate = {}
            if (query.dateFrom) where.bucketDate.gte = new Date(query.dateFrom)
            if (query.dateTo) where.bucketDate.lte = new Date(query.dateTo)
        }

        const [data, total] = await Promise.all([
            this.prisma.mmProjectedStock.findMany({
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
                    mrpRun: { select: { id: true, runNumber: true, status: true } },
                },
                orderBy: [{ bucketDate: 'asc' }, { materialId: 'asc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmProjectedStock.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async persistBuckets(
        mrpRunId: string,
        companyId: string,
        warehouseId: string,
        materialId: string,
        buckets: ProjectedStockBucket[],
    ) {
        if (!buckets.length) return
        await this.prisma.mmProjectedStock.createMany({
            data: buckets.map((b) => ({
                mrpRunId,
                companyId,
                warehouseId,
                materialId,
                bucketDate: b.bucketDate,
                openingQty: b.openingQty,
                demandQty: b.demandQty,
                supplyQty: b.supplyQty,
                reservationQty: b.reservationQty,
                closingQty: b.closingQty,
            })),
        })
    }

    async clearForRun(mrpRunId: string) {
        await this.prisma.mmProjectedStock.deleteMany({ where: { mrpRunId } })
    }
}
