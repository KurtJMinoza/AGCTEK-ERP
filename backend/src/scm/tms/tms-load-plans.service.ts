import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common'
import {
    LoadPlanStatus,
    Prisma,
    ShipmentStatus,
    TripStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { VehiclesService } from '../vehicles/vehicles.service'
import {
    assertFound,
    optionalString,
    parsePagination,
    requireInt,
    requireString,
    type ListQuery,
} from '../scm.utils'
import {
    ACTIVE_LOAD_PLAN_STATES,
    EDITABLE_LOAD_PLAN_STATES,
    buildTripStops,
    checkLoadCapacity,
    type StopSourceLine,
} from './tms.rules'

export const shipmentLineInclude = {
    shipment: {
        select: {
            id: true,
            reference: true,
            customerName: true,
            status: true,
            movementType: true,
            earliestDeliveryAt: true,
            latestDeliveryAt: true,
            isFragile: true,
            requiresColdChain: true,
        },
    },
    shipFromWarehouse: { select: { id: true, code: true, name: true, address: true } },
    returnWarehouse: { select: { id: true, code: true, name: true, address: true } },
} satisfies Prisma.ShipmentLineInclude

export const loadPlanInclude = {
    vehicle: true,
    lines: {
        orderBy: { createdAt: 'asc' as const },
        include: { shipmentLine: { include: shipmentLineInclude } },
    },
    trips: {
        where: { status: { not: TripStatus.CANCELLED } },
        select: { id: true, code: true, status: true },
    },
} satisfies Prisma.LoadPlanInclude

type LoadPlanWithLines = Prisma.LoadPlanGetPayload<{ include: typeof loadPlanInclude }>
type ShipmentLineWithRefs = Prisma.ShipmentLineGetPayload<{
    include: typeof shipmentLineInclude
}>

/** ShipmentLine (+ load plan line id) → stop builder input. */
export function toStopSource(
    loadPlanLineId: string,
    line: ShipmentLineWithRefs,
): StopSourceLine {
    return {
        loadPlanLineId,
        shipmentLineId: line.id,
        shipmentId: line.shipmentId,
        customerName: line.shipment.customerName,
        ship:
            line.shipFromWarehouseId || line.shipFromAddress
                ? {
                      warehouseId: line.shipFromWarehouseId,
                      warehouseName: line.shipFromWarehouse?.name ?? null,
                      address:
                          line.shipFromAddress ??
                          line.shipFromWarehouse?.address ??
                          line.shipFromWarehouse?.name ??
                          null,
                      lat: line.shipFromLat,
                      lng: line.shipFromLng,
                  }
                : null,
        to: { address: line.shipToAddress, lat: line.shipToLat, lng: line.shipToLng },
        ret:
            line.returnWarehouseId || line.returnAddress
                ? {
                      warehouseId: line.returnWarehouseId,
                      warehouseName: line.returnWarehouse?.name ?? null,
                      address:
                          line.returnAddress ??
                          line.returnWarehouse?.address ??
                          line.returnWarehouse?.name ??
                          null,
                      lat: line.returnLat,
                      lng: line.returnLng,
                  }
                : null,
        earliestDeliveryAt: line.shipment.earliestDeliveryAt,
        latestDeliveryAt: line.shipment.latestDeliveryAt,
    }
}

function isUniqueViolation(err: unknown): boolean {
    return (
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    )
}

@Injectable()
export class TmsLoadPlansService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly vehiclesService: VehiclesService,
    ) {}

    withSummary(plan: LoadPlanWithLines) {
        const capacity = checkLoadCapacity(
            plan.vehicle,
            plan.lines.map((l) => ({
                qty: l.assignedQty,
                weightKg: l.weightKg,
                volumeM3: l.volumeM3,
            })),
        )
        return { ...plan, lineCount: plan.lines.length, capacity }
    }

    async findAll(query: ListQuery & { vehicleId?: string; active?: string }) {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.LoadPlanWhereInput = {}
        if (query.vehicleId) where.vehicleId = query.vehicleId
        if (query.status) {
            const statuses = query.status.split(',').map((s) => s.trim())
            if (statuses.some((s) => !(s in LoadPlanStatus))) {
                throw new BadRequestException('Invalid load plan status')
            }
            where.status = { in: statuses as LoadPlanStatus[] }
        } else if (query.active === 'true') {
            where.status = { in: ACTIVE_LOAD_PLAN_STATES as LoadPlanStatus[] }
        }
        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { code: { contains: q, mode: 'insensitive' } },
                { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } },
                { vehicle: { code: { contains: q, mode: 'insensitive' } } },
            ]
        }
        const [rows, total] = await this.prisma.$transaction([
            this.prisma.loadPlan.findMany({
                where,
                include: loadPlanInclude,
                orderBy: { updatedAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.loadPlan.count({ where }),
        ])
        return { data: rows.map((p) => this.withSummary(p)), total, page, pageSize }
    }

    async findOne(id: string) {
        const plan = assertFound(
            await this.prisma.loadPlan.findUnique({
                where: { id },
                include: loadPlanInclude,
            }),
            'Load plan not found',
        )
        return this.withSummary(plan)
    }

    /** READY shipments' lines not yet on any load plan. */
    async availableLines(query: { search?: string }) {
        const where: Prisma.ShipmentLineWhereInput = {
            loadPlanLine: { is: null },
            shipment: { status: ShipmentStatus.READY },
        }
        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { shipment: { reference: { contains: q, mode: 'insensitive' } } },
                { shipment: { customerName: { contains: q, mode: 'insensitive' } } },
                { shipToAddress: { contains: q, mode: 'insensitive' } },
                { materialCode: { contains: q, mode: 'insensitive' } },
            ]
        }
        const data = await this.prisma.shipmentLine.findMany({
            where,
            include: shipmentLineInclude,
            orderBy: [{ shipment: { createdAt: 'asc' } }, { lineNo: 'asc' }],
            take: 200,
        })
        return { data, total: data.length }
    }

    async create(body: { vehicleId?: unknown; notes?: unknown }, userId?: string) {
        const vehicleId = requireString(body.vehicleId, 'vehicleId')
        const vehicle = await this.vehiclesService.findOne(vehicleId)
        if (this.vehiclesService.isBlockedFromRouting(vehicle)) {
            throw new BadRequestException(
                'Vehicle is blocked from routing (maintenance, documents or inactive status)',
            )
        }
        if (!vehicle.capacityQty || vehicle.capacityQty <= 0) {
            throw new BadRequestException(
                'Vehicle item capacity (capacityQty) must be set before load building',
            )
        }
        const active = await this.prisma.loadPlan.findFirst({
            where: {
                vehicleId,
                status: { in: ACTIVE_LOAD_PLAN_STATES as LoadPlanStatus[] },
            },
            select: { code: true, status: true },
        })
        if (active) {
            throw new ConflictException(
                `Vehicle already has active load plan ${active.code} (${active.status})`,
            )
        }

        const code = `LP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random()
            .toString(36)
            .slice(2, 6)
            .toUpperCase()}`
        try {
            const plan = await this.prisma.loadPlan.create({
                data: {
                    code,
                    vehicleId,
                    notes: optionalString(body.notes) ?? null,
                    createdBy: userId ?? null,
                },
            })
            return this.findOne(plan.id)
        } catch (err) {
            if (isUniqueViolation(err)) {
                throw new ConflictException('Vehicle already has an active load plan')
            }
            throw err
        }
    }

    /** Assign a whole shipment line (no splitting) with a server-side capacity check. */
    async addLine(
        id: string,
        body: { shipmentLineId?: unknown; assignedQty?: unknown },
    ) {
        const shipmentLineId = requireString(body.shipmentLineId, 'shipmentLineId')

        try {
            await this.prisma.$transaction(async (tx) => {
                const plan = await this.lockPlan(tx, id)
                this.assertEditable(plan.status)

                const line = assertFound(
                    await tx.shipmentLine.findUnique({
                        where: { id: shipmentLineId },
                        include: {
                            shipment: true,
                            loadPlanLine: { include: { loadPlan: { select: { code: true } } } },
                        },
                    }),
                    'Shipment line not found',
                )
                if (line.loadPlanLine) {
                    throw new ConflictException(
                        `Shipment line is already on load plan ${line.loadPlanLine.loadPlan.code}`,
                    )
                }
                if (line.shipment.status !== ShipmentStatus.READY) {
                    throw new BadRequestException(
                        `Only lines of READY shipments can be loaded (${line.shipment.reference} is ${line.shipment.status})`,
                    )
                }
                const assignedQty =
                    body.assignedQty == null || body.assignedQty === ''
                        ? line.quantity
                        : requireInt(body.assignedQty, 'assignedQty')
                if (assignedQty !== line.quantity) {
                    throw new BadRequestException(
                        `Line splitting is not supported — assign the full quantity (${line.quantity})`,
                    )
                }

                const existing = await tx.loadPlanLine.findMany({
                    where: { loadPlanId: id },
                    select: { assignedQty: true, weightKg: true, volumeM3: true },
                })
                const capacity = checkLoadCapacity(plan.vehicle, [
                    ...existing.map((l) => ({
                        qty: l.assignedQty,
                        weightKg: l.weightKg,
                        volumeM3: l.volumeM3,
                    })),
                    { qty: assignedQty, weightKg: line.weightKg, volumeM3: line.volumeM3 },
                ])
                if (!capacity.ok) {
                    throw new BadRequestException(capacity.message)
                }

                await tx.loadPlanLine.create({
                    data: {
                        loadPlanId: id,
                        shipmentLineId,
                        assignedQty,
                        weightKg: line.weightKg,
                        volumeM3: line.volumeM3,
                    },
                })
                await this.recalc(tx, id)
                await this.syncShipmentStatus(tx, [line.shipmentId])
            })
        } catch (err) {
            if (isUniqueViolation(err)) {
                throw new ConflictException('Shipment line is already on a load plan')
            }
            throw err
        }
        return this.findOne(id)
    }

    async removeLine(id: string, lineId: string) {
        await this.prisma.$transaction(async (tx) => {
            const plan = await this.lockPlan(tx, id)
            this.assertEditable(plan.status)
            const line = assertFound(
                await tx.loadPlanLine.findFirst({
                    where: { id: lineId, loadPlanId: id },
                    include: { shipmentLine: { select: { shipmentId: true } } },
                }),
                'Load plan line not found',
            )
            await tx.loadPlanLine.delete({ where: { id: line.id } })
            await this.recalc(tx, id)
            await this.syncShipmentStatus(tx, [line.shipmentLine.shipmentId])
        })
        return this.findOne(id)
    }

    /** DRAFT → VALIDATED: cargo present, capacity OK, every line has SHIP + TO locations. */
    async validate(id: string) {
        const plan = await this.findOne(id)
        if (plan.status === LoadPlanStatus.VALIDATED) return plan
        if (plan.status !== LoadPlanStatus.DRAFT) {
            throw new ConflictException(`Cannot validate a ${plan.status} load plan`)
        }
        this.assertCargoValid(plan)
        await this.transition(id, LoadPlanStatus.DRAFT, {
            status: LoadPlanStatus.VALIDATED,
            validatedAt: new Date(),
        })
        return this.findOne(id)
    }

    /** VALIDATED → READY (trip candidate). */
    async ready(id: string) {
        const plan = await this.findOne(id)
        if (plan.status === LoadPlanStatus.READY) return plan
        if (plan.status !== LoadPlanStatus.VALIDATED) {
            throw new ConflictException(
                `Load plan must be VALIDATED before READY (current: ${plan.status})`,
            )
        }
        this.assertCargoValid(plan)
        await this.transition(id, LoadPlanStatus.VALIDATED, {
            status: LoadPlanStatus.READY,
            readyAt: new Date(),
        })
        return this.findOne(id)
    }

    /** VALIDATED / READY → DRAFT to edit cargo again (only while no trip holds it). */
    async reopen(id: string) {
        const plan = await this.findOne(id)
        if (plan.status === LoadPlanStatus.DRAFT) return plan
        if (
            plan.status !== LoadPlanStatus.VALIDATED &&
            plan.status !== LoadPlanStatus.READY
        ) {
            throw new ConflictException(`Cannot reopen a ${plan.status} load plan`)
        }
        await this.transition(id, plan.status, {
            status: LoadPlanStatus.DRAFT,
            validatedAt: null,
            readyAt: null,
        })
        return this.findOne(id)
    }

    /** Cancel a plan before it is on a trip; cargo lines are released. */
    async cancel(id: string) {
        const plan = await this.findOne(id)
        if (
            plan.status !== LoadPlanStatus.DRAFT &&
            plan.status !== LoadPlanStatus.VALIDATED &&
            plan.status !== LoadPlanStatus.READY
        ) {
            throw new ConflictException(
                `Cannot cancel a ${plan.status} load plan — cancel its trip first`,
            )
        }
        const shipmentIds = [...new Set(plan.lines.map((l) => l.shipmentLine.shipmentId))]
        await this.prisma.$transaction(async (tx) => {
            const res = await tx.loadPlan.updateMany({
                where: { id, status: plan.status },
                data: { status: LoadPlanStatus.CANCELLED },
            })
            if (res.count === 0) {
                throw new ConflictException('Load plan changed concurrently — reload and retry')
            }
            await tx.loadPlanLine.deleteMany({ where: { loadPlanId: id } })
            await this.recalc(tx, id)
            await this.syncShipmentStatus(tx, shipmentIds)
        })
        return this.findOne(id)
    }

    // ─── internals ──────────────────────────────────────────────────────────

    private assertEditable(status: LoadPlanStatus) {
        if (!(EDITABLE_LOAD_PLAN_STATES as LoadPlanStatus[]).includes(status)) {
            throw new ConflictException(
                `Load plan is ${status} — reopen it to change cargo`,
            )
        }
    }

    private assertCargoValid(plan: ReturnType<TmsLoadPlansService['withSummary']>) {
        if (plan.lines.length === 0) {
            throw new BadRequestException('Load plan has no cargo lines')
        }
        if (this.vehiclesService.isBlockedFromRouting(plan.vehicle)) {
            throw new BadRequestException('Vehicle is blocked from routing')
        }
        if (!plan.capacity.ok) {
            throw new BadRequestException(plan.capacity.message)
        }
        const notReady = plan.lines.filter(
            (l) =>
                l.shipmentLine.shipment.status !== ShipmentStatus.READY &&
                l.shipmentLine.shipment.status !== ShipmentStatus.ASSIGNED,
        )
        if (notReady.length > 0) {
            throw new BadRequestException(
                `Shipments no longer loadable: ${notReady
                    .map((l) => `${l.shipmentLine.shipment.reference} (${l.shipmentLine.shipment.status})`)
                    .join(', ')}`,
            )
        }
        const { errors } = buildTripStops(
            plan.lines.map((l) => toStopSource(l.id, l.shipmentLine)),
        )
        if (errors.length > 0) {
            throw new BadRequestException(errors.join('; '))
        }
    }

    private async transition(
        id: string,
        from: LoadPlanStatus,
        data: Prisma.LoadPlanUpdateManyMutationInput,
    ) {
        const res = await this.prisma.loadPlan.updateMany({
            where: { id, status: from },
            data,
        })
        if (res.count === 0) {
            throw new ConflictException('Load plan changed concurrently — reload and retry')
        }
    }

    /** Row lock serialises concurrent line changes on one plan (capacity race). */
    private async lockPlan(tx: Prisma.TransactionClient, id: string) {
        await tx.$queryRaw`SELECT "id" FROM "LoadPlan" WHERE "id" = ${id} FOR UPDATE`
        return assertFound(
            await tx.loadPlan.findUnique({ where: { id }, include: { vehicle: true } }),
            'Load plan not found',
        )
    }

    private async recalc(tx: Prisma.TransactionClient, id: string) {
        const lines = await tx.loadPlanLine.findMany({
            where: { loadPlanId: id },
            select: { assignedQty: true, weightKg: true, volumeM3: true },
        })
        const totalQty = lines.reduce((s, l) => s + l.assignedQty, 0)
        const totalWeightKg = lines.reduce((s, l) => s + (l.weightKg ?? 0), 0)
        const totalVolumeM3 = lines.reduce((s, l) => s + (l.volumeM3 ?? 0), 0)
        const plan = await tx.loadPlan.findUniqueOrThrow({
            where: { id },
            select: { status: true },
        })
        await tx.loadPlan.update({
            where: { id },
            data: {
                totalQty,
                totalWeightKg,
                totalVolumeM3,
                // any cargo edit invalidates a previous validation
                ...(plan.status === LoadPlanStatus.VALIDATED
                    ? { status: LoadPlanStatus.DRAFT, validatedAt: null }
                    : {}),
            },
        })
    }

    /** Shipment is ASSIGNED once all its lines are on load plans; READY otherwise. */
    private async syncShipmentStatus(tx: Prisma.TransactionClient, shipmentIds: string[]) {
        for (const shipmentId of shipmentIds) {
            const shipment = await tx.shipment.findUnique({
                where: { id: shipmentId },
                select: {
                    status: true,
                    lines: { select: { loadPlanLine: { select: { id: true } } } },
                },
            })
            if (!shipment) continue
            if (
                shipment.status !== ShipmentStatus.READY &&
                shipment.status !== ShipmentStatus.ASSIGNED
            ) {
                continue
            }
            const allLoaded =
                shipment.lines.length > 0 &&
                shipment.lines.every((l) => l.loadPlanLine != null)
            const next = allLoaded ? ShipmentStatus.ASSIGNED : ShipmentStatus.READY
            if (next !== shipment.status) {
                await tx.shipment.update({ where: { id: shipmentId }, data: { status: next } })
            }
        }
    }
}
