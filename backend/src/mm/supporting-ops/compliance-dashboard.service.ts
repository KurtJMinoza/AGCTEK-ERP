import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class ComplianceDashboardService {
    constructor(private prisma: PrismaService) {}

    async summary(companyId: string) {
        const now = new Date()
        const [
            pendingOverrides,
            docsAwaitingReview,
            expiredDocs,
            openScanSessions,
            rejectedScans24h,
            totalScans24h,
            revokedDevices,
            activeRfid,
            archivedBarcodes,
        ] = await Promise.all([
            this.prisma.mmScanOverride.count({
                where: { companyId, status: 'PENDING' },
            }),
            this.prisma.mmControlledDocument.count({
                where: {
                    companyId,
                    archivedAt: null,
                    status: { in: ['DRAFT', 'UNDER_REVIEW', 'CHANGES_REQUESTED'] },
                },
            }),
            this.prisma.mmControlledDocument.count({
                where: {
                    companyId,
                    archivedAt: null,
                    expirationDate: { lt: now },
                    status: { notIn: ['ARCHIVED', 'OBSOLETE'] },
                },
            }),
            this.prisma.mmScanSession.count({
                where: { companyId, status: 'OPEN' },
            }),
            this.prisma.mmScannerEvent.count({
                where: {
                    companyId,
                    status: { in: ['FAILED', 'REJECTED', 'CONFLICT'] },
                    createdAt: { gte: new Date(now.getTime() - 86400000) },
                },
            }),
            this.prisma.mmScannerEvent.count({
                where: {
                    companyId,
                    createdAt: { gte: new Date(now.getTime() - 86400000) },
                },
            }),
            this.prisma.mmMobileDevice.count({
                where: { companyId, revokedAt: { not: null } },
            }),
            this.prisma.mmRfidTag.count({
                where: { companyId, status: { in: ['ASSIGNED', 'ACTIVE', 'STORED'] }, archivedAt: null },
            }),
            this.prisma.mmBarcode.count({
                where: { companyId, status: 'ARCHIVED' },
            }),
        ])

        const scanCompliancePct =
            totalScans24h > 0
                ? Math.round(((totalScans24h - rejectedScans24h) / totalScans24h) * 1000) / 10
                : null

        return {
            companyId,
            generatedAt: now.toISOString(),
            pendingScanOverrides: pendingOverrides,
            documentsAwaitingReview: docsAwaitingReview,
            expiredControlledDocuments: expiredDocs,
            openScanSessions,
            scanEventsLast24h: totalScans24h,
            rejectedScansLast24h: rejectedScans24h,
            scanCompliancePercentLast24h: scanCompliancePct,
            revokedWarehouseDevices: revokedDevices,
            activeRfidTags: activeRfid,
            archivedBarcodes,
        }
    }
}
