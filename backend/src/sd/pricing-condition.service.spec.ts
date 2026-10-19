import { BadRequestException, ConflictException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import type { ProductService } from './product.service'
import {
    PricingConditionService,
    pricingStatusOf,
} from './pricing-condition.service'

const NOW = new Date('2026-10-17T00:00:00.000Z')
const day = (offset: number) =>
    new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000)

describe('pricingStatusOf', () => {
    it.each([
        ['starts in the future', day(1), null, 'SCHEDULED'],
        ['open-ended and started', day(-1), null, 'ACTIVE'],
        ['ends today', day(-5), NOW, 'ACTIVE'],
        ['ended yesterday', day(-5), day(-1), 'EXPIRED'],
    ])('%s → %s', (_label, validFrom, validTo, expected) => {
        expect(pricingStatusOf({ validFrom, validTo }, NOW)).toBe(expected)
    })
})

describe('PricingConditionService', () => {
    const prisma = {
        sdProduct: { findUnique: jest.fn(), count: jest.fn() },
        sdPricingCondition: {
            create: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
    }
    const service = new PricingConditionService(
        prisma as unknown as PrismaService,
        {} as ProductService,
    )
    const base = {
        conditionType: 'TIER_DISCOUNT' as const,
        name: 'Wholesale 10+ Tier',
        valueType: 'PERCENT_OFF' as const,
        value: 5,
        minQuantity: 10,
        validFrom: '2026-10-01T00:00:00.000Z',
    }

    beforeEach(() => {
        jest.resetAllMocks()
        prisma.sdPricingCondition.findMany.mockResolvedValue([])
        prisma.sdPricingCondition.create.mockImplementation(({ data }) => ({
            id: 'c1',
            product: null,
            ...data,
        }))
    })

    it('generates the next condition code per type', async () => {
        prisma.sdPricingCondition.findMany.mockResolvedValue([
            { conditionCode: 'DISC01' },
            { conditionCode: 'DISC07' },
        ])
        const row = await service.create(base)
        expect(row.conditionCode).toBe('DISC08')
        expect(row.kind).toBe('TIER_DISCOUNT')
    })

    it('requires a minimum quantity for tier discounts', async () => {
        await expect(
            service.create({ ...base, minQuantity: null }),
        ).rejects.toThrow(BadRequestException)
    })

    it('rejects percentages above 100 and inverted validity windows', async () => {
        await expect(service.create({ ...base, value: 120 })).rejects.toThrow(
            'cannot exceed 100%',
        )
        await expect(
            service.create({ ...base, validTo: '2026-09-01T00:00:00.000Z' }),
        ).rejects.toThrow('on or after')
    })

    it('upper-cases promo codes and drops tier quantity on promos', async () => {
        const row = await service.create({
            ...base,
            conditionType: 'PROMO',
            name: '11.11 Sale',
            promoCode: 'sale1111',
        })
        expect(row.promoCode).toBe('SALE1111')
        expect(row.minQuantity).toBeNull()
        expect(row.conditionCode).toBe('PROMO01')
    })

    it('refuses to expire a condition twice', async () => {
        prisma.sdPricingCondition.findUnique.mockResolvedValue({
            conditionCode: 'DISC01',
            validFrom: day(-10),
            validTo: day(-2),
        })
        await expect(service.expire('c1')).rejects.toThrow(ConflictException)
    })
})
