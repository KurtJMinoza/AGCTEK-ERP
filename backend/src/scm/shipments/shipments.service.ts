import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common'
import { Prisma, ShipmentMovementType, ShipmentStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertFound,
    optionalDate,
    optionalNumber,
    optionalString,
    parsePagination,
    requireInt,
    requireNumber,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'

type CreateShipmentBody = {
    reference?: string
    customerName?: string | null
    externalOrderId?: string | null
    materialCode?: string | null
    description?: string | null
    originAddress?: string
    originLat?: number
    originLng?: number
    destAddress?: string
    destLat?: number
    destLng?: number
    weightKg?: number
    volumeM3?: number
    quantity?: number
    status?: ShipmentStatus
    movementType?: ShipmentMovementType
    requestedPickupAt?: string | Date
    requestedDeliveryAt?: string | Date
    earliestDeliveryAt?: string | Date
    latestDeliveryAt?: string | Date
    podSignatureUrl?: string | null
    podPhotoUrl?: string | null
    notes?: string | null
}

const SHIPMENT_STATUSES = new Set(Object.values(ShipmentStatus))
const MOVEMENT_TYPES = new Set(Object.values(ShipmentMovementType))

function parseMovementType(
    value: unknown,
    fallback?: ShipmentMovementType,
): ShipmentMovementType {
    if (value === undefined || value === null || value === '') {
        if (fallback) return fallback
        return ShipmentMovementType.DELIVERY
    }
    if (typeof value !== 'string' || !MOVEMENT_TYPES.has(value as ShipmentMovementType)) {
        throw new BadRequestException(
            'movementType must be DELIVERY (shipping) or PICKUP',
        )
    }
    return value as ShipmentMovementType
}

@Injectable()
export class ShipmentsService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(query: ListQuery): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.ShipmentWhereInput = {}

        if (query.status) {
            if (!SHIPMENT_STATUSES.has(query.status as ShipmentStatus)) {
                throw new BadRequestException('Invalid shipment status')
            }
            where.status = query.status as ShipmentStatus
        }

        if (query.movementType) {
            where.movementType = parseMovementType(query.movementType)
        }

        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { reference: { contains: q, mode: 'insensitive' } },
                { customerName: { contains: q, mode: 'insensitive' } },
                { originAddress: { contains: q, mode: 'insensitive' } },
                { destAddress: { contains: q, mode: 'insensitive' } },
                { externalOrderId: { contains: q, mode: 'insensitive' } },
                { materialCode: { contains: q, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.shipment.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.shipment.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return assertFound(
            await this.prisma.shipment.findUnique({ where: { id } }),
            'Shipment not found',
        )
    }

    async create(body: CreateShipmentBody) {
        const status = body.status ?? ShipmentStatus.DRAFT
        if (!SHIPMENT_STATUSES.has(status)) {
            throw new BadRequestException('Invalid shipment status')
        }

        const movementType = parseMovementType(body.movementType)
        const originAddress = optionalString(body.originAddress) ?? null
        if (movementType === ShipmentMovementType.PICKUP && !originAddress) {
            throw new BadRequestException(
                'Pickup shipments require a pickup-from address (originAddress)',
            )
        }

        const materialCode = optionalString(body.materialCode) ?? null
        const description = optionalString(body.description) ?? null
        const originLat = optionalNumber(body.originLat)
        const originLng = optionalNumber(body.originLng)
        const destAddress = requireString(body.destAddress, 'destAddress')
        const destLat = optionalNumber(body.destLat)
        const destLng = optionalNumber(body.destLng)
        const quantity = requireInt(body.quantity, 'quantity')
        const weightKg = optionalNumber(body.weightKg) ?? 0
        const volumeM3 = optionalNumber(body.volumeM3) ?? 0

        return this.prisma.shipment.create({
            data: {
                reference: requireString(body.reference, 'reference'),
                customerName: optionalString(body.customerName) ?? null,
                externalOrderId: optionalString(body.externalOrderId) ?? null,
                materialCode,
                description,
                originAddress,
                originLat,
                originLng,
                destAddress,
                destLat,
                destLng,
                quantity,
                weightKg,
                volumeM3,
                lines: {
                    create: {
                        lineNo: 1,
                        materialCode,
                        description,
                        quantity,
                        weightKg,
                        volumeM3,
                        shipFromAddress: originAddress,
                        shipFromLat: originLat ?? null,
                        shipFromLng: originLng ?? null,
                        shipToAddress: destAddress,
                        shipToLat: destLat ?? null,
                        shipToLng: destLng ?? null,
                    },
                },
                movementType,
                status,
                requestedPickupAt: optionalDate(body.requestedPickupAt),
                requestedDeliveryAt: optionalDate(body.requestedDeliveryAt),
                earliestDeliveryAt: optionalDate(body.earliestDeliveryAt),
                latestDeliveryAt: optionalDate(body.latestDeliveryAt),
                notes: optionalString(body.notes) ?? null,
            },
        })
    }

    async update(id: string, body: CreateShipmentBody) {
        const existing = await this.findOne(id)
        const data: Prisma.ShipmentUpdateInput = {}

        if (body.reference !== undefined) {
            data.reference = requireString(body.reference, 'reference')
        }
        if (body.customerName !== undefined) {
            data.customerName = optionalString(body.customerName) ?? null
        }
        if (body.externalOrderId !== undefined) {
            data.externalOrderId = optionalString(body.externalOrderId) ?? null
        }
        if (body.materialCode !== undefined) {
            data.materialCode = optionalString(body.materialCode) ?? null
        }
        if (body.description !== undefined) {
            data.description = optionalString(body.description) ?? null
        }
        if (body.originAddress !== undefined) {
            data.originAddress = optionalString(body.originAddress) ?? null
        }
        if (body.originLat !== undefined) {
            data.originLat = optionalNumber(body.originLat) ?? null
        }
        if (body.originLng !== undefined) {
            data.originLng = optionalNumber(body.originLng) ?? null
        }
        if (body.destAddress !== undefined) {
            data.destAddress = requireString(body.destAddress, 'destAddress')
        }
        if (body.destLat !== undefined) {
            data.destLat = optionalNumber(body.destLat) ?? null
        }
        if (body.destLng !== undefined) {
            data.destLng = optionalNumber(body.destLng) ?? null
        }
        if (body.quantity !== undefined) {
            data.quantity = requireInt(body.quantity, 'quantity')
        }
        if (body.movementType !== undefined) {
            data.movementType = parseMovementType(body.movementType)
        }
        if (body.weightKg !== undefined) {
            data.weightKg = requireNumber(body.weightKg, 'weightKg')
        }
        if (body.volumeM3 !== undefined) {
            data.volumeM3 = requireNumber(body.volumeM3, 'volumeM3')
        }
        if (body.status !== undefined) {
            if (!SHIPMENT_STATUSES.has(body.status)) {
                throw new BadRequestException('Invalid shipment status')
            }
            data.status = body.status
            if (
                body.status === ShipmentStatus.DELIVERED &&
                !existing.deliveredAt
            ) {
                data.deliveredAt = new Date()
            }
        }
        if (body.requestedPickupAt !== undefined) {
            data.requestedPickupAt =
                optionalDate(body.requestedPickupAt) ?? null
        }
        if (body.requestedDeliveryAt !== undefined) {
            data.requestedDeliveryAt =
                optionalDate(body.requestedDeliveryAt) ?? null
        }
        if (body.earliestDeliveryAt !== undefined) {
            data.earliestDeliveryAt =
                optionalDate(body.earliestDeliveryAt) ?? null
        }
        if (body.latestDeliveryAt !== undefined) {
            data.latestDeliveryAt =
                optionalDate(body.latestDeliveryAt) ?? null
        }
        if (body.podSignatureUrl !== undefined) {
            data.podSignatureUrl = optionalString(body.podSignatureUrl) ?? null
        }
        if (body.podPhotoUrl !== undefined) {
            data.podPhotoUrl = optionalString(body.podPhotoUrl) ?? null
        }
        if (body.notes !== undefined) {
            data.notes = optionalString(body.notes) ?? null
        }

        const nextMovement =
            body.movementType !== undefined
                ? parseMovementType(body.movementType)
                : existing.movementType
        const nextOrigin =
            body.originAddress !== undefined
                ? optionalString(body.originAddress) ?? null
                : existing.originAddress
        if (nextMovement === ShipmentMovementType.PICKUP && !nextOrigin) {
            throw new BadRequestException(
                'Pickup shipments require a pickup-from address (originAddress)',
            )
        }

        // POD present → mark delivered
        if (
            (body.podSignatureUrl || body.podPhotoUrl) &&
            body.status === undefined
        ) {
            data.status = ShipmentStatus.DELIVERED
            if (!existing.deliveredAt) {
                data.deliveredAt = new Date()
            }
        }

        const cargoChanged = [
            body.quantity,
            body.weightKg,
            body.volumeM3,
            body.originAddress,
            body.originLat,
            body.originLng,
            body.destAddress,
            body.destLat,
            body.destLng,
            body.materialCode,
            body.description,
        ].some((v) => v !== undefined)

        if (!cargoChanged) {
            return this.prisma.shipment.update({ where: { id }, data })
        }

        const lines = await this.prisma.shipmentLine.findMany({
            where: { shipmentId: id },
            include: { loadPlanLine: { select: { id: true } } },
        })
        if (lines.some((line) => line.loadPlanLine)) {
            throw new ConflictException(
                'Shipment cargo is on a load plan — remove it in Load Building before editing quantity or addresses',
            )
        }
        if (
            lines.length > 1 &&
            [body.quantity, body.weightKg, body.volumeM3].some((v) => v !== undefined)
        ) {
            throw new BadRequestException(
                'Multi-line shipment quantities come from its lines (MM package items)',
            )
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.shipment.update({ where: { id }, data })
            // single-line shipments mirror the header; multi-line (MM package) lines stay as released
            if (lines.length === 1) {
                await tx.shipmentLine.update({
                    where: { id: lines[0].id },
                    data: {
                        materialCode: updated.materialCode,
                        description: updated.description,
                        quantity: updated.quantity,
                        weightKg: updated.weightKg,
                        volumeM3: updated.volumeM3,
                        shipFromAddress: updated.originAddress,
                        shipFromLat: updated.originLat,
                        shipFromLng: updated.originLng,
                        shipToAddress: updated.destAddress,
                        shipToLat: updated.destLat,
                        shipToLng: updated.destLng,
                    },
                })
            } else if (lines.length > 1) {
                await tx.shipmentLine.updateMany({
                    where: { shipmentId: id },
                    data: {
                        shipFromAddress: updated.originAddress,
                        shipFromLat: updated.originLat,
                        shipFromLng: updated.originLng,
                        shipToAddress: updated.destAddress,
                        shipToLat: updated.destLat,
                        shipToLng: updated.destLng,
                    },
                })
            }
            return updated
        })
    }

    async remove(id: string) {
        await this.findOne(id)
        await this.prisma.shipment.delete({ where: { id } })
        return { ok: true }
    }

    /**
     * Idempotent MM → SCM release: READY shipment linked to a packed package.
     */
    async createFromPackage(packageId: string) {
        const existing = await this.prisma.shipment.findUnique({
            where: { packageId },
        })
        if (existing) return existing

        const pkg = await this.prisma.wmPackage.findUnique({
            where: { id: packageId },
            include: {
                items: { include: { material: true } },
                warehouse: true,
            },
        })
        if (!pkg) {
            throw new BadRequestException('Package not found')
        }
        if (
            pkg.status !== 'READY_FOR_DISPATCH' &&
            pkg.status !== 'DISPATCHED'
        ) {
            throw new BadRequestException(
                `Package must be READY_FOR_DISPATCH to release to SCM (current: ${pkg.status})`,
            )
        }

        const destAddress = pkg.shipToAddress?.trim()
        if (!destAddress) {
            throw new BadRequestException(
                'Package shipToAddress is required before SCM release',
            )
        }

        const itemLines = pkg.items
            .map((item) => ({ item, qty: Math.round(Number(item.scannedQty)) }))
            .filter((row) => row.qty > 0)
        const itemQtyTotal = itemLines.reduce((sum, row) => sum + row.qty, 0)
        const quantity = Math.max(1, itemQtyTotal)

        const materialCodes = [
            ...new Set(
                pkg.items
                    .map((item) => item.material?.materialCode)
                    .filter((code): code is string => Boolean(code)),
            ),
        ]
        const materialCode =
            materialCodes.length === 1 ? materialCodes[0] : null
        const description =
            materialCodes.length > 1
                ? `Package ${pkg.packageNumber}: ${materialCodes.join(', ')}`
                : materialCodes.length === 1
                  ? `Package ${pkg.packageNumber}: ${materialCodes[0]}`
                  : `Package ${pkg.packageNumber}`

        const weightKg = pkg.weight != null ? Number(pkg.weight) : 0
        const originAddress =
            pkg.warehouse.address?.trim() ||
            `${pkg.warehouse.code} — ${pkg.warehouse.name}`

        const reference = `MM-${pkg.packageNumber}`
        const clash = await this.prisma.shipment.findUnique({
            where: { reference },
        })
        const finalRef = clash
            ? `MM-${pkg.packageNumber}-${Date.now().toString(36).slice(-4)}`
            : reference

        const safeWeight = Number.isFinite(weightKg) ? weightKg : 0
        const lineBase = {
            shipFromWarehouseId: pkg.warehouseId,
            shipFromAddress: originAddress,
            shipToAddress: destAddress,
            shipToLat: pkg.shipToLat ?? null,
            shipToLng: pkg.shipToLng ?? null,
            volumeM3: 0,
        }
        // one line per package item; package weight split by quantity share
        const lines =
            itemLines.length > 0
                ? itemLines.map((row, index) => ({
                      ...lineBase,
                      lineNo: index + 1,
                      packageItemId: row.item.id,
                      materialCode: row.item.material?.materialCode ?? null,
                      description: row.item.material?.description ?? null,
                      quantity: row.qty,
                      weightKg:
                          itemQtyTotal > 0
                              ? Math.round((safeWeight * row.qty * 1000) / itemQtyTotal) / 1000
                              : 0,
                  }))
                : [
                      {
                          ...lineBase,
                          lineNo: 1,
                          materialCode,
                          description,
                          quantity,
                          weightKg: safeWeight,
                      },
                  ]

        return this.prisma.shipment.create({
            data: {
                reference: finalRef,
                customerName: pkg.shipToName?.trim() || null,
                externalOrderId: pkg.orderNumber?.trim() || pkg.packageNumber,
                materialCode,
                description,
                packageId: pkg.id,
                originAddress,
                destAddress,
                destLat: pkg.shipToLat ?? null,
                destLng: pkg.shipToLng ?? null,
                quantity,
                weightKg: safeWeight,
                volumeM3: 0,
                lines: { create: lines },
                movementType: ShipmentMovementType.DELIVERY,
                status: ShipmentStatus.READY,
                notes: pkg.carrier
                    ? `Carrier: ${pkg.carrier}${
                          pkg.trackingNumber
                              ? ` · ${pkg.trackingNumber}`
                              : ''
                      }`
                    : null,
            },
        })
    }
}
