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
import {
    OpenPackingSessionDto,
    PackingSessionQueryDto,
} from './dto/packing-session.dto'
import { Decimal } from '@prisma/client/runtime/library'
import { Prisma } from '@prisma/client'
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
        items: {
            select: {
                id: true,
                expectedQty: true,
                scannedQty: true,
                packedById: true,
                packedByName: true,
            },
        },
        warehouse: true,
        salesOrder: {
            select: { orderNumber: true, customerName: true, shipToName: true },
        },
        pickingTask: {
            select: {
                id: true,
                taskNumber: true,
                salesOrder: {
                    select: {
                        orderNumber: true,
                        customerName: true,
                        shipToName: true,
                    },
                },
            },
        },
        reservation: true,
        shipment: { select: { id: true, reference: true, status: true } },
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
        shipment: { select: { id: true, reference: true, status: true } },
    }

    private readonly sessionIncludes = {
        warehouse: true,
        pickingTask: true,
        salesOrder: {
            select: { id: true, orderNumber: true, customerName: true },
        },
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

    private async nextSessionNumber(tx: Prisma.TransactionClient) {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `PS-${today}-`
        const last = await tx.wmPackingSession.findFirst({
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

    private isRetryablePackingWrite(error: unknown) {
        const code = (error as { code?: string } | null)?.code
        return code === 'P2002' || code === 'P2034'
    }

    private async inSerializablePackingTransaction<T>(
        operation: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
        let lastError: unknown
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                return await this.prisma.$transaction(operation, {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                })
            } catch (error) {
                lastError = error
                if (!this.isRetryablePackingWrite(error) || attempt === 2)
                    throw error
            }
        }
        throw lastError
    }

    private async getOrCreateOpenSession(
        tx: Prisma.TransactionClient,
        task: {
            id: string
            warehouseId: string
            companyId: string | null
            salesOrderId: string | null
            warehouseTaskId: string | null
        },
    ) {
        const where = task.salesOrderId
            ? {
                  salesOrderId: task.salesOrderId,
                  warehouseId: task.warehouseId,
                  status: 'OPEN',
              }
            : { pickingTaskId: task.id, status: 'OPEN' }
        const existing = await tx.wmPackingSession.findFirst({
            where,
            include: this.sessionIncludes,
        })
        if (existing) return existing

        return tx.wmPackingSession.create({
            data: {
                sessionNumber: await this.nextSessionNumber(tx),
                warehouseId: task.warehouseId,
                companyId: task.companyId,
                salesOrderId: task.salesOrderId,
                pickingTaskId: task.id,
                warehouseTaskId: task.warehouseTaskId,
                status: 'OPEN',
            },
            include: this.sessionIncludes,
        })
    }

    async openSession(dto: OpenPackingSessionDto) {
        return this.inSerializablePackingTransaction(async (tx) =>
            tx.wmPackingSession.create({
                data: {
                    sessionNumber: await this.nextSessionNumber(tx),
                    warehouseId: dto.warehouseId,
                    pickingTaskId: dto.pickingTaskId ?? null,
                    warehouseTaskId: dto.warehouseTaskId ?? null,
                    createdBy: dto.createdBy ?? null,
                    status: 'OPEN',
                },
                include: this.sessionIncludes,
            }),
        )
    }

    async openSessionFromPicking(pickingTaskId: string) {
        return this.inSerializablePackingTransaction(async (tx) => {
            const task = await tx.wmPickingTask.findUnique({
                where: { id: pickingTaskId },
                select: {
                    id: true,
                    warehouseId: true,
                    companyId: true,
                    salesOrderId: true,
                    warehouseTaskId: true,
                },
            })
            if (!task) throw new NotFoundException('Picking task not found')
            return this.getOrCreateOpenSession(tx, task)
        })
    }

    async completeSession(id: string) {
        const session = await this.findSession(id)
        if (session.status !== 'OPEN') {
            throw new BadRequestException(
                `Cannot complete session in status ${session.status}`,
            )
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

        const where: any = {
            // Repairs preserve cancelled duplicates for audit/history, but the
            // operational packing queue must not keep showing them as active.
            ...(status ? { status } : { status: { not: 'CANCELLED' } }),
        }
        if (warehouseId) where.warehouseId = warehouseId
        if (orderNumber)
            where.orderNumber = { contains: orderNumber, mode: 'insensitive' }
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
            data: data.map((pkg) => this.withPackageTotals(pkg)),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    /** Quantity-based package total; a package line count is not an item count. */
    private withPackageTotals<
        T extends { items: Array<{ expectedQty: unknown }> },
    >(pkg: T) {
        return {
            ...pkg,
            totalItemQuantity: pkg.items.reduce(
                (total, item) => total + (Number(item.expectedQty) || 0),
                0,
            ),
        }
    }

    async findOne(id: string) {
        const pkg = await this.prisma.wmPackage.findUnique({
            where: { id },
            include: this.detailIncludes,
        })
        if (!pkg) throw new NotFoundException('Package not found')
        const items = pkg.items ?? []
        return this.withPackageTotals({
            ...pkg,
            items,
            // Weight / dimensions prefilled from the Material Master (Physical
            // fields). Non-persisted suggestion — the packer can override and
            // values are saved on Seal.
            suggestedMeasurements: this.suggestMeasurements(
                items as unknown as Array<{
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
        })
    }

    private static readonly WEIGHT_TO_KG: Record<string, number> = {
        KG: 1,
        KGS: 1,
        KILOGRAM: 1,
        KILOGRAMS: 1,
        G: 0.001,
        GRAM: 0.001,
        GRAMS: 0.001,
        MG: 0.000001,
        LB: 0.45359237,
        LBS: 0.45359237,
        POUND: 0.45359237,
        POUNDS: 0.45359237,
        OZ: 0.028349523125,
        OUNCE: 0.028349523125,
        OUNCES: 0.028349523125,
        T: 1000,
        TON: 1000,
        TONNE: 1000,
        TONNES: 1000,
    }

    private static readonly DIM_TO_CM: Record<string, number> = {
        MM: 0.1,
        MILLIMETER: 0.1,
        MILLIMETERS: 0.1,
        CM: 1,
        CENTIMETER: 1,
        CENTIMETERS: 1,
        M: 100,
        METER: 100,
        METERS: 100,
        IN: 2.54,
        INCH: 2.54,
        INCHES: 2.54,
        FT: 30.48,
        FOOT: 30.48,
        FEET: 30.48,
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

        const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

        return {
            weightKg: weightSeen ? round(weightKg, 3) : null,
            length: dimSeen && length > 0 ? round(length) : null,
            width: dimSeen && width > 0 ? round(width) : null,
            height: dimSeen && height > 0 ? round(height) : null,
            source: 'MATERIAL_MASTER' as const,
        }
    }

    async create(dto: CreatePackageDto) {
        return this.inSerializablePackingTransaction(async (tx) => {
            const context = await this.resolvePackageContext(tx, dto)
            return tx.wmPackage.create({
                data: {
                    packageNumber: await this.generateNextCode(tx),
                    companyId: context.companyId,
                    warehouseId: dto.warehouseId,
                    orderNumber: context.orderNumber,
                    salesOrderId: context.salesOrderId,
                    pickingTaskId: dto.pickingTaskId ?? null,
                    packingSessionId: dto.packingSessionId ?? null,
                    reservationId: dto.reservationId ?? null,
                    // Manually adding a package is an explicit split/manual
                    // action; only createFromPickingTask may create DEFAULT.
                    packageRole: dto.packageRole ?? 'MANUAL',
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
        })
    }

    /**
     * Every package carries the Sales Order companyId (Organization / MM
     * company). It is resolved from the picking task, reservation or order
     * number the package belongs to — never accepted from the client — so a
     * package can never be created for a different company than its order.
     */
    private async resolvePackageContext(
        tx: Prisma.TransactionClient,
        dto: CreatePackageDto,
    ): Promise<{
        companyId: string | null
        salesOrderId: string | null
        orderNumber: string | null
    }> {
        let companyId: string | null = null
        let salesOrderId = dto.salesOrderId ?? null
        let orderNumber = dto.orderNumber ?? null

        if (dto.pickingTaskId) {
            const pick = await tx.wmPickingTask.findUnique({
                where: { id: dto.pickingTaskId },
                select: {
                    companyId: true,
                    salesOrderId: true,
                    salesOrder: { select: { orderNumber: true } },
                },
            })
            if (pick?.companyId) companyId = pick.companyId
            if (pick?.salesOrderId) {
                salesOrderId = pick.salesOrderId
                orderNumber = pick.salesOrder?.orderNumber ?? orderNumber
            }
        }
        if (!companyId && dto.reservationId) {
            const reservation = await tx.mmInventoryReservation.findUnique({
                where: { id: dto.reservationId },
                select: { companyId: true },
            })
            if (reservation?.companyId) companyId = reservation.companyId
        }
        if (salesOrderId) {
            const order = await tx.sdSalesOrder.findUnique({
                where: { id: salesOrderId },
                select: { id: true, companyId: true, orderNumber: true },
            })
            if (!order) throw new BadRequestException('Sales order not found')
            companyId = companyId ?? order.companyId
            orderNumber = order.orderNumber
            salesOrderId = order.id
        } else if (orderNumber) {
            const order = await tx.sdSalesOrder.findUnique({
                where: { orderNumber },
                select: { id: true, companyId: true, orderNumber: true },
            })
            if (order) {
                companyId = companyId ?? order.companyId
                salesOrderId = order.id
                orderNumber = order.orderNumber
            }
        }
        return { companyId, salesOrderId, orderNumber }
    }

    private aggregatePickedItems(
        tasks: Array<{
            materialId: string
            pickedQty: Decimal
            batchId: string | null
            serialId: string | null
        }>,
    ) {
        const items = new Map<
            string,
            {
                materialId: string
                expectedQty: number
                batchId: string | null
                serialId: string | null
            }
        >()
        for (const task of tasks) {
            const key = `${task.materialId}:${task.batchId ?? ''}:${task.serialId ?? ''}`
            const current = items.get(key)
            const quantity = Number(task.pickedQty)
            if (current) current.expectedQty += quantity
            else {
                items.set(key, {
                    materialId: task.materialId,
                    expectedQty: quantity,
                    batchId: task.batchId,
                    serialId: task.serialId,
                })
            }
        }
        return [...items.values()]
    }

    private async syncDefaultPackageItems(
        tx: Prisma.TransactionClient,
        packageId: string,
        expectedItems: Array<{
            materialId: string
            expectedQty: number
            batchId: string | null
            serialId: string | null
        }>,
    ) {
        const existing = await tx.wmPackageItem.findMany({
            where: { packageId },
        })
        const keyFor = (item: {
            materialId: string
            batchId: string | null
            serialId: string | null
        }) => `${item.materialId}:${item.batchId ?? ''}:${item.serialId ?? ''}`
        const existingByKey = new Map(
            existing.map((item) => [keyFor(item), item]),
        )

        for (const expected of expectedItems) {
            const current = existingByKey.get(keyFor(expected))
            if (!current) {
                await tx.wmPackageItem.create({
                    data: { ...expected, packageId, status: 'PENDING' },
                })
                continue
            }
            // Do not lower a line below what a packer has already scanned.
            const expectedQty = Math.max(
                expected.expectedQty,
                Number(current.scannedQty),
            )
            if (!new Decimal(current.expectedQty).eq(expectedQty)) {
                await tx.wmPackageItem.update({
                    where: { id: current.id },
                    data: { expectedQty },
                })
            }
        }
    }

    async createFromPickingTask(pickingTaskId: string) {
        const packageId = await this.inSerializablePackingTransaction(
            async (tx) => {
                const task = await tx.wmPickingTask.findUnique({
                    where: { id: pickingTaskId },
                    select: {
                        id: true,
                        warehouseId: true,
                        companyId: true,
                        warehouseTaskId: true,
                        salesOrderId: true,
                        reservationId: true,
                        sourceDocument: true,
                        taskNumber: true,
                        materialId: true,
                        pickedQty: true,
                        batchId: true,
                        serialId: true,
                    },
                })
                if (!task) throw new NotFoundException('Picking task not found')
                if (new Decimal(task.pickedQty).lte(0)) {
                    throw new BadRequestException(
                        'Cannot pack: nothing has been picked yet',
                    )
                }

                const session = await this.getOrCreateOpenSession(tx, task)
                const pickedTasks = task.salesOrderId
                    ? await tx.wmPickingTask.findMany({
                          where: {
                              salesOrderId: task.salesOrderId,
                              warehouseId: task.warehouseId,
                              pickedQty: { gt: 0 },
                              status: { in: ['PARTIALLY_PICKED', 'COMPLETED'] },
                          },
                          select: {
                              materialId: true,
                              pickedQty: true,
                              batchId: true,
                              serialId: true,
                          },
                      })
                    : [task]
                const expectedItems = this.aggregatePickedItems(pickedTasks)

                let orderNumber = task.sourceDocument ?? task.taskNumber
                if (task.salesOrderId) {
                    const order = await tx.sdSalesOrder.findUnique({
                        where: { id: task.salesOrderId },
                        select: { orderNumber: true },
                    })
                    if (!order)
                        throw new BadRequestException('Sales order not found')
                    orderNumber = order.orderNumber
                }

                const existing = await tx.wmPackage.findFirst({
                    where: {
                        packingSessionId: session.id,
                        packageRole: 'DEFAULT',
                        status: { not: 'CANCELLED' },
                    },
                    select: { id: true, status: true },
                })
                if (existing) {
                    if (['OPEN', 'PACKING'].includes(existing.status)) {
                        await this.syncDefaultPackageItems(
                            tx,
                            existing.id,
                            expectedItems,
                        )
                        await tx.wmPackage.update({
                            where: { id: existing.id },
                            data: {
                                companyId: task.companyId,
                                salesOrderId: task.salesOrderId,
                                orderNumber,
                            },
                        })
                    }
                    return existing.id
                }

                const created = await tx.wmPackage.create({
                    data: {
                        packageNumber: await this.generateNextCode(tx),
                        companyId: task.companyId,
                        warehouseId: task.warehouseId,
                        orderNumber,
                        salesOrderId: task.salesOrderId,
                        pickingTaskId: task.id,
                        packingSessionId: session.id,
                        reservationId: task.reservationId,
                        packageRole: 'DEFAULT',
                        status: 'OPEN',
                        items: {
                            create: expectedItems.map((item) => ({
                                ...item,
                                status: 'PENDING',
                            })),
                        },
                    },
                    select: { id: true },
                })
                return created.id
            },
        )
        return this.findOne(packageId)
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
        if (
            ['SEALED', 'READY_FOR_DISPATCH', 'DISPATCHED'].includes(pkg.status)
        ) {
            throw new BadRequestException(
                `Cannot scan items on a ${pkg.status} package`,
            )
        }

        const item = await this.prisma.wmPackageItem.findFirst({
            where: {
                packageId,
                materialId,
                ...(batchId ? { batchId } : {}),
                ...(serialId ? { serialId } : {}),
            },
        })
        if (!item)
            throw new NotFoundException('Matching package item not found')

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
            throw new BadRequestException(
                'Batch is required when packing batch-managed material',
            )
        }
        if (material?.serialManaged && !serialId && !item.serialId) {
            throw new BadRequestException(
                'Serial is required when packing serial-managed material',
            )
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
                    .trim() ||
                packer?.userName ||
                user.userName
        }

        const newScanned = new Decimal(item.scannedQty).plus(quantity)
        if (newScanned.gt(item.expectedQty)) {
            throw new BadRequestException(
                `Scan exceeds expected qty. Expected: ${item.expectedQty}, Would be: ${newScanned}`,
            )
        }
        const newStatus = newScanned.gte(item.expectedQty)
            ? 'SCANNED'
            : 'PARTIAL'

        return this.prisma.wmPackageItem.update({
            where: { id: item.id },
            data: {
                scannedQty: newScanned,
                status: newStatus,
                ...(batchId && !item.batchId ? { batchId } : {}),
                ...(serialId && !item.serialId ? { serialId } : {}),
                ...(packedById ? { packedById, packedByName } : {}),
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
            throw new BadRequestException(
                'Only VERIFIED packages can be sealed',
            )
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
                const shipment = await this.shipmentsService.createFromPackage(
                    current.id,
                )
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
            shipTo?.shipToAddress ??
            current.shipToAddress ??
            ''
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
        if (
            pkg.status !== 'READY_FOR_DISPATCH' &&
            pkg.status !== 'DISPATCHED'
        ) {
            throw new BadRequestException(
                'Package must be READY_FOR_DISPATCH to retry SCM release',
            )
        }
        const scmShipment = await this.shipmentsService.createFromPackage(id)
        return { ...pkg, scmShipment, scmReleaseError: null as string | null }
    }

    async dispatch(id: string) {
        const pkg = await this.findOne(id)
        if (pkg.status === 'DISPATCHED') {
            // Historical records can predate the shipment guard. Repair a
            // missing link through SCM's idempotent package release instead of
            // leaving a dispatched package without transport ownership.
            const scmShipment =
                pkg.shipment ??
                (await this.shipmentsService.createFromPackage(id))
            return {
                ...pkg,
                scmShipment,
                scmReleaseError: null as string | null,
            }
        }
        if (pkg.status !== 'READY_FOR_DISPATCH') {
            throw new BadRequestException(
                'Package must be READY_FOR_DISPATCH with an SCM shipment before dispatch',
            )
        }
        if (!pkg.items.length) {
            throw new BadRequestException(
                'Cannot dispatch: package has no items',
            )
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
        const scmShipment =
            pkg.shipment ?? (await this.shipmentsService.createFromPackage(id))
        const updated = await this.prisma.wmPackage.update({
            where: { id },
            data: { status: 'DISPATCHED' },
            include: this.detailIncludes,
        })
        return {
            ...updated,
            scmShipment,
            scmReleaseError: null as string | null,
        }
    }

    /** Auto numbers: PKG-000001, PKG-000002, … (ignores PKG-SCM-*, PKG-DEBUG-*, etc.) */
    private static readonly PKG_NUMERIC = /^PKG-(\d+)$/

    private async generateNextCode(
        tx: Prisma.TransactionClient,
    ): Promise<string> {
        const packages = await tx.wmPackage.findMany({
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
