import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { CreatePackageDto } from './dto/create-package.dto'
import { PackageQueryDto } from './dto/package-query.dto'
import { OpenPackingSessionDto, PackingSessionQueryDto } from './dto/packing-session.dto'
import { Decimal } from '@prisma/client/runtime/library'

/**
 * Pack flow: Pick → Packing → Package → Verification → READY_FOR_DISPATCH
 * Dispatch-ready only when scanned contents match expected quantities.
 */
@Injectable()
export class PackingService {
    constructor(private prisma: PrismaService) {}

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

        return this.create({
            warehouseId: task.warehouseId,
            orderNumber: task.sourceDocument ?? task.taskNumber,
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

    async markReadyForDispatch(id: string) {
        const pkg = await this.findOne(id)
        if (pkg.status !== 'VERIFIED' && pkg.status !== 'SEALED') {
            throw new BadRequestException(
                'Package must be VERIFIED or SEALED before READY_FOR_DISPATCH',
            )
        }
        if (!pkg.items.length) {
            throw new BadRequestException('Cannot mark READY_FOR_DISPATCH: package has no items')
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
                'Cannot mark READY_FOR_DISPATCH: package contents do not match expected order',
            )
        }
        return this.prisma.wmPackage.update({
            where: { id },
            data: { status: 'READY_FOR_DISPATCH' },
            include: this.detailIncludes,
        })
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
