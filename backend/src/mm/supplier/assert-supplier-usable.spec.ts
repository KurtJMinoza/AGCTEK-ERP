import { BadRequestException, NotFoundException } from '@nestjs/common'
import { assertSupplierUsable, assertSupplierUsableById } from './assert-supplier-usable'

describe('assertSupplierUsable', () => {
    const active = { id: 's1', status: 'ACTIVE', deletedAt: null, supplierCode: 'SUP-1' }

    it('allows ACTIVE supplier', () => {
        expect(assertSupplierUsable(active)).toBe(active)
    })

    it('rejects missing / deleted', () => {
        expect(() => assertSupplierUsable(null)).toThrow(NotFoundException)
        expect(() => assertSupplierUsable({ ...active, deletedAt: new Date() })).toThrow(
            NotFoundException,
        )
    })

    it('rejects INACTIVE and BLOCKED', () => {
        expect(() => assertSupplierUsable({ ...active, status: 'INACTIVE' })).toThrow(
            BadRequestException,
        )
        expect(() => assertSupplierUsable({ ...active, status: 'BLOCKED' })).toThrow(
            BadRequestException,
        )
    })

    it('rejects DRAFT / PENDING_REVIEW / APPROVED', () => {
        for (const status of ['DRAFT', 'PENDING_REVIEW', 'APPROVED']) {
            expect(() => assertSupplierUsable({ ...active, status })).toThrow(BadRequestException)
        }
    })

    it('assertSupplierUsableById loads then gates', async () => {
        const prisma = {
            mmSupplier: {
                findFirst: jest.fn().mockResolvedValue({ ...active, status: 'INACTIVE' }),
            },
        }
        await expect(assertSupplierUsableById(prisma, 's1')).rejects.toThrow(BadRequestException)
    })
})
