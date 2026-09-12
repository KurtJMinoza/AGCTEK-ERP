import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { InventoryAvailabilityService } from '../inventory-availability.service'
import {
    CreateReservationHeaderDto,
    ReservationQueryDto,
} from './dto/reservation-allocation.dto'
import { reserveWarehouseQuantity, releaseWarehouseQuantity } from './reservation-balance.util'
import { ACTIVE_RESERVATION_STATUSES } from './reservation-allocation.constants'
import { MmDomainEventsService } from '../../common/mm-domain-events.service'
import { AllocationEngineService } from './allocation-engine.service'

@Injectable()
export class ReservationEngineService {
    constructor(
        private prisma: PrismaService,
        private availability: InventoryAvailabilityService,
        private domainEvents: MmDomainEventsService,
        @Inject(forwardRef(() => AllocationEngineService))
        private allocations: AllocationEngineService,
    ) {}

    private readonly includes = {
        company: true,
        warehouse: true,
        lines: { include: { material: true, batch: true, serialNumber: true } },
        allocations: { include: { lines: true } },
    }

    async create(dto: CreateReservationHeaderDto) {
        if (!dto.lines?.length) {
            throw new BadRequestException('At least one reservation line is required')
        }

        for (const line of dto.lines) {
            const check = await this.availability.assertAvailable(
                dto.companyId,
                dto.warehouseId,
                line.materialId,
                line.quantity,
                {
                    batchId: line.batchId,
                    serialNumberId: line.serialNumberId,
                },
            )
            if (!check.ok && !dto.allowPartialReservation) {
                throw new BadRequestException(
                    `Insufficient available stock for ${line.materialId}. Available: ${check.available}, Requested: ${line.quantity}`,
                )
            }
        }

        const reservationNumber = await this.nextReservationNumber()

        const header = await this.prisma.$transaction(async (tx) => {
            const created = await tx.mmInventoryReservationHeader.create({
                data: {
                    reservationNumber,
                    companyId: dto.companyId,
                    warehouseId: dto.warehouseId,
                    demandReferenceType: dto.demandReferenceType ?? null,
                    demandReferenceId: dto.demandReferenceId ?? null,
                    demandReferenceLineId: dto.demandReferenceLineId ?? null,
                    sourceModule: dto.sourceModule,
                    sourceDocumentType: dto.sourceDocumentType,
                    sourceDocumentId: dto.sourceDocumentId,
                    allowPartialReservation: dto.allowPartialReservation ?? false,
                    validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
                    createdBy: dto.createdBy ?? null,
                    status: 'DRAFT',
                    lines: {
                        create: dto.lines.map((line, idx) => ({
                            lineNumber: idx + 1,
                            materialId: line.materialId,
                            batchId: line.batchId ?? null,
                            serialNumberId: line.serialNumberId ?? null,
                            stockStatus: line.stockStatus ?? 'UNRESTRICTED',
                            uomId: line.uomId ?? null,
                            requestedQuantity: new Decimal(line.quantity),
                            reservedQuantity: new Decimal(0),
                            status: 'DRAFT',
                        })),
                    },
                },
                include: { lines: true },
            })

            let anyShort = false
            for (const line of created.lines) {
                const check = await this.availability.assertAvailable(
                    dto.companyId,
                    dto.warehouseId,
                    line.materialId,
                    line.requestedQuantity,
                    {
                        batchId: line.batchId,
                        serialNumberId: line.serialNumberId,
                    },
                )
                let reserveQty = new Decimal(line.requestedQuantity)
                if (!check.ok) {
                    if (!dto.allowPartialReservation) {
                        throw new BadRequestException('Availability changed during reservation')
                    }
                    reserveQty = new Decimal(Math.max(0, check.available))
                    anyShort = true
                }
                if (reserveQty.lte(0)) continue

                await reserveWarehouseQuantity(tx, {
                    companyId: dto.companyId,
                    warehouseId: dto.warehouseId,
                    materialId: line.materialId,
                    quantity: reserveQty,
                    stockStatus: line.stockStatus,
                    batchId: line.batchId,
                    serialNumberId: line.serialNumberId,
                })

                await tx.mmInventoryReservationLine.update({
                    where: { id: line.id },
                    data: {
                        reservedQuantity: reserveQty,
                        status: reserveQty.lt(line.requestedQuantity) ? 'SHORT' : 'RESERVED',
                    },
                })

                const legacyNumber = `${reservationNumber}-L${line.lineNumber}`
                await tx.mmInventoryReservation.create({
                    data: {
                        reservationNumber: legacyNumber,
                        companyId: dto.companyId,
                        warehouseId: dto.warehouseId,
                        materialId: line.materialId,
                        batchId: line.batchId,
                        serialNumberId: line.serialNumberId,
                        stockStatus: line.stockStatus,
                        quantity: line.requestedQuantity,
                        reservedQuantity: reserveQty,
                        fulfilledQuantity: 0,
                        sourceType: dto.demandReferenceType ?? 'INTERNAL_REQUEST',
                        sourceModule: dto.sourceModule,
                        sourceDocumentType: dto.sourceDocumentType,
                        sourceDocumentId: dto.sourceDocumentId,
                        sourceDocumentLineId: dto.demandReferenceLineId ?? null,
                        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
                        status: reserveQty.lt(line.requestedQuantity) ? 'PARTIAL' : 'OPEN',
                        reservationHeaderId: created.id,
                        reservationLineId: line.id,
                    },
                })
            }

            const refreshed = await tx.mmInventoryReservationLine.findMany({
                where: { headerId: created.id },
            })
            const totalRequested = refreshed.reduce(
                (s, l) => s.plus(l.requestedQuantity),
                new Decimal(0),
            )
            const totalReserved = refreshed.reduce(
                (s, l) => s.plus(l.reservedQuantity),
                new Decimal(0),
            )
            let status = 'RESERVED'
            if (totalReserved.lte(0)) status = 'SHORT'
            else if (totalReserved.lt(totalRequested) || anyShort) status = 'SHORT'

            return tx.mmInventoryReservationHeader.update({
                where: { id: created.id },
                data: { status },
                include: this.includes,
            })
        })

        void this.domainEvents.reservationCreated({
            companyId: dto.companyId,
            reservationId: header.id,
            payload: {
                reservationNumber,
                sourceDocumentId: dto.sourceDocumentId,
            },
        })

        return header
    }

    async findAll(query: ReservationQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const where: Record<string, unknown> = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.status) where.status = query.status
        if (query.demandReferenceId) where.demandReferenceId = query.demandReferenceId
        if (query.search) {
            where.OR = [
                { reservationNumber: { contains: query.search, mode: 'insensitive' } },
                { sourceDocumentId: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const [data, total] = await Promise.all([
            this.prisma.mmInventoryReservationHeader.findMany({
                where,
                include: this.includes,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmInventoryReservationHeader.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmInventoryReservationHeader.findUnique({
            where: { id },
            include: this.includes,
        })
        if (!row) throw new NotFoundException('Reservation not found')
        return row
    }

    async release(id: string) {
        const header = await this.findOne(id)
        if (!ACTIVE_RESERVATION_STATUSES.has(header.status)) {
            throw new BadRequestException(`Cannot release reservation in status ${header.status}`)
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            for (const line of header.lines) {
                const remaining = new Decimal(line.reservedQuantity)
                    .minus(line.issuedQuantity)
                    .minus(line.allocatedQuantity.gt(0) ? new Decimal(0) : new Decimal(0))
                const releasable = Decimal.max(
                    new Decimal(0),
                    new Decimal(line.reservedQuantity).minus(line.issuedQuantity),
                )
                if (releasable.gt(0)) {
                    await releaseWarehouseQuantity(tx, {
                        companyId: header.companyId,
                        warehouseId: header.warehouseId,
                        materialId: line.materialId,
                        quantity: releasable,
                        stockStatus: line.stockStatus,
                        batchId: line.batchId,
                        serialNumberId: line.serialNumberId,
                    })
                }
                await tx.mmInventoryReservationLine.update({
                    where: { id: line.id },
                    data: { status: 'RELEASED', reservedQuantity: line.issuedQuantity },
                })
                await tx.mmInventoryReservation.updateMany({
                    where: { reservationLineId: line.id },
                    data: { status: 'CANCELLED', reservedQuantity: line.issuedQuantity },
                })
            }
            return tx.mmInventoryReservationHeader.update({
                where: { id },
                data: { status: 'RELEASED' },
                include: this.includes,
            })
        })

        void this.domainEvents.reservationReleased({
            companyId: header.companyId,
            reservationId: id,
            payload: { reason: 'RELEASED' },
        })
        return updated
    }

    async cancel(id: string) {
        const header = await this.findOne(id)
        if (['ISSUED', 'CANCELLED', 'RELEASED', 'EXPIRED'].includes(header.status)) {
            throw new BadRequestException(`Cannot cancel reservation in status ${header.status}`)
        }
        await this.allocations.releaseByHeader(id)
        await this.release(id)
        return this.prisma.mmInventoryReservationHeader.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: this.includes,
        })
    }

    async allocate(id: string, dto: import('./dto/reservation-allocation.dto').AllocateReservationDto) {
        return this.allocations.allocateHeader(id, dto)
    }

    async expireDue() {
        const now = new Date()
        const due = await this.prisma.mmInventoryReservationHeader.findMany({
            where: {
                status: { in: [...ACTIVE_RESERVATION_STATUSES] },
                validUntil: { lt: now },
            },
        })
        const ids: string[] = []
        for (const h of due) {
            try {
                await this.cancel(h.id)
                await this.prisma.mmInventoryReservationHeader.update({
                    where: { id: h.id },
                    data: { status: 'EXPIRED' },
                })
                ids.push(h.id)
            } catch {
                /* skip */
            }
        }
        return { expired: ids.length, ids }
    }

    async recordIssue(
        reservationLineId: string,
        quantity: Decimal,
        tx?: import('@prisma/client').Prisma.TransactionClient,
    ) {
        const client = tx ?? this.prisma
        const line = await client.mmInventoryReservationLine.findUnique({
            where: { id: reservationLineId },
            include: { header: true },
        })
        if (!line) throw new NotFoundException('Reservation line not found')

        const newIssued = new Decimal(line.issuedQuantity ?? 0).plus(quantity)
        await client.mmInventoryReservationLine.update({
            where: { id: line.id },
            data: {
                issuedQuantity: newIssued,
                status: newIssued.gte(line.reservedQuantity) ? 'ISSUED' : line.status,
            },
        })

        await releaseWarehouseQuantity(client, {
            companyId: line.header.companyId,
            warehouseId: line.header.warehouseId,
            materialId: line.materialId,
            quantity,
            stockStatus: line.stockStatus,
            batchId: line.batchId,
            serialNumberId: line.serialNumberId,
        })

        const lines = await client.mmInventoryReservationLine.findMany({
            where: { headerId: line.headerId },
        })
        const allIssued = lines.every((l) =>
            new Decimal(l.issuedQuantity).gte(l.reservedQuantity),
        )
        const headerStatus = allIssued ? 'ISSUED' : 'PARTIALLY_PICKED'
        await client.mmInventoryReservationHeader.update({
            where: { id: line.headerId },
            data: { status: headerStatus },
        })

        await client.mmInventoryReservation.updateMany({
            where: { reservationLineId: line.id },
            data: {
                fulfilledQuantity: newIssued,
                reservedQuantity: Decimal.max(new Decimal(0), new Decimal(line.reservedQuantity).minus(quantity)),
                status: newIssued.gte(line.reservedQuantity) ? 'FULFILLED' : 'PARTIAL',
            },
        })
    }

    private async nextReservationNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `RSV-${today}-`
        const last = await this.prisma.mmInventoryReservationHeader.findFirst({
            where: { reservationNumber: { startsWith: pfx } },
            orderBy: { reservationNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.reservationNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
