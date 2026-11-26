import type { PrismaService } from '../../prisma/prisma.service'
import { BarcodeResolveService } from './barcode-resolve.service'

const MATERIAL = {
    id: 'm1',
    materialCode: 'MAT-000001',
    materialName: 'Aveeno Body Wash',
    sku: 'SKU-000001',
    batchManaged: false,
    serialManaged: false,
    baseUomId: 'uom-1',
}

function build(findFirst: jest.Mock) {
    const prisma = { mmBarcode: { findFirst } } as unknown as PrismaService
    return new BarcodeResolveService(prisma)
}

describe('BarcodeResolveService – leading-zero tolerance', () => {
    it('resolves the exact stored barcode with a single query', async () => {
        const findFirst = jest
            .fn()
            .mockResolvedValue({ materialId: 'm1', material: MATERIAL })

        const hit = await build(findFirst).resolve('062600061546', 'c1')

        expect(hit.materialId).toBe('m1')
        expect(findFirst).toHaveBeenCalledTimes(1)
        expect(findFirst.mock.calls[0][0].where.barcodeValue).toBe('062600061546')
    })

    it('resolves a scanned code whose stored barcode lost its leading zero', async () => {
        const findFirst = jest
            .fn()
            .mockResolvedValueOnce(null) // 062600061546 not stored
            .mockResolvedValueOnce({ materialId: 'm1', material: MATERIAL }) // 62600061546

        const hit = await build(findFirst).resolve('062600061546', 'c1')

        expect(hit.type).toBe('MATERIAL_BARCODE')
        expect(hit.materialId).toBe('m1')
        expect(hit.barcode).toBe('062600061546') // keeps what was scanned
        const alternate = findFirst.mock.calls[1][0].where.barcodeValue as { in: string[] }
        expect(alternate.in).toContain('62600061546')
        expect(findFirst.mock.calls[1][0].where.companyId).toBe('c1')
    })
})
