import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { UomConversionsService } from './uom-conversions.service'

describe('UomConversionsService', () => {
    let service: UomConversionsService
    let prisma: any

    beforeEach(() => {
        prisma = {
            mmUomConversion: {
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                findMany: jest.fn(),
            },
            mmMaterial: {
                findFirst: jest.fn(),
            },
        }
        service = new UomConversionsService(prisma)
    })

    describe('create validation', () => {
        it('rejects non-positive factor', async () => {
            await expect(
                service.create({ fromUomId: 'a', toUomId: 'b', factor: 0 }),
            ).rejects.toThrow(BadRequestException)
        })

        it('rejects same from/to UOM', async () => {
            await expect(
                service.create({ fromUomId: 'a', toUomId: 'a', factor: 12 }),
            ).rejects.toThrow(BadRequestException)
        })
    })

    describe('convertQuantity', () => {
        it('converts 1 BOX → 12 PCS using global factor', async () => {
            prisma.mmUomConversion.findFirst
                .mockResolvedValueOnce({ factor: new Decimal(12) }) // forward

            const qty = await service.convertQuantity({
                fromUomId: 'uom-box',
                toUomId: 'uom-pcs',
                quantity: 1,
            })
            expect(qty.toNumber()).toBe(12)
        })

        it('throws when conversion factor is missing', async () => {
            prisma.mmUomConversion.findFirst.mockResolvedValue(null)
            await expect(
                service.convertQuantity({
                    fromUomId: 'uom-box',
                    toUomId: 'uom-pcs',
                    quantity: 1,
                }),
            ).rejects.toThrow(BadRequestException)
        })

        it('prefers material-scoped conversion over global', async () => {
            // First scope = material: forward hit
            prisma.mmUomConversion.findFirst.mockResolvedValueOnce({
                factor: new Decimal(10),
            })

            const qty = await service.convertQuantity({
                materialId: 'mat-1',
                fromUomId: 'uom-box',
                toUomId: 'uom-pcs',
                quantity: 1,
            })
            expect(qty.toNumber()).toBe(10)
            expect(prisma.mmUomConversion.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ materialId: 'mat-1' }),
                }),
            )
        })
    })

    describe('toBaseUom', () => {
        it('returns quantity when already in base UOM', async () => {
            prisma.mmMaterial.findFirst.mockResolvedValue({ baseUomId: 'uom-pcs' })
            const result = await service.toBaseUom('mat-1', 'uom-pcs', 5)
            expect(result.quantity.toNumber()).toBe(5)
            expect(result.baseUomId).toBe('uom-pcs')
        })

        it('throws when material missing', async () => {
            prisma.mmMaterial.findFirst.mockResolvedValue(null)
            await expect(service.toBaseUom('missing', 'uom-pcs', 1)).rejects.toThrow(
                NotFoundException,
            )
        })
    })
})
