import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    Optional,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { WarehouseTaskService } from '../tasks/warehouse-task.service'
import { PackingService } from '../packing/packing.service'
import { AllocationEngineService } from '../../inventory/reservation-allocation/allocation-engine.service'
import { CreatePickingDto } from './dto/create-picking.dto'
import { PickingQueryDto } from './dto/picking-query.dto'
import { ConfirmPickingDto } from './dto/confirm-picking.dto'
import { Decimal } from '@prisma/client/runtime/library'

/**
 * Picking confirms physical pick progress only.
 * Does NOT deduct on-hand — Goods Issue posts the inventory ledger ISSUE.
 */
@Injectable()
export class PickingService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => WarehouseTaskService))
        private warehouseTasks: WarehouseTaskService,
        /** Auto packing on pick completion (ecommerce flow) — optional to keep manual use intact. */
        @Optional() private packing?: PackingService,
        /** Reservation/allocation pick-progress echo (header → FULLY_PICKED). */
        @Inject(forwardRef(() => AllocationEngineService))
        @Optional()
        private allocations?: AllocationEngineService,
    ) {}

    private readonly includes = {
        material: true,
        sourceBin: true,
        wave: true,
        warehouse: {
            select: {
                id: true,
                code: true,
                name: true,
                companyId: true,
                company: { select: { id: true, code: true, name: true } },
            },
        },
        reservation: true,
        salesOrder: {
            select: {
                id: true,
                orderNumber: true,
                status: true,
                customerId: true,
                customerName: true,
                customerEmail: true,
                companyId: true,
                company: { select: { id: true, code: true, name: true } },
            },
        },
        salesOrderLine: {
            select: {
                id: true,
                sku: true,
                productId: true,
                productNameSnapshot: true,
                productImageSnapshot: true,
                productSkuSnapshot: true,
                variantName: true,
                variantSku: true,
                materialCodeSnapshot: true,
            },
        },
    }

    async findAll(query: PickingQueryDto) {
        const {
            page = 1,
            limit = 20,
            status,
            waveId,
            warehouseId,
            companyId,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = query

        const andClauses: any[] = []
        if (status) andClauses.push({ status })
        if (waveId) andClauses.push({ waveId })
        if (warehouseId) andClauses.push({ warehouseId })
        if (companyId) {
            andClauses.push({
                OR: [
                    { companyId },
                    { salesOrder: { companyId } },
                    { warehouse: { companyId } },
                ],
            })
        }
        if (search) {
            andClauses.push({
                OR: [
                    { taskNumber: { contains: search, mode: 'insensitive' } },
                    {
                        sourceDocument: {
                            contains: search,
                            mode: 'insensitive',
                        },
                    },
                    {
                        salesOrder: {
                            orderNumber: {
                                contains: search,
                                mode: 'insensitive',
                            },
                        },
                    },
                ],
            })
        }

        const where = andClauses.length > 0 ? { AND: andClauses } : {}

        const [data, total] = await Promise.all([
            this.prisma.wmPickingTask.findMany({
                where,
                include: this.includes,
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.wmPickingTask.count({ where }),
        ])

        return {
            data: await this.withProductDisplayInfo(
                await this.withAssignedWorkerProfiles(data),
            ),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const task = await this.prisma.wmPickingTask.findUnique({
            where: { id },
            include: this.includes,
        })
        if (!task) throw new NotFoundException('Picking task not found')
        const [enrichedTask] = await this.withProductDisplayInfo(
            await this.withAssignedWorkerProfiles([task]),
        )
        return enrichedTask
    }

    /**
     * Product identity for pick lists. Order-line snapshots come first so an
     * archived, deactivated or already-deleted catalog product still shows the
     * sold name — never a blank item. `productStatus` drives the
     * "Archived product" / "Inactive product" badge; `productDeleted` is true
     * only when the order line points at a product row that no longer exists.
     */
    private async withProductDisplayInfo<
        T extends {
            salesOrderLine?: {
                productId: string | null
                productNameSnapshot: string | null
                productImageSnapshot: string | null
                productSkuSnapshot: string | null
                sku: string | null
                variantName: string | null
                variantSku: string | null
                materialCodeSnapshot: string | null
            } | null
        },
    >(tasks: T[]) {
        const productIds = [
            ...new Set(
                tasks
                    .map((task) => task.salesOrderLine?.productId)
                    .filter((id): id is string => Boolean(id)),
            ),
        ]
        const products = productIds.length
            ? await this.prisma.sdProduct.findMany({
                  where: { id: { in: productIds } },
                  select: { id: true, status: true, isActive: true },
              })
            : []
        const statusById = new Map(
            products.map((product) => [product.id, product.status]),
        )

        return tasks.map((task) => {
            const line = task.salesOrderLine
            const productId = line?.productId ?? null
            return {
                ...task,
                productDisplay: {
                    name: line?.productNameSnapshot ?? null,
                    sku: line?.productSkuSnapshot ?? line?.sku ?? null,
                    imageUrl: line?.productImageSnapshot ?? null,
                    variantName: line?.variantName ?? null,
                    variantSku: line?.variantSku ?? null,
                    materialCode: line?.materialCodeSnapshot ?? null,
                    productId,
                    productStatus: productId
                        ? (statusById.get(productId) ?? null)
                        : null,
                    productDeleted: productId
                        ? !statusById.has(productId)
                        : false,
                },
            }
        })
    }

    /**
     * `assignedUser` is a persisted User ID. Keep that ID authoritative for
     * assignment commands, but provide its safe display profile for read UIs.
     * The task table must never expose a CUID as an employee name.
     */
    private async withAssignedWorkerProfiles<
        T extends { assignedUser: string | null },
    >(tasks: T[]) {
        const assignedUserIds = [
            ...new Set(
                tasks
                    .map((task) => task.assignedUser)
                    .filter((id): id is string => Boolean(id)),
            ),
        ]

        if (!assignedUserIds.length) {
            return tasks.map((task) => ({ ...task, assignedWorker: null }))
        }

        const users = await this.prisma.user.findMany({
            where: { id: { in: assignedUserIds } },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                userName: true,
                email: true,
                avatar: true,
                jobPosition: true,
            },
        })
        const usersById = new Map(users.map((user) => [user.id, user]))

        return tasks.map((task) => {
            const user = task.assignedUser
                ? usersById.get(task.assignedUser)
                : undefined

            return {
                ...task,
                assignedWorker: user
                    ? {
                          id: user.id,
                          displayName:
                              [user.firstName, user.lastName]
                                  .filter(Boolean)
                                  .join(' ') ||
                              user.userName ||
                              user.email,
                          avatar: user.avatar,
                          jobPosition: user.jobPosition,
                      }
                    : null,
            }
        })
    }

    async create(dto: CreatePickingDto) {
        let companyId = dto.companyId
        let sourceBinId = dto.sourceBinId
        let batchId = dto.batchId ?? null
        let serialId = dto.serialId ?? null
        const reservationId = dto.reservationId ?? null
        let sourceDocument = dto.sourceDocument ?? null
        let uomId = dto.uomId ?? null

        if (reservationId) {
            const reservation =
                await this.prisma.mmInventoryReservation.findUnique({
                    where: { id: reservationId },
                })
            if (!reservation)
                throw new BadRequestException('Reservation not found')
            if (!['OPEN', 'PARTIAL'].includes(reservation.status)) {
                throw new BadRequestException(
                    `Reservation is ${reservation.status}`,
                )
            }
            companyId = reservation.companyId
            if (reservation.storageBinId && !sourceBinId) {
                sourceBinId = reservation.storageBinId
            }
            if (reservation.batchId && !batchId) batchId = reservation.batchId
            if (reservation.serialNumberId && !serialId) {
                serialId = reservation.serialNumberId
            }
            sourceDocument =
                sourceDocument ??
                `${reservation.sourceDocumentType}:${reservation.sourceDocumentId}`
        }

        if (!companyId) {
            const wh = await this.prisma.warehouse.findUnique({
                where: { id: dto.warehouseId },
            })
            if (!wh) throw new BadRequestException('Warehouse not found')
            companyId = wh.companyId
        }

        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: dto.materialId, deletedAt: null },
        })
        if (!material) throw new BadRequestException('Material not found')
        if (!uomId) uomId = material.baseUomId

        const strategy = (dto.strategy ?? 'FIFO').toUpperCase()
        if (!sourceBinId) {
            const suggestion = await this.suggestSourceBin(
                companyId,
                dto.warehouseId,
                dto.materialId,
                dto.requiredQty,
                strategy,
                batchId,
                serialId,
                dto.zoneCode,
            )
            sourceBinId = suggestion.storageBinId
            if (!batchId && suggestion.batchId) batchId = suggestion.batchId
            if (!serialId && suggestion.serialNumberId) {
                serialId = suggestion.serialNumberId
            }
        }

        if (!sourceBinId) {
            throw new BadRequestException(
                'sourceBinId is required (no stock location found)',
            )
        }

        const onHand = await this.prisma.mmInventoryBalance.findFirst({
            where: {
                companyId,
                warehouseId: dto.warehouseId,
                storageBinId: sourceBinId,
                materialId: dto.materialId,
                batchId: batchId ?? null,
                serialNumberId: serialId ?? null,
                stockStatus: 'UNRESTRICTED',
            },
        })
        if (!onHand || new Decimal(onHand.quantity).lt(dto.requiredQty)) {
            throw new BadRequestException(
                'Insufficient on-hand stock in source bin for picking task',
            )
        }

        const engineTask = await this.warehouseTasks.create({
            companyId: companyId!,
            warehouseId: dto.warehouseId,
            taskType: 'PICK',
            materialId: dto.materialId,
            quantity: dto.requiredQty,
            sourceBinId,
            batchId: batchId ?? undefined,
            serialId: serialId ?? undefined,
            uomId: uomId ?? undefined,
            referenceType: reservationId ? 'RESERVATION' : 'PICK',
            referenceId: reservationId ?? undefined,
            metadata: { sourceDocument, waveId: dto.waveId },
        })

        const taskNumber = await this.generateNextCode()
        return this.prisma.wmPickingTask.create({
            data: {
                taskNumber,
                warehouseId: dto.warehouseId,
                companyId,
                sourceBinId,
                materialId: dto.materialId,
                requiredQty: dto.requiredQty,
                batchId,
                serialId,
                uomId,
                waveId: dto.waveId ?? null,
                reservationId,
                reservationHeaderId: dto.reservationHeaderId ?? null,
                reservationLineId: dto.reservationLineId ?? null,
                allocationLineId: dto.allocationLineId ?? null,
                sourceDocument,
                warehouseTaskId: engineTask.id,
                priority: dto.priority ?? 5,
                status: 'OPEN',
                salesOrderId: dto.salesOrderId ?? null,
                salesOrderLineId: dto.salesOrderLineId ?? null,
                lastIdempotencyKey: dto.lastIdempotencyKey ?? null,
            },
            include: this.includes,
        })
    }

    async createFromReservation(
        reservationId: string,
        strategy = 'FIFO',
        zoneCode?: string | null,
    ) {
        const reservation = await this.prisma.mmInventoryReservation.findUnique(
            {
                where: { id: reservationId },
            },
        )
        if (!reservation) throw new NotFoundException('Reservation not found')
        const openQty = new Decimal(reservation.quantity).minus(
            reservation.fulfilledQuantity,
        )
        if (openQty.lte(0)) {
            throw new BadRequestException('Reservation has no open quantity')
        }
        return this.create({
            warehouseId: reservation.warehouseId,
            companyId: reservation.companyId,
            materialId: reservation.materialId,
            requiredQty: Number(openQty),
            reservationId: reservation.id,
            batchId: reservation.batchId ?? undefined,
            serialId: reservation.serialNumberId ?? undefined,
            sourceBinId: reservation.storageBinId ?? undefined,
            strategy,
            zoneCode: zoneCode ?? undefined,
            sourceDocument: `${reservation.sourceDocumentType}:${reservation.sourceDocumentId}`,
        })
    }

    async assign(id: string, userId: string) {
        const task = await this.findOne(id)
        if (task.status !== 'OPEN' && task.status !== 'ASSIGNED') {
            throw new BadRequestException('Only OPEN tasks can be assigned')
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { companies: { select: { companyId: true } } },
        })
        if (!user || !user.isActive) {
            throw new BadRequestException(
                'The assigned worker must be an active user account',
            )
        }
        this.assertUserCompanyAllowed(task.companyId, user.companies)
        if (task.warehouseTaskId) {
            await this.warehouseTasks.assign(task.warehouseTaskId, userId)
            return this.findOne(id)
        }
        return this.prisma.wmPickingTask.update({
            where: { id },
            data: { assignedUser: userId, status: 'ASSIGNED' },
            include: this.includes,
        })
    }

    /**
     * Workers that may be assigned to picking tasks: active user accounts,
     * company-scoped when Organization user-company links exist (cross-company
     * assignment is never allowed). With no links (single-company org) every
     * active worker is assignable.
     */
    async assignableUsers(
        companyId?: string,
        _warehouseId?: string,
    ): Promise<
        Array<{
            id: string
            userId: string
            employeeId: string | null
            displayName: string
            email: string
            avatar: string
            jobPosition: string
            role: string
            companyId: string | null
            warehouseId: string | null
            isActive: boolean
        }>
    > {
        const links = companyId
            ? await this.prisma.userCompany.findMany({
                  where: { companyId },
                  select: { userId: true },
              })
            : await this.prisma.userCompany.findMany({
                  select: { userId: true, companyId: true },
                  take: 1,
              })

        const linkedUserIds = new Set(links.map((l) => l.userId))
        const users = await this.prisma.user.findMany({
            where: {
                isActive: true,
                ...(links.length && linkedUserIds.size > 0
                    ? { id: { in: [...linkedUserIds] } }
                    : {}),
            },
            orderBy: { firstName: 'asc' },
            select: {
                id: true,
                email: true,
                userName: true,
                firstName: true,
                lastName: true,
                avatar: true,
                jobPosition: true,
                role: true,
                isActive: true,
                companies: { select: { companyId: true } },
            },
        })

        return users.map((u) => ({
            id: u.id,
            userId: u.id,
            employeeId: null,
            displayName:
                [u.firstName, u.lastName].filter(Boolean).join(' ') ||
                u.userName ||
                u.email,
            email: u.email,
            avatar: u.avatar,
            jobPosition: u.jobPosition,
            role: u.role,
            companyId: u.companies[0]?.companyId ?? null,
            warehouseId: null,
            isActive: u.isActive,
        }))
    }

    private assertUserCompanyAllowed(
        taskCompanyId: string | null,
        userCompanies: Array<{ companyId: string }>,
    ) {
        // No task company (internal manual tasks) — no cross-company risk.
        if (!taskCompanyId) return
        // No user-company links exist anywhere (single-company org) — allow.
        if (userCompanies.length === 0) return
        if (!userCompanies.some((uc) => uc.companyId === taskCompanyId)) {
            throw new BadRequestException(
                'Cannot assign a worker from another company',
            )
        }
    }

    async confirmPick(id: string, dto: ConfirmPickingDto) {
        const task = await this.findOne(id)

        // A previous confirmation may have completed the pick but failed while
        // opening packing. Retrying heals the downstream package idempotently
        // instead of leaving the order stuck at COMPLETED.
        if (task.status === 'COMPLETED') {
            await this.autoOpenPacking(id)
            return task
        }

        if (task.warehouseTaskId) {
            await this.warehouseTasks.complete(task.warehouseTaskId, {
                quantity: dto.pickedQty,
                sourceBinId: task.sourceBinId,
                scannedBinId: dto.scannedBinId,
                scannedMaterialId: dto.scannedMaterialId,
                scannedBatchId: dto.scannedBatchId,
                scannedSerialId: dto.scannedSerialId,
                performedBy: task.assignedUser ?? undefined,
                idempotencyKey: dto.idempotencyKey,
            })
            const completed = await this.findOne(id)
            // Echo pick progress into reservation/allocation state.
            if (completed.allocationLineId) {
                await this.allocations?.recordPick(
                    completed.allocationLineId,
                    new Decimal(dto.pickedQty),
                )
            }
            // Warehouse-task-bridged picks returned early before — ensure the
            // ecommerce chain (packing session + package) opens on completion.
            if (completed.status === 'COMPLETED') {
                await this.autoOpenPacking(id)
            }
            return completed
        }

        if (dto.idempotencyKey) {
            const dup = await this.prisma.wmPickingTask.findFirst({
                where: { lastIdempotencyKey: dto.idempotencyKey },
            })
            if (dup) {
                if (dup.id === id) return this.findOne(id)
                throw new BadRequestException('Duplicate idempotency key')
            }
        }

        if (task.status === 'CANCELLED') {
            throw new BadRequestException(
                `Cannot confirm a ${task.status} task`,
            )
        }

        if (task.waveId) {
            const wave = await this.prisma.wmPickWave.findUnique({
                where: { id: task.waveId },
                select: { status: true },
            })
            if (wave?.status === 'DRAFT') {
                throw new BadRequestException(
                    'Pick wave must be started before scan & confirm picking',
                )
            }
        }

        if (dto.scannedBinId !== task.sourceBinId) {
            throw new BadRequestException(
                'WRONG_BIN: Scanned bin does not match source bin',
            )
        }
        if (dto.scannedMaterialId !== task.materialId) {
            throw new BadRequestException(
                'WRONG_MATERIAL: Scanned material does not match task',
            )
        }

        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: task.materialId },
        })
        if (!material) throw new BadRequestException('Material not found')

        if (material.batchManaged) {
            const expectedBatch = task.batchId
            if (!dto.scannedBatchId) {
                throw new BadRequestException(
                    'WRONG_BATCH: Batch scan is required for batch-managed material',
                )
            }
            if (expectedBatch && dto.scannedBatchId !== expectedBatch) {
                throw new BadRequestException(
                    'WRONG_BATCH: Scanned batch does not match task',
                )
            }
        }
        if (material.serialManaged) {
            const expectedSerial = task.serialId
            if (!dto.scannedSerialId) {
                throw new BadRequestException(
                    'WRONG_SERIAL: Serial scan is required for serial-managed material',
                )
            }
            if (expectedSerial && dto.scannedSerialId !== expectedSerial) {
                throw new BadRequestException(
                    'WRONG_SERIAL: Scanned serial does not match task',
                )
            }
        }

        const remaining = new Decimal(task.requiredQty).minus(task.pickedQty)
        if (new Decimal(dto.pickedQty).gt(remaining)) {
            throw new BadRequestException(
                `Pick qty exceeds remaining. Remaining: ${remaining}, Requested: ${dto.pickedQty}`,
            )
        }

        // Soft confirmation only — no inventory ledger / Wm balance mutation
        const newPickedQty = new Decimal(task.pickedQty).plus(dto.pickedQty)
        const newStatus = newPickedQty.gte(task.requiredQty)
            ? 'COMPLETED'
            : 'PARTIALLY_PICKED'

        const updated = await this.prisma.wmPickingTask.update({
            where: { id },
            data: {
                pickedQty: newPickedQty,
                status: newStatus,
                batchId: task.batchId ?? dto.scannedBatchId ?? null,
                serialId: task.serialId ?? dto.scannedSerialId ?? null,
                lastIdempotencyKey:
                    dto.idempotencyKey ?? task.lastIdempotencyKey,
                ...(newStatus === 'COMPLETED'
                    ? { completedAt: new Date() }
                    : {}),
            },
            include: this.includes,
        })

        if (task.waveId) {
            await this.syncWaveProgress(task.waveId)
        }

        // Echo pick progress into reservation/allocation state (allocation
        // line → COMPLETED, reservation line pickedQuantity, header status).
        if (task.allocationLineId) {
            await this.allocations?.recordPick(
                task.allocationLineId,
                new Decimal(dto.pickedQty),
            )
        }

        // Ecommerce chain: a fully picked task auto-creates its packing session.
        if (newStatus === 'COMPLETED') {
            await this.autoOpenPacking(id)
        }

        return updated
    }

    /** Idempotent: opens the packing session exactly once per picking task. */
    private async autoOpenPacking(pickingTaskId: string) {
        if (!this.packing) return
        await this.packing.createFromPickingTask(pickingTaskId)
    }

    async cancel(id: string) {
        const task = await this.findOne(id)
        if (task.status !== 'OPEN' && task.status !== 'ASSIGNED') {
            throw new BadRequestException(
                'Can only cancel OPEN or ASSIGNED tasks',
            )
        }
        if (task.warehouseTaskId) {
            await this.warehouseTasks.cancel(task.warehouseTaskId)
            return this.findOne(id)
        }
        return this.prisma.wmPickingTask.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: this.includes,
        })
    }

    async suggestSourceBin(
        companyId: string,
        warehouseId: string,
        materialId: string,
        requiredQty: number,
        strategy: string,
        batchId?: string | null,
        serialId?: string | null,
        zoneCode?: string | null,
    ) {
        const where: any = {
            companyId,
            warehouseId,
            materialId,
            stockStatus: 'UNRESTRICTED',
            quantity: { gt: 0 },
        }
        if (batchId) where.batchId = batchId
        if (serialId) where.serialNumberId = serialId

        const balances = await this.prisma.mmInventoryBalance.findMany({
            where,
            include: {
                batch: true,
                storageBin: {
                    include: {
                        storageSection: { include: { storageType: true } },
                    },
                },
            },
        })

        let eligible = balances.filter(
            (b) =>
                b.storageBinId &&
                b.storageBin?.pickingAllowed !== false &&
                b.storageBin?.status === 'ACTIVE' &&
                (new Decimal(b.quantity).gte(requiredQty) ||
                    new Decimal(b.quantity).gt(0)),
        )

        const strat = strategy.toUpperCase()
        // ZONE always filters; WAVE filters when zoneCode is provided (nearest within zone)
        if ((strat === 'ZONE' || strat === 'WAVE') && zoneCode) {
            const z = zoneCode.toUpperCase()
            eligible = eligible.filter((b) => {
                const sec = b.storageBin?.storageSection
                const type = sec?.storageType
                return (
                    sec?.code?.toUpperCase() === z ||
                    type?.code?.toUpperCase() === z ||
                    sec?.name?.toUpperCase().includes(z)
                )
            })
        }

        if (eligible.length === 0) {
            throw new BadRequestException(
                'No unrestricted stock locations found for material',
            )
        }

        if (strat === 'FEFO') {
            eligible.sort((a, b) => {
                const ae =
                    a.batch?.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER
                const be =
                    b.batch?.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER
                return ae - be
            })
        } else if (
            strat === 'NEAREST' ||
            strat === 'NEAREST_BIN' ||
            strat === 'WAVE' ||
            strat === 'ZONE'
        ) {
            // Wave/Zone: walk sequence by bin code (wave optimizeSequence reorders tasks)
            eligible.sort((a, b) => {
                const ac = a.storageBin?.code ?? ''
                const bc = b.storageBin?.code ?? ''
                if (ac !== bc) return ac.localeCompare(bc)
                const am =
                    a.batch?.manufacturingDate?.getTime() ??
                    a.updatedAt.getTime()
                const bm =
                    b.batch?.manufacturingDate?.getTime() ??
                    b.updatedAt.getTime()
                return am - bm
            })
        } else {
            // FIFO
            eligible.sort((a, b) => {
                const am =
                    a.batch?.manufacturingDate?.getTime() ??
                    a.updatedAt.getTime()
                const bm =
                    b.batch?.manufacturingDate?.getTime() ??
                    b.updatedAt.getTime()
                return am - bm
            })
        }

        const pick = eligible.find((b) => b.storageBinId) ?? eligible[0]
        if (!pick.storageBinId) {
            throw new BadRequestException('Suggested stock has no storage bin')
        }
        return {
            storageBinId: pick.storageBinId,
            batchId: pick.batchId,
            serialNumberId: pick.serialNumberId,
            quantity: Number(pick.quantity),
            strategy: strat,
        }
    }

    private async syncWaveProgress(waveId: string) {
        const tasks = await this.prisma.wmPickingTask.findMany({
            where: { waveId },
            select: { status: true },
        })
        const completedCount = tasks.filter(
            (t) => t.status === 'COMPLETED',
        ).length
        const allDone =
            tasks.length > 0 &&
            tasks.every(
                (t) => t.status === 'COMPLETED' || t.status === 'CANCELLED',
            )
        await this.prisma.wmPickWave.update({
            where: { id: waveId },
            data: {
                completedCount,
                taskCount: tasks.length,
                ...(allDone ? { status: 'COMPLETED' } : {}),
            },
        })
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.wmPickingTask.findFirst({
            where: { taskNumber: { startsWith: 'PK-' } },
            orderBy: { taskNumber: 'desc' },
            select: { taskNumber: true },
        })
        let seq = 1
        if (last) {
            const num = parseInt(last.taskNumber.replace('PK-', ''), 10)
            if (!isNaN(num)) seq = num + 1
        }
        return `PK-${String(seq).padStart(6, '0')}`
    }
}
