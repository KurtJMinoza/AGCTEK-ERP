import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ComplianceAuditService } from './compliance-audit.service'

@Injectable()
export class ScanSessionService {
    constructor(
        private prisma: PrismaService,
        private complianceAudit: ComplianceAuditService,
    ) {}

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
        await this.complianceAudit.record({
            companyId: input.companyId,
            domain: 'scan_session',
            action: 'SESSION_STARTED',
            entityType: 'SCAN_SESSION',
            entityId: session.id,
            entityNumber: sessionNumber,
            performedBy: input.userId,
            performedByRole: input.userRole,
        })
        return session
    }

    async complete(sessionId: string, userId?: string) {
        const session = await this.findOpen(sessionId)
        const updated = await this.prisma.mmScanSession.update({
            where: { id: sessionId },
            data: { status: 'COMPLETED', completedAt: new Date() },
        })
        await this.complianceAudit.record({
            companyId: session.companyId,
            domain: 'scan_session',
            action: 'SESSION_COMPLETED',
            entityType: 'SCAN_SESSION',
            entityId: session.id,
            entityNumber: session.sessionNumber,
            performedBy: userId,
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
