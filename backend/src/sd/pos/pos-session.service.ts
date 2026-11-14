import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

export type PosSessionCollections = {
    byMethod: Record<string, number>
    cashCollected: number
    cashChange: number
    tenderCount: number
}

/**
 * Cashier shift (POS register session).
 *
 * The shift owns the opening float and the closing reconciliation; the
 * collections themselves are derived from the tenders collected during the
 * shift, so a tender row is the single source of truth for the money.
 */
@Injectable()
export class PosSessionService {
    constructor(private prisma: PrismaService) {}

    async open(dto: {
        companyId: string
        branchId: string
        terminalCode: string
        cashierUserId: string
        openingCash?: number
        notes?: string
    }) {
        const terminalCode = dto.terminalCode.trim()
        const existing = await this.prisma.sdPosSession.findFirst({
            where: {
                companyId: dto.companyId,
                branchId: dto.branchId,
                terminalCode,
                status: 'OPEN',
            },
        })
        if (existing) {
            throw new ConflictException(
                `Register ${terminalCode} already has an open shift (${existing.openedAt.toISOString()}).`,
            )
        }
        return this.prisma.sdPosSession.create({
            data: {
                companyId: dto.companyId,
                branchId: dto.branchId,
                terminalCode,
                cashierUserId: dto.cashierUserId,
                openingCash: round2(dto.openingCash ?? 0),
                status: 'OPEN',
                notes: dto.notes?.trim() || null,
            },
        })
    }

    /**
     * The open shift of a register, opened on demand. The terminal sells
     * without a shift ceremony: the float starts at 0 and the cashier can
     * still close the shift at the end of the day.
     */
    async ensureOpen(args: {
        companyId: string
        branchId: string
        terminalCode: string
        cashierUserId: string
    }) {
        const terminalCode = args.terminalCode.trim() || 'POS-01'
        const existing = await this.prisma.sdPosSession.findFirst({
            where: {
                companyId: args.companyId,
                branchId: args.branchId,
                terminalCode,
                status: 'OPEN',
            },
            orderBy: { openedAt: 'desc' },
        })
        if (existing) return existing
        return this.prisma.sdPosSession.create({
            data: {
                companyId: args.companyId,
                branchId: args.branchId,
                terminalCode,
                cashierUserId: args.cashierUserId,
                openingCash: 0,
                status: 'OPEN',
            },
        })
    }

    async current(companyId: string, branchId?: string, terminalCode?: string) {
        return this.prisma.sdPosSession.findFirst({
            where: {
                companyId,
                status: 'OPEN',
                ...(branchId ? { branchId } : {}),
                ...(terminalCode ? { terminalCode } : {}),
            },
            orderBy: { openedAt: 'desc' },
        })
    }

    async requireOpen(sessionId: string) {
        const session = await this.prisma.sdPosSession.findUnique({
            where: { id: sessionId },
        })
        if (!session) throw new NotFoundException('Cashier shift not found')
        if (session.status !== 'OPEN') {
            throw new BadRequestException('The cashier shift is already closed.')
        }
        return session
    }

    async list(
        companyId: string,
        filter: { branchId?: string; status?: string } = {},
    ) {
        return this.prisma.sdPosSession.findMany({
            where: {
                companyId,
                ...(filter.branchId ? { branchId: filter.branchId } : {}),
                ...(filter.status ? { status: filter.status } : {}),
            },
            orderBy: { openedAt: 'desc' },
            take: 100,
        })
    }

    /** Money collected during the shift, per tender method. */
    async collections(sessionId: string): Promise<PosSessionCollections> {
        const payments = await this.prisma.sdSalesOrderPayment.findMany({
            where: {
                posSessionId: sessionId,
                status: { notIn: ['Cancelled', 'Refunded', 'Failed'] },
            },
            select: {
                paymentMethod: true,
                amount: true,
                tenderAmount: true,
                changeAmount: true,
            },
        })

        const byMethod: Record<string, number> = {}
        let cashCollected = 0
        let cashChange = 0
        for (const payment of payments) {
            const method = payment.paymentMethod
            byMethod[method] = round2(
                (byMethod[method] ?? 0) + Number(payment.amount),
            )
            if (method === 'CASH') {
                cashCollected = round2(
                    cashCollected + Number(payment.tenderAmount),
                )
                cashChange = round2(cashChange + Number(payment.changeAmount))
            }
        }

        return {
            byMethod,
            cashCollected,
            cashChange,
            tenderCount: payments.length,
        }
    }

    /** Close the shift: compare the counted cash with the expected cash. */
    async close(
        id: string,
        dto: { countedCash: number; notes?: string; closedBy?: string },
    ) {
        const session = await this.prisma.sdPosSession.findUnique({
            where: { id },
        })
        if (!session) throw new NotFoundException('Cashier shift not found')
        if (session.status === 'CLOSED') return session

        const collections = await this.collections(id)
        const expectedCash = round2(
            Number(session.openingCash) +
                collections.cashCollected -
                collections.cashChange,
        )
        const countedCash = round2(dto.countedCash)
        const varianceCash = round2(countedCash - expectedCash)

        return this.prisma.sdPosSession.update({
            where: { id },
            data: {
                status: 'CLOSED',
                closedAt: new Date(),
                closedBy: dto.closedBy?.trim() || null,
                expectedCash,
                countedCash,
                varianceCash,
                notes: dto.notes?.trim() || null,
            },
        })
    }
}
