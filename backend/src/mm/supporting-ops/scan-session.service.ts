import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class ScanSessionService {
    constructor(private prisma: PrismaService) {}

    async start(input: {
        companyId: string
        userId: string
        userRole?: string
        mobileDeviceId?: string
        warehouseId?: string
        businessProcess: string
        sourceDocumentType?: string
        sourceDocumentId?: string
        sourceTaskId?: string
        offlineMode?: boolean
    }) {
        const sessionNumber = await this.nextSessionNumber(input.companyId)
        const session = await this.prisma.mmScanSession.create({
            data: {
                sessionNumber,
                companyId: input.companyId,
                userId: input.userId,
                userRole: input.userRole ?? null,
                mobileDeviceId: input.mobileDeviceId ?? null,
                warehouseId: input.warehouseId ?? null,
                businessProcess: input.businessProcess,
                sourceDocumentType: input.sourceDocumentType ?? null,
                sourceDocumentId: input.sourceDocumentId ?? null,
                sourceTaskId: input.sourceTaskId ?? null,
                offlineMode: !!input.offlineMode,
                status: 'OPEN',
            },
        })
        return session
    }

    async complete(sessionId: string) {
        await this.findOpen(sessionId)
        const updated = await this.prisma.mmScanSession.update({
            where: { id: sessionId },
            data: { status: 'COMPLETED', completedAt: new Date() },
        })
        return updated
    }

    async nextEventSequence(sessionId: string) {
        const max = await this.prisma.mmScannerEvent.aggregate({
            where: { scanSessionId: sessionId },
            _max: { sequenceNumber: true },
        })
        return (max._max.sequenceNumber ?? 0) + 1
    }

    private async findOpen(sessionId: string) {
        const session = await this.prisma.mmScanSession.findUnique({
            where: { id: sessionId },
        })
        if (!session) throw new NotFoundException('Scan session not found')
        if (session.status !== 'OPEN') {
            throw new BadRequestException('Scan session is not open')
        }
        return session
    }

    private async nextSessionNumber(companyId: string) {
        const count = await this.prisma.mmScanSession.count({ where: { companyId } })
        const year = new Date().getFullYear()
        return `SCN-${year}-${String(count + 1).padStart(6, '0')}`
    }
}
