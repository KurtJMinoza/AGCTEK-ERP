import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { BarcodeRegistryService } from './barcode-registry.service'
import { ScanOverrideService } from './scan-override.service'
import { RfidTagService } from './rfid-tag.service'
import { ComplianceAuditService } from './compliance-audit.service'

describe('ISO supporting operations', () => {
    const prisma: any = {
        mmMaterial: { findFirst: jest.fn() },
        mmBatch: { findFirst: jest.fn() },
        mmBarcode: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            updateMany: jest.fn(),
        },
        mmScanOverride: {
            create: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        mmRfidTag: {
            findFirst: jest.fn(),
            upsert: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        mmComplianceAuditEntry: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    }
    const audit = new ComplianceAuditService(prisma)

    it('archived barcode rejected at registry assertScannable via effective dates', async () => {
        const registry = new BarcodeRegistryService(prisma, audit)
        prisma.mmBarcode.findFirst.mockResolvedValue({
            id: 'bc-1',
            effectiveTo: new Date('2020-01-01'),
        })
        await expect(registry.assertScannable('X', 'c1')).rejects.toThrow(BadRequestException)
    })

    it('scan override requester cannot self-approve', async () => {
        const overrides = new ScanOverrideService(prisma, audit)
        prisma.mmScanOverride.findUnique.mockResolvedValue({
            id: 'o1',
            status: 'PENDING',
            requestedBy: 'user-1',
            companyId: 'c1',
            overrideNumber: 'OVR-1',
        })
        await expect(overrides.approve('o1', 'user-1')).rejects.toThrow(ForbiddenException)
    })

    it('RFID read deduplicates within window', async () => {
        const rfid = new RfidTagService(prisma, audit)
        const now = new Date()
        prisma.mmRfidTag.findUnique.mockResolvedValue({
            id: 't1',
            tagValue: 'EPC-1',
            lastReadAt: now,
            lastReaderId: 'R1',
            status: 'ASSIGNED',
        })
        const result = await rfid.recordRead({
            companyId: 'c1',
            tagValue: 'EPC-1',
            readerId: 'R1',
        })
        expect(result.duplicateRead).toBe(true)
        expect(prisma.mmRfidTag.update).not.toHaveBeenCalled()
    })
})
