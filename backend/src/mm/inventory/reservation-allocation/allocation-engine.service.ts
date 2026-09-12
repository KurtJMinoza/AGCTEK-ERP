import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { AllocationStrategyRegistry } from './strategies/allocation-strategy.registry'
import {
    AllocateReservationDto,
    AllocationQueryDto,
    CreateAllocationDto,
    CustomAllocationLineDto,
} from './dto/reservation-allocation.dto'
import { AllocationCandidate } from './strategies/allocation-strategy.interface'
import { ACTIVE_RESERVATION_STATUSES } from './reservation-allocation.constants'
import { PickingService } from '../../warehouse/picking/picking.service'
import { ReservationEngineService } from './reservation-engine.service'

@Injectable()
export class AllocationEngineService {
    constructor(
        private prisma: PrismaService,
        private strategies: AllocationStrategyRegistry,
        @Inject(forwardRef(() => PickingService))
        private picking: PickingService,
        @Inject(forwardRef(() => ReservationEngineService))
        private reservations: ReservationEngineService,
    ) {}

    private readonly includes = {
        header: true,
        lines: {
            include: {
                storageBin: true,
                material: true,
                batch: true,
                serialNumber: true,
                reservationLine: true,
            },
        },
    }

    async findAll(query: AllocationQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const where: Record<string, unknown> = {}
        if (query.headerId) where.headerId = query.headerId
        if (query.status) where.status = query.status
        const [data, total] = await Promise.all([
            this.prisma.mmInventoryAllocation.findMany({
                where,
                include: this.includes,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmInventoryAllocation.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmInventoryAllocation.findUnique({
            where: { id },
            include: this.includes,
        })
        if (!row) throw new NotFoundException('Allocation not found')
        return row
    }

    async create(dto: CreateAllocationDto) {
        return this.allocateHeader(dto.reservationHeaderId, dto)
    }

    async allocateHeader(headerId: string, dto: AllocateReservationDto | CreateAllocationDto) {
        const header = await this.prisma.mmInventoryReservationHeader.findUnique({
            where: { id: headerId },
            include: { lines: true },
        })
        if (!header) throw new NotFoundException('Reservation not found')
        if (!ACTIVE_RESERVATION_STATUSES.has(header.status) && header.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot allocate reservation in status ${header.status}`)
        }

        const strategy = dto.strategy ?? 'FIFO'
        const allocationNumber = await this.nextAllocationNumber()
        const customByLine = new Map(
            (dto.lines ?? []).map((l) => [l.reservationLineId, l]),
        )

        const allocation = await this.prisma.$transaction(async (tx) => {
            const alloc = await tx.mmInventoryAllocation.create({
                data: {
                    allocationNumber,
                    headerId: header.id,
                    strategy,
                    status: 'ACTIVE',
                    createdBy: dto.createdBy ?? null,
                },
            })

            const plannedLines: Array<{
                reservationLineId: string
                storageBinId: string
                materialId: string
                batchId: string | null
                serialNumberId: string | null
                quantity: Decimal
            }> = []

            for (const line of header.lines) {
                const openReserve = new Decimal(line.reservedQuantity).minus(line.allocatedQuantity)
                if (openReserve.lte(0)) continue

                const custom = customByLine.get(line.id)
                const candidates = await this.loadCandidates(
                    tx,
                    header.companyId,
                    header.warehouseId,
                    line.materialId,
                    line.stockStatus,
                    line.batchId,
                    line.serialNumberId,
                )

                await this.validateMaterialTraceability(line.materialId, custom, candidates)

                const picks = this.strategies.plan(strategy, {
                    companyId: header.companyId,
                    warehouseId: header.warehouseId,
                    materialId: line.materialId,
                    quantity: custom ? new Decimal(custom.quantity) : openReserve,
                    batchId: line.batchId,
                    serialNumberId: line.serialNumberId,
                    stockStatus: line.stockStatus,
                    customLines: custom
                        ? [{ storageBinId: custom.storageBinId, quantity: custom.quantity, batchId: custom.batchId, serialNumberId: custom.serialNumberId }]
                        : undefined,
                }, candidates)

                let plannedQty = new Decimal(0)
                for (const pick of picks) {
                    await this.assertBinAvailable(tx, header.companyId, header.warehouseId, line.materialId, pick)
                    plannedLines.push({
                        reservationLineId: line.id,
                        storageBinId: pick.storageBinId,
                        materialId: line.materialId,
                        batchId: pick.batchId ?? line.batchId,
                        serialNumberId: pick.serialNumberId ?? line.serialNumberId,
                        quantity: pick.availableQuantity,
                    })
                    plannedQty = plannedQty.plus(pick.availableQuantity)
                }

                if (plannedQty.gt(openReserve)) {
                    throw new BadRequestException('Allocation exceeds open reserved quantity')
                }
            }

            for (const pl of plannedLines) {
                await tx.mmInventoryAllocationLine.create({
                    data: {
                        allocationId: alloc.id,
                        reservationLineId: pl.reservationLineId,
                        warehouseId: header.warehouseId,
                        storageBinId: pl.storageBinId,
                        materialId: pl.materialId,
                        batchId: pl.batchId,
                        serialNumberId: pl.serialNumberId,
                        quantity: pl.quantity,
                        status: 'ACTIVE',
                    },
                })

                const rLine = header.lines.find((l) => l.id === pl.reservationLineId)!
                const newAllocated = new Decimal(rLine.allocatedQuantity).plus(pl.quantity)
                await tx.mmInventoryReservationLine.update({
                    where: { id: pl.reservationLineId },
                    data: {
                        allocatedQuantity: newAllocated,
                        status: newAllocated.gte(rLine.reservedQuantity) ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED',
                    },
                })
            }

            await this.refreshHeaderAllocationStatus(tx, header.id)
            return tx.mmInventoryAllocation.findUnique({
                where: { id: alloc.id },
                include: this.includes,
            })
        })

        if (dto.generatePickTasks !== false && allocation) {
            await this.generatePickTasks(allocation.id)
        }

        return allocation!
    }

    async release(id: string) {
        const allocation = await this.findOne(id)
        if (allocation.status === 'RELEASED') {
            throw new BadRequestException('Allocation already released')
        }

        return this.prisma.$transaction(async (tx) => {
            for (const line of allocation.lines) {
                const open = new Decimal(line.quantity).minus(line.issuedQuantity)
                if (open.lte(0)) continue
                const rLine = await tx.mmInventoryReservationLine.findUnique({
                    where: { id: line.reservationLineId },
                })
                if (rLine) {
                    await tx.mmInventoryReservationLine.update({
                        where: { id: rLine.id },
                        data: {
                            allocatedQuantity: Decimal.max(
                                new Decimal(0),
                                new Decimal(rLine.allocatedQuantity).minus(open),
                            ),
                        },
                    })
                }
                await tx.mmInventoryAllocationLine.update({
                    where: { id: line.id },
                    data: { status: 'RELEASED' },
                })
            }
            await this.refreshHeaderAllocationStatus(tx, allocation.headerId)
            return tx.mmInventoryAllocation.update({
                where: { id },
                data: { status: 'RELEASED' },
                include: this.includes,
            })
        })
    }

    async releaseByHeader(headerId: string) {
        const allocs = await this.prisma.mmInventoryAllocation.findMany({
            where: { headerId, status: { not: 'RELEASED' } },
        })
        for (const a of allocs) {
            await this.release(a.id)
        }
    }

    async generatePickTasks(allocationId: string) {
        const allocation = await this.findOne(allocationId)
        const header = allocation.header
        const tasks = []

        for (const line of allocation.lines) {
            if (line.status !== 'ACTIVE') continue
            const open = new Decimal(line.quantity).minus(line.pickedQuantity)
            if (open.lte(0)) continue

            const legacy = await this.prisma.mmInventoryReservation.findFirst({
                where: { reservationLineId: line.reservationLineId },
            })

            const pick = await this.picking.create({
                warehouseId: line.warehouseId,
                companyId: header.companyId,
                sourceBinId: line.storageBinId,
                materialId: line.materialId,
                requiredQty: Number(open),
                batchId: line.batchId ?? undefined,
                serialId: line.serialNumberId ?? undefined,
                reservationId: legacy?.id,
                reservationHeaderId: header.id,
                reservationLineId: line.reservationLineId,
                allocationLineId: line.id,
                sourceDocument: header.reservationNumber,
            } as any)

            tasks.push(pick)
        }

        await this.prisma.mmInventoryReservationHeader.update({
            where: { id: header.id },
            data: { status: 'PICKING' },
        })

        return tasks
    }

    async recordPick(allocationLineId: string, quantity: Decimal) {
        const line = await this.prisma.mmInventoryAllocationLine.findUnique({
            where: { id: allocationLineId },
            include: { reservationLine: { include: { header: true } } },
        })
        if (!line) throw new NotFoundException('Allocation line not found')

        const newPicked = new Decimal(line.pickedQuantity).plus(quantity)
        await this.prisma.mmInventoryAllocationLine.update({
            where: { id: line.id },
            data: {
                pickedQuantity: newPicked,
                status: newPicked.gte(line.quantity) ? 'COMPLETED' : 'ACTIVE',
            },
        })

        await this.prisma.mmInventoryReservationLine.update({
            where: { id: line.reservationLineId },
            data: {
                pickedQuantity: new Decimal(line.reservationLine.pickedQuantity).plus(quantity),
            },
        })

        const headerId = line.reservationLine.headerId
        const lines = await this.prisma.mmInventoryReservationLine.findMany({
            where: { headerId },
        })
        const allPicked = lines.every((l) =>
            new Decimal(l.pickedQuantity).gte(l.allocatedQuantity),
        )
        await this.prisma.mmInventoryReservationHeader.update({
            where: { id: headerId },
            data: { status: allPicked ? 'FULLY_PICKED' : 'PARTIALLY_PICKED' },
        })
    }

    async recordIssue(allocationLineId: string, quantity: Decimal, tx?: import('@prisma/client').Prisma.TransactionClient) {
        const client = tx ?? this.prisma
        const line = await client.mmInventoryAllocationLine.findUnique({
            where: { id: allocationLineId },
        })
        if (!line) throw new NotFoundException('Allocation line not found')

        const updated = await client.mmInventoryAllocationLine.updateMany({
            where: { id: line.id, version: line.version ?? 0 },
            data: {
                issuedQuantity: new Decimal(line.issuedQuantity ?? 0).plus(quantity),
                version: { increment: 1 },
            },
        })
        if (updated.count === 0) {
            throw new BadRequestException('Concurrent allocation issue conflict — retry')
        }

        await this.reservations.recordIssue(line.reservationLineId, quantity, client)
    }

    private async loadCandidates(
        tx: import('@prisma/client').Prisma.TransactionClient,
        companyId: string,
        warehouseId: string,
        materialId: string,
        stockStatus: string,
        batchId?: string | null,
        serialNumberId?: string | null,
    ): Promise<AllocationCandidate[]> {
        const balances = await tx.mmInventoryBalance.findMany({
            where: {
                companyId,
                warehouseId,
                materialId,
                stockStatus,
                storageBinId: { not: null },
                ...(batchId ? { batchId } : {}),
                ...(serialNumberId ? { serialNumberId } : {}),
            },
            include: { storageBin: true, batch: true },
        })

        const material = await tx.mmMaterial.findUnique({
            where: { id: materialId },
            select: { defaultWarehouseId: true, materialCode: true },
        })

        return balances
            .filter((b) => new Decimal(b.availableQuantity).gt(0))
            .map((b) => ({
                storageBinId: b.storageBinId!,
                batchId: b.batchId,
                serialNumberId: b.serialNumberId,
                availableQuantity: new Decimal(b.availableQuantity),
                binCode: b.storageBin?.code,
                batchExpiry: b.batch?.expiryDate ?? null,
                priority: material?.defaultWarehouseId === warehouseId ? 0 : 999,
            }))
    }

    private async assertBinAvailable(
        tx: import('@prisma/client').Prisma.TransactionClient,
        companyId: string,
        warehouseId: string,
        materialId: string,
        pick: AllocationCandidate,
    ) {
        const bal = await tx.mmInventoryBalance.findFirst({
            where: {
                companyId,
                warehouseId,
                materialId,
                storageBinId: pick.storageBinId,
                batchId: pick.batchId,
                serialNumberId: pick.serialNumberId,
                stockStatus: 'UNRESTRICTED',
            },
        })
        if (!bal || new Decimal(bal.availableQuantity).lt(pick.availableQuantity)) {
            throw new BadRequestException(
                `Insufficient bin stock at ${pick.storageBinId} for allocation`,
            )
        }
    }

    private async validateMaterialTraceability(
        materialId: string,
        custom: CustomAllocationLineDto | undefined,
        candidates: AllocationCandidate[],
    ) {
        const material = await this.prisma.mmMaterial.findUnique({ where: { id: materialId } })
        if (!material) throw new BadRequestException('Material not found')
        if (material.batchManaged && custom && !custom.batchId) {
            throw new BadRequestException('Batch is required for batch-managed material')
        }
        if (material.serialManaged && custom && !custom.serialNumberId) {
            throw new BadRequestException('Serial is required for serial-managed material')
        }
        void candidates
    }

    private async refreshHeaderAllocationStatus(
        tx: import('@prisma/client').Prisma.TransactionClient,
        headerId: string,
    ) {
        const lines = await tx.mmInventoryReservationLine.findMany({ where: { headerId } })
        const allAllocated = lines.every((l) =>
            new Decimal(l.allocatedQuantity).gte(l.reservedQuantity),
        )
        const anyAllocated = lines.some((l) => new Decimal(l.allocatedQuantity).gt(0))
        const status = allAllocated ? 'ALLOCATED' : anyAllocated ? 'PARTIALLY_ALLOCATED' : 'RESERVED'
        await tx.mmInventoryReservationHeader.update({
            where: { id: headerId },
            data: { status },
        })
    }

    private async nextAllocationNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `ALC-${today}-`
        const last = await this.prisma.mmInventoryAllocation.findFirst({
            where: { allocationNumber: { startsWith: pfx } },
            orderBy: { allocationNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.allocationNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
