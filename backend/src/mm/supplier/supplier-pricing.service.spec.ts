import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { SupplierPricingService } from './supplier-pricing.service'

describe('SupplierPricingService', () => {
    let service: SupplierPricingService
    let prisma: any

    beforeEach(() => {
        prisma = {
            mmSupplierPrice: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            mmSupplierMaterial: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
        }
        service = new SupplierPricingService(prisma)
    })

    it('rejects overlapping bands for same min qty', async () => {
        prisma.mmSupplierPrice.findMany.mockResolvedValue([
            {
                id: 'p1',
                effectiveFrom: new Date('2026-01-01'),
                effectiveTo: null,
            },
        ])
        prisma.mmSupplierMaterial.findUnique.mockResolvedValue(null)

        await expect(
            service.create({
                supplierId: 's1',
                materialId: 'm1',
                unitPrice: 10,
                minimumQuantity: 0,
                effectiveFrom: '2026-06-01',
            }),
        ).rejects.toThrow(BadRequestException)
    })

    it('resolvePrice picks highest min qty then latest from', async () => {
        prisma.mmSupplierPrice.findMany.mockResolvedValue([
            {
                id: 'tier-100',
                unitPrice: new Decimal(8),
                minimumQuantity: new Decimal(100),
                effectiveFrom: new Date('2026-01-01'),
                currencyId: null,
            },
        ])

        const hit = await service.resolvePrice({
            supplierId: 's1',
            materialId: 'm1',
            quantity: 150,
            asOf: '2026-03-01',
        })
        expect(hit.id).toBe('tier-100')
        expect(prisma.mmSupplierPrice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    supplierId: 's1',
                    materialId: 'm1',
                }),
                orderBy: [{ minimumQuantity: 'desc' }, { effectiveFrom: 'desc' }],
            }),
        )
    })

    it('resolvePrice throws when no band', async () => {
        prisma.mmSupplierPrice.findMany.mockResolvedValue([])
        await expect(
            service.resolvePrice({ supplierId: 's1', materialId: 'm1', quantity: 1 }),
        ).rejects.toThrow(BadRequestException)
    })

    it('create rejects negative unit price', async () => {
        await expect(
            service.create({
                supplierId: 's1',
                materialId: 'm1',
                unitPrice: -1,
            }),
        ).rejects.toThrow(BadRequestException)
    })
})
