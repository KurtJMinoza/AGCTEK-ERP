import {
    Injectable,
    BadRequestException,
    ForbiddenException,
    UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { randomBytes } from 'crypto'

const SESSION_HOURS = 12

@Injectable()
export class MobileDeviceService {
    constructor(private prisma: PrismaService) {}

    async register(input: {
        deviceCode: string
        companyId: string
        userId?: string
        name?: string
        platform?: string
    }) {
        const existing = await this.prisma.mmMobileDevice.findUnique({
            where: { deviceCode: input.deviceCode },
        })
        if (existing) {
            if (existing.status === 'REVOKED' || existing.status === 'DISABLED') {
                throw new ForbiddenException(
                    'UNAUTHORIZED_DEVICE: Device is revoked or disabled',
                )
            }
            return this.refreshSession(existing.id, input.userId)
        }

        const sessionToken = randomBytes(24).toString('hex')
        const sessionExpiresAt = new Date()
        sessionExpiresAt.setHours(sessionExpiresAt.getHours() + SESSION_HOURS)

        return this.prisma.mmMobileDevice.create({
            data: {
                deviceCode: input.deviceCode,
                companyId: input.companyId,
                userId: input.userId ?? null,
                name: input.name ?? null,
                platform: input.platform ?? 'WEB',
                status: 'ACTIVE',
                sessionToken,
                sessionExpiresAt,
                lastSeenAt: new Date(),
            },
        })
    }

    async refreshSession(id: string, userId?: string) {
        const sessionToken = randomBytes(24).toString('hex')
        const sessionExpiresAt = new Date()
        sessionExpiresAt.setHours(sessionExpiresAt.getHours() + SESSION_HOURS)
        return this.prisma.mmMobileDevice.update({
            where: { id },
            data: {
                sessionToken,
                sessionExpiresAt,
                lastSeenAt: new Date(),
                ...(userId ? { userId } : {}),
            },
        })
    }

    async revoke(deviceCode: string) {
        const device = await this.prisma.mmMobileDevice.findUnique({
            where: { deviceCode },
        })
        if (!device) throw new BadRequestException('Device not found')
        return this.prisma.mmMobileDevice.update({
            where: { id: device.id },
            data: {
                status: 'REVOKED',
                revokedAt: new Date(),
                sessionToken: null,
                sessionExpiresAt: null,
            },
        })
    }

    /**
     * Authorize device for mobile execution.
     * Unknown deviceCode with companyId auto-registers (web/dev convenience).
     * Known REVOKED/DISABLED → UNAUTHORIZED_DEVICE.
     * Expired session → EXPIRED_SESSION.
     */
    async assertAuthorized(opts: {
        deviceId: string
        companyId?: string
        userId?: string
        sessionToken?: string
        requireRegistered?: boolean
    }) {
        let device = await this.prisma.mmMobileDevice.findUnique({
            where: { deviceCode: opts.deviceId },
        })

        if (!device) {
            if (opts.requireRegistered) {
                throw new ForbiddenException(
                    'UNAUTHORIZED_DEVICE: Device is not registered',
                )
            }
            if (!opts.companyId) {
                throw new ForbiddenException(
                    'UNAUTHORIZED_DEVICE: Device is not registered',
                )
            }
            device = await this.register({
                deviceCode: opts.deviceId,
                companyId: opts.companyId,
                userId: opts.userId,
            })
            return device
        }

        if (device.status === 'REVOKED' || device.status === 'DISABLED') {
            throw new ForbiddenException(
                'UNAUTHORIZED_DEVICE: Device is revoked or disabled',
            )
        }

        if (
            device.sessionExpiresAt &&
            device.sessionExpiresAt.getTime() < Date.now()
        ) {
            throw new UnauthorizedException(
                'EXPIRED_SESSION: Mobile device session has expired',
            )
        }

        if (
            opts.sessionToken &&
            device.sessionToken &&
            opts.sessionToken !== device.sessionToken
        ) {
            throw new UnauthorizedException(
                'EXPIRED_SESSION: Invalid or expired session token',
            )
        }

        if (
            opts.userId &&
            device.userId &&
            device.userId !== opts.userId
        ) {
            throw new ForbiddenException(
                'REVOKED_PERMISSION: Device is bound to a different user',
            )
        }

        await this.prisma.mmMobileDevice.update({
            where: { id: device.id },
            data: { lastSeenAt: new Date() },
        })

        return device
    }
}
