import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { InventoryAvailabilityService } from './inventory-availability.service'
import { CreateReservationDto, ReservationQueryDto } from './dto/reservation.dto'

const OPEN_STATUSES = new Set(['OPEN', 'PARTIAL'])

@Injectable()
export class ReservationService {
    constructor(
        private prisma: PrismaService,
        private availability: InventoryAvailabilityService,
    ) {}

    private readonly includes = {
        material: true,
        warehouse: true,
        storageBin: true,
        batch: true,
        serialNumber: true,
        company: true,
    }

    async create(dto: CreateReservationDto) {
        const qty = new Decimal(dto.quantity)
        const check = await this.availability.assertAvailable(
            dto.companyId,
            dto.warehouseId,
            dto.materialId,
            qty,
            {
                storageBinId: dto.storageBinId,
                batchId: dto.batchId,
                serialNumberId: dto.serialNumberId,
            },
        )
        if (!check.ok) {
            throw new BadRequestException(
                `Insufficient available stock for reservation. Available: ${check.available}, Requested: ${check.required}`,
            )
        }

        const reservationNumber = await this.generateNumber()

        return this.prisma.$transaction(async (tx) => {
            await this.allocateReserved(tx, {
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                materialId: dto.materialId,
                storageBinId: dto.storageBinId ?? null,
                batchId: dto.batchId ?? null,
                serialNumberId: dto.serialNumberId ?? null,
                quantity: qty,
            })

            return tx.mmInventoryReservation.create({
                data: {
                    reservationNumber,
                    companyId: dto.companyId,
                    warehouseId: dto.warehouseId,
                    storageBinId: dto.storageBinId ?? null,
                    materialId: dto.materialId,
                    batchId: dto.batchId ?? null,
                    serialNumberId: dto.serialNumberId ?? null,
                    stockStatus: 'UNRESTRICTED',
                    quantity: qty,
                    reservedQuantity: qty,
                    fulfilledQuantity: 0,
                    sourceType: dto.sourceType,
                    sourceModule: dto.sourceModule,
                    sourceDocumentType: dto.sourceDocumentType,
                    sourceDocumentId: dto.sourceDocumentId,
                    sourceDocumentLineId: dto.sourceDocumentLineId ?? null,
                    validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
                    createdBy: dto.createdBy ?? null,
                    status: 'OPEN',
                },
                include: this.includes,
            })
        })
    }

    async findAll(query: ReservationQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 20
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId
        if (query.status) where.status = query.status
        if (query.sourceType) where.sourceType = query.sourceType
        if (query.sourceDocumentId) where.sourceDocumentId = query.sourceDocumentId
        if (query.search) {
            where.OR = [
                { reservationNumber: { contains: query.search, mode: 'insensitive' } },
                { sourceDocumentId: { contains: query.search, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await Promise.all([
            this.prisma.mmInventoryReservation.findMany({
                where,
                include: this.includes,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmInventoryReservation.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmInventoryReservation.findUnique({
            where: { id },
            include: {
                ...this.includes,
                pickingTasks: true,
                packages: true,
                goodsIssues: true,
            },
        })
        if (!row) throw new NotFoundException('Reservation not found')
        return row
    }

    async cancel(id: string) {
        const reservation = await this.findOne(id)
        if (!OPEN_STATUSES.has(reservation.status)) {
            throw new BadRequestException(`Cannot cancel reservation in status ${reservation.status}`)
        }

        const remaining = new Decimal(reservation.reservedQuantity).minus(reservation.fulfilledQuantity)
        if (remaining.lte(0) && new Decimal(reservation.fulfilledQuantity).gt(0)) {
            throw new BadRequestException('Reservation already fulfilled')
        }

        return this.prisma.$transaction(async (tx) => {
            if (remaining.gt(0)) {
                await this.releaseReserved(tx, {
                    companyId: reservation.companyId,
                    warehouseId: reservation.warehouseId,
                    materialId: reservation.materialId,
                    storageBinId: reservation.storageBinId,
                    batchId: reservation.batchId,
                    serialNumberId: reservation.serialNumberId,
                    quantity: remaining,
                })
            }

            return tx.mmInventoryReservation.update({
                where: { id },
                data: {
                    status: 'CANCELLED',
                    reservedQuantity: reservation.fulfilledQuantity,
                },
                include: this.includes,
            })
        })
    }

    async expireDue() {
        const now = new Date()
        const due = await this.prisma.mmInventoryReservation.findMany({
            where: {
                status: { in: ['OPEN', 'PARTIAL'] },
                validUntil: { lt: now },
            },
        })
        const results = []
        for (const r of due) {
            try {
                const remaining = new Decimal(r.reservedQuantity).minus(r.fulfilledQuantity)
                await this.prisma.$transaction(async (tx) => {
                    if (remaining.gt(0)) {
                        await this.releaseReserved(tx, {
                            companyId: r.companyId,
                            warehouseId: r.warehouseId,
                            materialId: r.materialId,
                            storageBinId: r.storageBinId,
                            batchId: r.batchId,
                            serialNumberId: r.serialNumberId,
                            quantity: remaining,
                        })
                    }
                    await tx.mmInventoryReservation.update({
                        where: { id: r.id },
                        data: {
                            status: 'EXPIRED',
                            reservedQuantity: r.fulfilledQuantity,
                        },
                    })
                })
                results.push(r.id)
            } catch {
                /* skip failed expire */
            }
        }
        return { expired: results.length, ids: results }
    }

    /**
     * Advances reservation fulfillment after Goods Issue has already released
     * reservedQuantity on balances (via InventoryPostingService.releaseReservedQuantity).
     */
    async fulfill(
        reservationId: string,
        quantity: number | Decimal,
        tx?: Prisma.TransactionClient,
    ) {
        const client = tx ?? this.prisma
        const reservation = await client.mmInventoryReservation.findUnique({
            where: { id: reservationId },
        })
        if (!reservation) throw new NotFoundException('Reservation not found')
        if (!OPEN_STATUSES.has(reservation.status)) {
            throw new BadRequestException(`Reservation is ${reservation.status}`)
        }

        const qty = new Decimal(quantity)
        const openQty = new Decimal(reservation.quantity).minus(reservation.fulfilledQuantity)
        if (qty.gt(openQty)) {
            throw new BadRequestException(
                `Fulfill qty exceeds open reservation. Open: ${openQty}, Requested: ${qty}`,
            )
        }

        const newFulfilled = new Decimal(reservation.fulfilledQuantity).plus(qty)
        const newReserved = Decimal.max(
            new Decimal(0),
            new Decimal(reservation.reservedQuantity).minus(qty),
        )
        const status = newFulfilled.gte(reservation.quantity)
            ? 'FULFILLED'
            : newFulfilled.gt(0)
              ? 'PARTIAL'
              : 'OPEN'

        return client.mmInventoryReservation.update({
            where: { id: reservationId },
            data: {
                fulfilledQuantity: newFulfilled,
                reservedQuantity: newReserved,
                status,
            },
        })
    }

    /**
     * Restore reservation allocation after GI reversal.
     */
    async restoreAfterReversal(
        reservationId: string,
        quantity: number | Decimal,
        tx?: Prisma.TransactionClient,
    ) {
        const client = tx ?? this.prisma
        const reservation = await client.mmInventoryReservation.findUnique({
            where: { id: reservationId },
        })
        if (!reservation) throw new NotFoundException('Reservation not found')

        const qty = new Decimal(quantity)
        await this.allocateReserved(client, {
            companyId: reservation.companyId,
            warehouseId: reservation.warehouseId,
            materialId: reservation.materialId,
            storageBinId: reservation.storageBinId,
            batchId: reservation.batchId,
            serialNumberId: reservation.serialNumberId,
            quantity: qty,
        })

        const newFulfilled = Decimal.max(
            new Decimal(0),
            new Decimal(reservation.fulfilledQuantity).minus(qty),
        )
        const newReserved = new Decimal(reservation.reservedQuantity).plus(qty)
        const status = newFulfilled.lte(0)
            ? 'OPEN'
            : newFulfilled.lt(reservation.quantity)
              ? 'PARTIAL'
              : 'FULFILLED'

        return client.mmInventoryReservation.update({
            where: { id: reservationId },
            data: {
                fulfilledQuantity: newFulfilled,
                reservedQuantity: newReserved,
                status,
            },
        })
    }

    private async allocateReserved(
        tx: Prisma.TransactionClient | PrismaService,
        args: {
            companyId: string
            warehouseId: string
            materialId: string
            storageBinId: string | null
            batchId: string | null
            serialNumberId: string | null
            quantity: Decimal
        },
    ) {
        let remaining = args.quantity
        const where: any = {
            companyId: args.companyId,
            warehouseId: args.warehouseId,
            materialId: args.materialId,
            stockStatus: 'UNRESTRICTED',
        }
        if (args.storageBinId) where.storageBinId = args.storageBinId
        if (args.batchId) where.batchId = args.batchId
        if (args.serialNumberId) where.serialNumberId = args.serialNumberId

        const balances = await tx.mmInventoryBalance.findMany({
            where,
            orderBy: { updatedAt: 'asc' },
        })

        for (const bal of balances) {
            if (remaining.lte(0)) break
            const free = new Decimal(bal.availableQuantity)
            if (free.lte(0)) continue
            const take = Decimal.min(free, remaining)
            const newReserved = new Decimal(bal.reservedQuantity).plus(take)
            const newAvailable = new Decimal(bal.quantity).minus(newReserved)
            await tx.mmInventoryBalance.update({
                where: { id: bal.id },
                data: {
                    reservedQuantity: newReserved,
                    availableQuantity: newAvailable,
                    version: { increment: 1 },
                },
            })
            remaining = remaining.minus(take)
        }

        if (remaining.gt(0)) {
            throw new BadRequestException(
                `Could not allocate reservation. Short by ${remaining.toString()}`,
            )
        }
    }

    private async releaseReserved(
        tx: Prisma.TransactionClient | PrismaService,
        args: {
            companyId: string
            warehouseId: string
            materialId: string
            storageBinId: string | null
            batchId: string | null
            serialNumberId: string | null
            quantity: Decimal
        },
    ) {
        let remaining = args.quantity
        const where: any = {
            companyId: args.companyId,
            warehouseId: args.warehouseId,
            materialId: args.materialId,
            stockStatus: 'UNRESTRICTED',
        }
        if (args.storageBinId) where.storageBinId = args.storageBinId
        if (args.batchId) where.batchId = args.batchId
        if (args.serialNumberId) where.serialNumberId = args.serialNumberId

        const balances = await tx.mmInventoryBalance.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
        })

        for (const bal of balances) {
            if (remaining.lte(0)) break
            const reserved = new Decimal(bal.reservedQuantity)
            if (reserved.lte(0)) continue
            const take = Decimal.min(reserved, remaining)
            const newReserved = reserved.minus(take)
            const newAvailable = new Decimal(bal.quantity).minus(newReserved)
            await tx.mmInventoryBalance.update({
                where: { id: bal.id },
                data: {
                    reservedQuantity: newReserved,
                    availableQuantity: newAvailable,
                    version: { increment: 1 },
                },
            })
            remaining = remaining.minus(take)
        }
    }

    private async generateNumber(): Promise<string> {
        const last = await this.prisma.mmInventoryReservation.findFirst({
            where: { reservationNumber: { startsWith: 'RSV-' } },
            orderBy: { reservationNumber: 'desc' },
            select: { reservationNumber: true },
        })
        let seq = 1
        if (last) {
            const num = parseInt(last.reservationNumber.replace('RSV-', ''), 10)
            if (!isNaN(num)) seq = num + 1
        }
        return `RSV-${String(seq).padStart(6, '0')}`
    }
}
