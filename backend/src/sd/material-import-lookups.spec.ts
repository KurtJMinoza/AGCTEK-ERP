import type { PrismaService } from '../prisma/prisma.service'
import { defaultMaterialTypeId } from './material-import-lookups'

function prismaWith(findFirst: jest.Mock) {
    return { mmMaterialType: { findFirst } } as unknown as PrismaService
}

describe('defaultMaterialTypeId', () => {
    it('prefers the MERCHANDISE type for imported / quick-added retail goods', async () => {
        const findFirst = jest.fn().mockResolvedValueOnce({ id: 'type-merch' })

        await expect(defaultMaterialTypeId(prismaWith(findFirst))).resolves.toBe('type-merch')
        expect(findFirst).toHaveBeenCalledTimes(1)
        expect(findFirst.mock.calls[0][0].where.code).toBe('MERCHANDISE')
    })

    it('falls back to the first active type when MERCHANDISE is missing', async () => {
        const findFirst = jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'type-first' })

        await expect(defaultMaterialTypeId(prismaWith(findFirst))).resolves.toBe('type-first')
    })

    it('returns null when no active type exists', async () => {
        const findFirst = jest.fn().mockResolvedValue(null)

        await expect(defaultMaterialTypeId(prismaWith(findFirst))).resolves.toBeNull()
    })
})
