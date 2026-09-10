import {
    BadRequestException,
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

        return this.prisma.shipment.create({
            data: {
                reference: requireString(body.reference, 'reference'),
                customerName: optionalString(body.customerName) ?? null,
                externalOrderId: optionalString(body.externalOrderId) ?? null,
                materialCode: optionalString(body.materialCode) ?? null,
                description: optionalString(body.description) ?? null,
                originAddress,
                originLat: optionalNumber(body.originLat),
                originLng: optionalNumber(body.originLng),
                destAddress: requireString(body.destAddress, 'destAddress'),
                destLat: optionalNumber(body.destLat),
                destLng: optionalNumber(body.destLng),
                quantity: requireInt(body.quantity, 'quantity'),
                weightKg: optionalNumber(body.weightKg) ?? 0,
                volumeM3: optionalNumber(body.volumeM3) ?? 0,
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

        return this.prisma.shipment.update({ where: { id }, data })
    }

    async remove(id: string) {
        await this.findOne(id)
        await this.prisma.shipment.delete({ where: { id } })
        return { ok: true }
    }
}
