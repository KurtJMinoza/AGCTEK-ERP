import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    forwardRef,
    Logger,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { CreatePackageDto } from './dto/create-package.dto'
import { PackageQueryDto } from './dto/package-query.dto'
import { OpenPackingSessionDto, PackingSessionQueryDto } from './dto/packing-session.dto'
import { Decimal } from '@prisma/client/runtime/library'
import { ShipmentsService } from '../../../scm/shipments/shipments.service'

/**
 * Pack flow: Pick → Packing → Package → Verification → READY_FOR_DISPATCH
 * Dispatch-ready only when scanned contents match expected quantities.
 * READY_FOR_DISPATCH auto-releases an SCM Shipment (customer outbound).
 */
@Injectable()
export class PackingService {
    private readonly logger = new Logger(PackingService.name)

    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => ShipmentsService))
        private readonly shipmentsService: ShipmentsService,
    ) {}

    private readonly listIncludes = {
        items: true,
        warehouse: true,
        pickingTask: true,
        reservation: true,
    }

    private readonly detailIncludes = {
        items: { include: { material: true } },
        warehouse: true,
        pickingTask: {
            include: {
                salesOrder: {
                    select: {
                        orderNumber: true,
                        customerName: true,
                        customerEmail: true,
                        shipToName: true,
                        shipToPhone: true,
                        shipToAddressLine1: true,
                        shipToCity: true,
                        shipToRegion: true,
                        shipToPostalCode: true,
                        shipToCountry: true,
                    },
                },
            },
        },
        reservation: true,
        packingSession: true,
    }

    private readonly sessionIncludes = {
        warehouse: true,
        pickingTask: true,
        warehouseTask: true,
        packages: { include: { items: true } },
    }

    async findAllSessions(query: PackingSessionQueryDto) {
        const where: Record<string, string> = {}
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.status) where.status = query.status
        return this.prisma.wmPackingSession.findMany({
            where,
            include: this.sessionIncludes,
            orderBy: { createdAt: 'desc' },
        })
    }

    async findSession(id: string) {
        const session = await this.prisma.wmPackingSession.findUnique({
            where: { id },
            include: this.sessionIncludes,
        })
        if (!session) throw new NotFoundException('Packing session not found')
        return session
    }

    private async nextSessionNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `PS-${today}-`
        const last = await this.prisma.wmPackingSession.findFirst({
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

    async openSession(dto: OpenPackingSessionDto) {
        const sessionNumber = await this.nextSessionNumber()
        return this.prisma.wmPackingSession.create({
            data: {
                sessionNumber,
                warehouseId: dto.warehouseId,
                pickingTaskId: dto.pickingTaskId ?? null,
                warehouseTaskId: dto.warehouseTaskId ?? null,
                createdBy: dto.createdBy ?? null,
                status: 'OPEN',
            },
            include: this.sessionIncludes,
        })
    }

    async openSessionFromPicking(pickingTaskId: string) {
        const task = await this.prisma.wmPickingTask.findUnique({
            where: { id: pickingTaskId },
        })
        if (!task) throw new NotFoundException('Picking task not found')

        const existing = await this.prisma.wmPackingSession.findFirst({
            where: { pickingTaskId, status: 'OPEN' },
            include: this.sessionIncludes,
        })
        if (existing) return existing

        return this.openSession({
            warehouseId: task.warehouseId,
            pickingTaskId: task.id,
            warehouseTaskId: task.warehouseTaskId ?? undefined,
        })
    }

    async completeSession(id: string) {
        const session = await this.findSession(id)
        if (session.status !== 'OPEN') {
            throw new BadRequestException(`Cannot complete session in status ${session.status}`)
        }
        return this.prisma.wmPackingSession.update({
            where: { id },
            data: { status: 'COMPLETED', completedAt: new Date() },
            include: this.sessionIncludes,
        })
    }

    async findAll(query: PackageQueryDto) {
        const {
            page = 1,
            limit = 20,
            warehouseId,
            status,
            orderNumber,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = query

        const where: any = {}
        if (warehouseId) where.warehouseId = warehouseId
        if (status) where.status = status
        if (orderNumber) where.orderNumber = { contains: orderNumber, mode: 'insensitive' }
        if (search) {
            where.OR = [
                { packageNumber: { contains: search, mode: 'insensitive' } },
                { orderNumber: { contains: search, mode: 'insensitive' } },
                { trackingNumber: { contains: search, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await Promise.all([
            this.prisma.wmPackage.findMany({
                where,
                include: this.listIncludes,
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.wmPackage.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const pkg = await this.prisma.wmPackage.findUnique({
            where: { id },
            include: this.detailIncludes,
        })
        if (!pkg) throw new NotFoundException('Package not found')
        return {
            ...pkg,
            // Weight / dimensions prefilled from the Material Master (Physical
            // fields). Non-persisted suggestion — the packer can override and
            // values are saved on Seal.
            suggestedMeasurements: this.suggestMeasurements(
                pkg.items as unknown as Array<{
                    expectedQty: unknown
                    material?: {
                        weight?: unknown
                        weightUom?: string | null
                        length?: unknown
                        width?: unknown
                        height?: unknown
                        dimensionUom?: string | null
                    } | null
                }>,
            ),
        }
    }

    private static readonly WEIGHT_TO_KG: Record<string, number> = {
        KG: 1, KGS: 1, KILOGRAM: 1, KILOGRAMS: 1,
        G: 0.001, GRAM: 0.001, GRAMS: 0.001,
        MG: 0.000001,
        LB: 0.45359237, LBS: 0.45359237, POUND: 0.45359237, POUNDS: 0.45359237,
        OZ: 0.028349523125, OUNCE: 0.028349523125, OUNCES: 0.028349523125,
        T: 1000, TON: 1000, TONNE: 1000, TONNES: 1000,
    }

    private static readonly DIM_TO_CM: Record<string, number> = {
        MM: 0.1, MILLIMETER: 0.1, MILLIMETERS: 0.1,
        CM: 1, CENTIMETER: 1, CENTIMETERS: 1,
        M: 100, METER: 100, METERS: 100,
        IN: 2.54, INCH: 2.54, INCHES: 2.54,
        FT: 30.48, FOOT: 30.48, FEET: 30.48,
    }

    /**
     * Package measurement suggestion from Material Master physical fields.
     * Weight = Σ(unit weight × qty) normalized to kg; L/W = largest unit
     * footprint; H = stacked height. Returns nulls when materials have no
     * physical data — the packer then enters values manually.
     */
    private suggestMeasurements(
        items: Array<{
            expectedQty: unknown
            material?: {
                weight?: unknown
                weightUom?: string | null
                length?: unknown
                width?: unknown
                height?: unknown
                dimensionUom?: string | null
            } | null
        }>,
    ) {
        let weightKg = 0
        let weightSeen = false
        let length = 0
        let width = 0
        let height = 0
        let dimSeen = false

        for (const item of items) {
            const m = item.material
            if (!m) continue
            const qty = Number(item.expectedQty) || 0

            const unitWeight = Number(m.weight ?? 0)
            if (unitWeight > 0) {
                const unit = (m.weightUom ?? 'KG').toUpperCase()
                weightKg +=
                    unitWeight * (PackingService.WEIGHT_TO_KG[unit] ?? 1) * qty
                weightSeen = true
            }

            const dimUnit = (m.dimensionUom ?? 'CM').toUpperCase()
            const f = PackingService.DIM_TO_CM[dimUnit] ?? 1
            const l = Number(m.length ?? 0)
            const w = Number(m.width ?? 0)
            const h = Number(m.height ?? 0)
            if (l > 0 || w > 0 || h > 0) dimSeen = true
            if (l > 0) length = Math.max(length, l * f)
            if (w > 0) width = Math.max(width, w * f)
            if (h > 0) height += h * f * qty
        }

        const round = (v: number, d = 2) =>
            Math.round(v * 10 ** d) / 10 ** d

        return {
            weightKg: weightSeen ? round(weightKg, 3) : null,
            length: dimSeen && length > 0 ? round(length) : null,
            width: dimSeen && width > 0 ? round(width) : null,
            height: dimSeen && height > 0 ? round(height) : null,
            source: 'MATERIAL_MASTER' as const,
        }
    }

    async create(dto: CreatePackageDto) {
        const packageNumber = await this.generateNextCode()
        const companyId = await this.resolvePackageCompanyId(dto)

        return this.prisma.wmPackage.create({
            data: {
                packageNumber,
                companyId,
                warehouseId: dto.warehouseId,
                orderNumber: dto.orderNumber ?? null,
                pickingTaskId: dto.pickingTaskId ?? null,
                packingSessionId: dto.packingSessionId ?? null,
                reservationId: dto.reservationId ?? null,
                packageType: dto.packageType ?? null,
                weight: dto.weight ?? null,
                length: dto.length ?? null,
                width: dto.width ?? null,
                height: dto.height ?? null,
                carrier: dto.carrier ?? null,
                trackingNumber: dto.trackingNumber ?? null,
                status: 'OPEN',
                items: {
                    create: dto.items.map((item) => ({
                        materialId: item.materialId,
                        expectedQty: item.expectedQty,
                        batchId: item.batchId ?? null,
                        serialId: item.serialId ?? null,
                        status: 'PENDING',
                    })),
                },
            },
            include: this.detailIncludes,
        })
    }

    /**
     * Every package carries the Sales Order companyId (Organization / MM
     * company). It is resolved from the picking task, reservation or order
     * number the package belongs to — never accepted from the client — so a
     * package can never be created for a different company than its order.
     */
    private async resolvePackageCompanyId(
        dto: CreatePackageDto,
    ): Promise<string | null> {
        if (dto.pickingTaskId) {
            const pick = await this.prisma.wmPickingTask.findUnique({
                where: { id: dto.pickingTaskId },
                select: { companyId: true },
            })
            if (pick?.companyId) return pick.companyId
        }
        if (dto.reservationId) {
            const reservation = await this.prisma.mmInventoryReservation.findUnique(
                {
                    where: { id: dto.reservationId },
                    select: { companyId: true },
                },
            )
            if (reservation?.companyId) return reservation.companyId
        }
        if (dto.orderNumber) {
            const order = await this.prisma.sdSalesOrder.findUnique({
                where: { orderNumber: dto.orderNumber },
                select: { companyId: true },
            })
            return order?.companyId ?? null
        }
        return null
    }

    async createFromPickingTask(pickingTaskId: string) {
        const task = await this.prisma.wmPickingTask.findUnique({
            where: { id: pickingTaskId },
            include: { material: true },
        })
        if (!task) throw new NotFoundException('Picking task not found')
        if (new Decimal(task.pickedQty).lte(0)) {
            throw new BadRequestException('Cannot pack: nothing has been picked yet')
        }

        const session = await this.openSessionFromPicking(pickingTaskId)

        // Sales orders win over reservation/source numbers so the Package
        // "Order" column always shows the commercial order (SO-00000X).
        let orderNumber = task.sourceDocument ?? task.taskNumber
        if (task.salesOrderId) {
            const so = await this.prisma.sdSalesOrder.findUnique({
                where: { id: task.salesOrderId },
                select: { orderNumber: true },
            })
            if (so?.orderNumber) orderNumber = so.orderNumber
        }

        return this.create({
            warehouseId: task.warehouseId,
            orderNumber,
            pickingTaskId: task.id,
            packingSessionId: session.id,
            reservationId: task.reservationId ?? undefined,
            items: [
                {
                    materialId: task.materialId,
                    expectedQty: Number(task.pickedQty),
                    batchId: task.batchId ?? undefined,
                    serialId: task.serialId ?? undefined,
                },
            ],
        })
    }

    async scanItem(
        packageId: string,
        materialId: string,
        quantity = 1,
        batchId?: string | null,
        serialId?: string | null,
        idempotencyKey?: string,
        user?: { id: string; userName: string } | null,
    ) {
        const pkg = await this.findOne(packageId)
        if (['SEALED', 'READY_FOR_DISPATCH', 'DISPATCHED'].includes(pkg.status)) {
            throw new BadRequestException(`Cannot scan items on a ${pkg.status} package`)
        }

        const item = await this.prisma.wmPackageItem.findFirst({
            where: {
                packageId,
                materialId,
                ...(batchId ? { batchId } : {}),
                ...(serialId ? { serialId } : {}),
            },
        })
        if (!item) throw new NotFoundException('Matching package item not found')

        if (idempotencyKey) {
            // Exact match already fully scanned — treat as idempotent no-op
            if (
                new Decimal(item.scannedQty).gte(item.expectedQty) &&
                new Decimal(item.scannedQty).eq(item.expectedQty)
            ) {
                return this.prisma.wmPackageItem.findUnique({
                    where: { id: item.id },
                    include: { material: true },
                })
            }
        }

        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: materialId },
        })
        if (material?.batchManaged && !batchId && !item.batchId) {
            throw new BadRequestException('Batch is required when packing batch-managed material')
        }
        if (material?.serialManaged && !serialId && !item.serialId) {
            throw new BadRequestException('Serial is required when packing serial-managed material')
        }

        // Packer tracking — stamped once, from the first scan (dropdown, QR or
        // barcode); the name is a snapshot so it survives user renames.
        let packedById: string | null = null
        let packedByName: string | null = null
        if (user?.id && !item.packedById) {
            const packer = await this.prisma.user.findUnique({
                where: { id: user.id },
                select: { firstName: true, lastName: true, userName: true },
            })
            packedById = user.id
            packedByName =
                [packer?.firstName, packer?.lastName]
                    .filter(Boolean)
                    .join(' ')
                    .trim() || packer?.userName || user.userName
        }

        const newScanned = new Decimal(item.scannedQty).plus(quantity)
        if (newScanned.gt(item.expectedQty)) {
            throw new BadRequestException(
                `Scan exceeds expected qty. Expected: ${item.expectedQty}, Would be: ${newScanned}`,
            )
        }
        const newStatus = newScanned.gte(item.expectedQty) ? 'SCANNED' : 'PARTIAL'

        return this.prisma.wmPackageItem.update({
            where: { id: item.id },
            data: {
                scannedQty: newScanned,
                status: newStatus,
                ...(batchId && !item.batchId ? { batchId } : {}),
                ...(serialId && !item.serialId ? { serialId } : {}),
                ...(packedById
                    ? { packedById, packedByName }
                    : {}),
            },
            include: { material: true },
        })
    }

    async verify(id: string) {
        const pkg = await this.findOne(id)

        const exceptions = pkg.items.filter(
            (item) => !new Decimal(item.scannedQty).eq(item.expectedQty),
        )

        if (exceptions.length > 0) {
            return {
                verified: false,
                exceptions: exceptions.map((item) => ({
                    id: item.id,
                    materialId: item.materialId,
                    expectedQty: item.expectedQty,
                    scannedQty: item.scannedQty,
                })),
            }
        }

        return this.prisma.wmPackage.update({
            where: { id },
            data: { status: 'VERIFIED' },
            include: this.detailIncludes,
        })
    }

    async seal(
        id: string,
        measurements?: {
            weight?: number
            length?: number
            width?: number
            height?: number
        },
    ) {
        const pkg = await this.findOne(id)
        if (pkg.status !== 'VERIFIED') {
            throw new BadRequestException('Only VERIFIED packages can be sealed')
        }
        const mismatch = pkg.items.some(
            (item) => !new Decimal(item.scannedQty).eq(item.expectedQty),
        )
        if (mismatch) {
            await this.prisma.wmPackage.update({
                where: { id },
                data: { status: 'EXCEPTION' },
            })
            throw new BadRequestException(
                'Cannot seal: package contents do not match expected order',
            )
        }
        return this.prisma.wmPackage.update({
            where: { id },
            data: {
                status: 'SEALED',
                ...(measurements?.weight !== undefined
                    ? { weight: measurements.weight }
                    : {}),
                ...(measurements?.length !== undefined
                    ? { length: measurements.length }
                    : {}),
                ...(measurements?.width !== undefined
                    ? { width: measurements.width }
                    : {}),
                ...(measurements?.height !== undefined
                    ? { height: measurements.height }
                    : {}),
            },
            include: this.detailIncludes,
        })
    }

    async markReadyForDispatch(
        id: string,
        shipTo?: {
            shipToName?: string | null
            shipToAddress?: string | null
            shipToLat?: number | null
            shipToLng?: number | null
        },
    ) {
        const pkg = await this.findOne(id)

        if (shipTo) {
            await this.prisma.wmPackage.update({
                where: { id },
                data: {
                    ...(shipTo.shipToName !== undefined
                        ? { shipToName: shipTo.shipToName?.trim() || null }
                        : {}),
                    ...(shipTo.shipToAddress !== undefined
                        ? {
                              shipToAddress:
                                  shipTo.shipToAddress?.trim() || null,
                          }
                        : {}),
                    ...(shipTo.shipToLat !== undefined
                        ? { shipToLat: shipTo.shipToLat }
                        : {}),
                    ...(shipTo.shipToLng !== undefined
                        ? { shipToLng: shipTo.shipToLng }
                        : {}),
                },
            })
        }

        const current = await this.findOne(id)

        if (current.status === 'READY_FOR_DISPATCH') {
            // Retry SCM release if package already ready but shipment missing
            try {
                const shipment =
                    await this.shipmentsService.createFromPackage(current.id)
                return {
                    ...(await this.findOne(id)),
                    scmShipment: shipment,
                    scmReleaseError: null as string | null,
                }
            } catch (err) {
                const msg =
                    err instanceof Error ? err.message : 'SCM release failed'
                return {
                    ...(await this.findOne(id)),
                    scmShipment: null,
                    scmReleaseError: msg,
                }
            }
        }

        if (current.status !== 'VERIFIED' && current.status !== 'SEALED') {
            throw new BadRequestException(
                'Package must be VERIFIED or SEALED before READY_FOR_DISPATCH',
            )
        }
        if (!current.items.length) {
            throw new BadRequestException(
                'Cannot mark READY_FOR_DISPATCH: package has no items',
            )
        }
        const mismatch = current.items.some(
            (item) => !new Decimal(item.scannedQty).eq(item.expectedQty),
        )
        if (mismatch) {
            await this.prisma.wmPackage.update({
                where: { id },
                data: { status: 'EXCEPTION' },
            })
            throw new BadRequestException(
                'Cannot mark READY_FOR_DISPATCH: package contents do not match expected order',
            )
        }

        const dest = (
            shipTo?.shipToAddress ?? current.shipToAddress ?? ''
        ).trim()
        if (!dest) {
            throw new BadRequestException(
                'shipToAddress is required before Ready for Dispatch (SCM release)',
            )
        }

        const updated = await this.prisma.wmPackage.update({
            where: { id },
            data: { status: 'READY_FOR_DISPATCH' },
            include: this.detailIncludes,
        })

        let scmShipment: Awaited<
            ReturnType<ShipmentsService['createFromPackage']>
        > | null = null
        let scmReleaseError: string | null = null
        try {
            scmShipment = await this.shipmentsService.createFromPackage(id)
        } catch (err) {
            scmReleaseError =
                err instanceof Error ? err.message : 'SCM release failed'
            this.logger.warn(
                `Package ${updated.packageNumber} READY but SCM release failed: ${scmReleaseError}`,
            )
        }

        return { ...updated, scmShipment, scmReleaseError }
    }

    /** Idempotent retry helper used by ready + explicit retry. */
    private async releaseToScmSafe(packageId: string) {
        try {
            return await this.shipmentsService.createFromPackage(packageId)
        } catch (err) {
            this.logger.warn(
                `SCM release retry failed for ${packageId}: ${
                    err instanceof Error ? err.message : err
                }`,
            )
            return null
        }
    }

    async retryScmRelease(id: string) {
        const pkg = await this.findOne(id)
        if (pkg.status !== 'READY_FOR_DISPATCH' && pkg.status !== 'DISPATCHED') {
            throw new BadRequestException(
                'Package must be READY_FOR_DISPATCH to retry SCM release',
            )
        }
        const scmShipment = await this.shipmentsService.createFromPackage(id)
        return { ...pkg, scmShipment, scmReleaseError: null as string | null }
    }

    async dispatch(id: string) {
        const pkg = await this.findOne(id)
        if (pkg.status !== 'SEALED' && pkg.status !== 'READY_FOR_DISPATCH') {
            throw new BadRequestException(
                'Only SEALED or READY_FOR_DISPATCH packages can be dispatched',
            )
        }
        if (!pkg.items.length) {
            throw new BadRequestException('Cannot dispatch: package has no items')
        }
        const mismatch = pkg.items.some(
            (item) => !new Decimal(item.scannedQty).eq(item.expectedQty),
        )
        if (mismatch) {
            await this.prisma.wmPackage.update({
                where: { id },
                data: { status: 'EXCEPTION' },
            })
            throw new BadRequestException(
                'Cannot dispatch: package contents do not match expected order',
            )
        }
        return this.prisma.wmPackage.update({
            where: { id },
            data: { status: 'DISPATCHED' },
            include: this.detailIncludes,
        })
    }

    /** Auto numbers: PKG-000001, PKG-000002, … (ignores PKG-SCM-*, PKG-DEBUG-*, etc.) */
    private static readonly PKG_NUMERIC = /^PKG-(\d+)$/

    private async generateNextCode(): Promise<string> {
        const packages = await this.prisma.wmPackage.findMany({
            where: { packageNumber: { startsWith: 'PKG-' } },
            select: { packageNumber: true },
        })
        let maxSeq = 0
        for (const { packageNumber } of packages) {
            const m = PackingService.PKG_NUMERIC.exec(packageNumber)
            if (!m) continue
            const n = parseInt(m[1], 10)
            if (!isNaN(n) && n > maxSeq) maxSeq = n
        }
        return `PKG-${String(maxSeq + 1).padStart(6, '0')}`
    }
}
