import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * Suspended ("held") POS sales.
 *
 * The parked cart is a snapshot owned by the terminal; SD keeps it so the
 * cashier can serve another customer and resume later.
 */
@Injectable()
export class PosHoldService {
    constructor(private prisma: PrismaService) {}

    async hold(dto: {
        companyId: string
        branchId?: string
        posSessionId?: string
        customerName?: string
        payload: Record<string, unknown>
        createdBy?: string
    }) {
        return this.prisma.sdPosHold.create({
            data: {
                companyId: dto.companyId,
                branchId: dto.branchId?.trim() || null,
                posSessionId: dto.posSessionId?.trim() || null,
                customerName: dto.customerName?.trim() || null,
                payload: dto.payload as unknown as Prisma.InputJsonValue,
                status: 'HELD',
                createdBy: dto.createdBy?.trim() || null,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        })
    }

    async list(
        companyId: string,
        filter: { branchId?: string; status?: string } = {},
    ) {
        return this.prisma.sdPosHold.findMany({
            where: {
                companyId,
                ...(filter.branchId ? { branchId: filter.branchId } : {}),
                ...(filter.status ? { status: filter.status } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        })
    }

    /** Take a held sale back into the cart. */
    async resume(id: string) {
        const hold = await this.prisma.sdPosHold.findUnique({ where: { id } })
        if (!hold) throw new NotFoundException('Held sale not found')
        if (hold.status !== 'HELD') {
            throw new ConflictException('This held sale was already taken.')
        }
        await this.prisma.sdPosHold.update({
            where: { id },
            data: { status: 'RESUMED', resumedAt: new Date() },
        })
        return hold
    }

    async discard(id: string) {
        const hold = await this.prisma.sdPosHold.findUnique({ where: { id } })
        if (!hold) throw new NotFoundException('Held sale not found')
        if (hold.status !== 'HELD') {
            throw new BadRequestException('This held sale was already taken.')
        }
        return this.prisma.sdPosHold.update({
            where: { id },
            data: { status: 'DISCARDED' },
        })
    }
}
