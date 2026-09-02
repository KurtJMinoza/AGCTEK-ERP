import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertFound,
    optionalDate,
    optionalNumber,
    requireNumber,
    requireString,
} from '../scm.utils'

type GpsPingBody = {
    vehicleId?: string
    tripId?: string | null
    latitude?: number
    longitude?: number
    speedKmh?: number
    heading?: number
    recordedAt?: string | Date
}

@Injectable()
export class TrackingService {
    constructor(private readonly prisma: PrismaService) {}

    async latest(vehicleId: string) {
        assertFound(
            await this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
            'Vehicle not found',
        )

        return (
            (await this.prisma.gpsLog.findFirst({
                where: { vehicleId },
                orderBy: { recordedAt: 'desc' },
            })) ?? null
        )
    }

    async history(
        vehicleId: string,
        query: { from?: string; to?: string; limit?: string },
    ) {
        assertFound(
            await this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
            'Vehicle not found',
        )

        const where: {
            vehicleId: string
            recordedAt?: { gte?: Date; lte?: Date }
        } = { vehicleId }

        const from = optionalDate(query.from)
        const to = optionalDate(query.to)
        if (from || to) {
            where.recordedAt = {}
            if (from) where.recordedAt.gte = from
            if (to) where.recordedAt.lte = to
        }

        const limit = Math.min(1000, Math.max(1, Number(query.limit) || 200))

        return this.prisma.gpsLog.findMany({
            where,
            orderBy: { recordedAt: 'desc' },
            take: limit,
        })
    }

    async ping(body: GpsPingBody) {
        const vehicleId = requireString(body.vehicleId, 'vehicleId')
        assertFound(
            await this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
            'Vehicle not found',
        )

        if (body.tripId) {
            assertFound(
                await this.prisma.trip.findUnique({
                    where: { id: body.tripId },
                }),
                'Trip not found',
            )
        }

        const latitude = requireNumber(body.latitude, 'latitude')
        const longitude = requireNumber(body.longitude, 'longitude')
        if (latitude < -90 || latitude > 90) {
            throw new BadRequestException('latitude out of range')
        }
        if (longitude < -180 || longitude > 180) {
            throw new BadRequestException('longitude out of range')
        }

        return this.prisma.gpsLog.create({
            data: {
                vehicleId,
                tripId: body.tripId || null,
                latitude,
                longitude,
                speedKmh: optionalNumber(body.speedKmh) ?? 0,
                heading: optionalNumber(body.heading),
                recordedAt: optionalDate(body.recordedAt) ?? new Date(),
            },
        })
    }
}
