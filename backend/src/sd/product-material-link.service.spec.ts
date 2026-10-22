/**
 * A variant's scannable barcode.
 *
 * The barcode is unique across variants (POS and scanner look it up by
 * barcode). When the caller gives none, the material's own primary barcode is
 * inherited — the same code the item carries in Materials Management.
 */
import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ProductMaterialLinkService } from './product-material-link.service'
import { PrismaService } from '../prisma/prisma.service'

describe('ProductMaterialLinkService.resolveVariantBarcode', () => {
    let service: ProductMaterialLinkService
    const mockPrisma = {
        mmMaterial: { findUnique: jest.fn() },
        sdProductVariant: { findFirst: jest.fn() },
    }
    /** The mocked Prisma transaction client. */
    const tx = () => mockPrisma as unknown as Prisma.TransactionClient

    beforeEach(async () => {
        jest.clearAllMocks()

        const testingModule: TestingModule = await Test.createTestingModule({
            providers: [
                ProductMaterialLinkService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()
        service = testingModule.get(ProductMaterialLinkService)
    })

    it('uses the requested barcode', async () => {
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue(null)

        const barcode = await service.resolveVariantBarcode(
            tx(),
            'mat-1',
            '4800000000101',
        )

        expect(barcode).toBe('4800000000101')
    })

    it('inherits the material primary barcode when none is given', async () => {
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({
            barcodes: [{ barcodeValue: 'MAT-BC-1' }],
        })
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue(null)

        const barcode = await service.resolveVariantBarcode(
            tx(),
            'mat-1',
            null,
        )

        expect(barcode).toBe('MAT-BC-1')
    })

    it('returns null when neither the caller nor the material has a barcode', async () => {
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({ barcodes: [] })

        const barcode = await service.resolveVariantBarcode(
            tx(),
            'mat-1',
            undefined,
        )

        expect(barcode).toBeNull()
    })

    it('rejects a barcode another variant already uses', async () => {
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue({ id: 'v-1' })

        await expect(
            service.resolveVariantBarcode(
                tx(),
                'mat-1',
                '4800000000101',
            ),
        ).rejects.toThrow(ConflictException)
    })

    it('rejects an inherited barcode another variant already uses', async () => {
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({
            barcodes: [{ barcodeValue: 'MAT-BC-1' }],
        })
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue({ id: 'v-1' })

        await expect(
            service.resolveVariantBarcode(tx(), 'mat-1', null),
        ).rejects.toThrow(/already used by another variant/)
    })

    it('ignores the variant being edited', async () => {
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue(null)

        const barcode = await service.resolveVariantBarcode(
            tx(),
            'mat-1',
            '4800000000101',
            ['variant-1'],
        )

        expect(barcode).toBe('4800000000101')
        expect(mockPrisma.sdProductVariant.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: { notIn: ['variant-1'] } }),
            }),
        )
    })
})
