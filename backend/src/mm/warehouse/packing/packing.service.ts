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
        pickingTask: true,
        reservation: true,
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
        return pkg
    }

    async create(dto: CreatePackageDto) {
        const packageNumber = await this.generateNextCode()

        return this.prisma.wmPackage.create({
            data: {
                packageNumber,
                warehouseId: dto.warehouseId,
                orderNumber: dto.orderNumber ?? null,
                pickingTaskId: dto.pickingTaskId ?? null,
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

    async createFromPickingTask(pickingTaskId: string) {
        const task = await this.prisma.wmPickingTask.findUnique({
            where: { id: pickingTaskId },
            include: { material: true },
        })
        if (!task) throw new NotFoundException('Picking task not found')
        if (new Decimal(task.pickedQty).lte(0)) {
            throw new BadRequestException('Cannot pack: nothing has been picked yet')
        }

        return this.create({
            warehouseId: task.warehouseId,
            orderNumber: task.sourceDocument ?? task.taskNumber,
            pickingTaskId: task.id,
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

    async seal(id: string) {
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
            data: { status: 'SEALED' },
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

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.wmPackage.findFirst({
            where: { packageNumber: { startsWith: 'PKG-' } },
            orderBy: { packageNumber: 'desc' },
            select: { packageNumber: true },
        })
        let seq = 1
        if (last) {
            const num = parseInt(last.packageNumber.replace('PKG-', ''), 10)
            if (!isNaN(num)) seq = num + 1
        }
        return `PKG-${String(seq).padStart(6, '0')}`
    }
}
