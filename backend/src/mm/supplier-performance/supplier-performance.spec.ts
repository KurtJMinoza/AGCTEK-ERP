import { Test, TestingModule } from '@nestjs/testing'
import {
    computeOnTimePct,
    computeQualityAcceptance,
    computePriceVariance,
    computeQuantityAccuracy,
    computeSupplierMetrics,
    applyWeights,
    aggregateTrend,
    compareSupplierScores,
} from './score-engine'
import { SupplierAlertService } from './supplier-alert.service'
import { PrismaService } from '../../prisma/prisma.service'

const DEFAULT_WEIGHTS = {
    deliveryWeight: 25,
    qualityWeight: 25,
    priceWeight: 20,
    quantityWeight: 15,
    serviceWeight: 10,
    complianceWeight: 5,
}

describe('MM-13 supplier score engine', () => {
    it('computes on-time % and late rate from promised vs actual dates', () => {
        const r = computeOnTimePct([
            {
                promisedDate: new Date('2026-09-10'),
                actualDate: new Date('2026-09-09'),
            },
            {
                promisedDate: new Date('2026-09-10'),
                actualDate: new Date('2026-09-11'),
            },
            {
                promisedDate: null,
                actualDate: new Date('2026-09-11'),
            },
        ])
        expect(r.withPromise).toBe(2)
        expect(r.onTime).toBe(1)
        expect(r.onTimePct).toBe(0.5)
        expect(r.lateDeliveryRate).toBe(0.5)
        expect(r.avgDelayDays).toBe(1)
    })

    it('quality = accepted / received with rejection rate', () => {
        const r = computeQualityAcceptance(
            [
                { quantity: 100, passQuantity: 90, failQuantity: 10 },
                { quantity: 50, passQuantity: 50, failQuantity: 0 },
            ],
            [{ quantity: 150, damagedQuantity: 5 }],
        )
        expect(r.acceptanceRate).toBeCloseTo(140 / 150, 5)
        expect(r.rejectionRate).toBeCloseTo(10 / 150, 5)
        expect(r.returnRate).toBe(0)
    })

    it('return rate = returned qty / received qty', () => {
        const r = computeQualityAcceptance(
            [{ quantity: 100, passQuantity: 90, failQuantity: 10 }],
            [{ quantity: 100, damagedQuantity: 0 }],
            15,
        )
        expect(r.returnRate).toBeCloseTo(15 / 100, 5)
        expect(r.acceptanceRate).toBeCloseTo(90 / 100, 5)
    })

    it('quantity accuracy: fill / shortage / over-delivery', () => {
        const r = computeQuantityAccuracy([
            { orderedQty: 100, receivedQty: 90 },
            { orderedQty: 50, receivedQty: 40 },
        ])
        // totals: ordered 150, received 130
        expect(r.fillRate).toBeCloseTo(130 / 150, 5)
        expect(r.shortageRate).toBeCloseTo(20 / 150, 5)
        expect(r.overDeliveryRate).toBe(0)
        expect(r.quantityScore).toBeGreaterThan(0)

        const over = computeQuantityAccuracy([
            { orderedQty: 100, receivedQty: 120 },
        ])
        expect(over.fillRate).toBe(1)
        expect(over.overDeliveryRate).toBeCloseTo(0.2, 5)
    })

    it('weighted overall includes quantityWeight and sums to 100', () => {
        const scores = {
            deliveryScore: 100,
            qualityScore: 80,
            priceScore: 60,
            quantityScore: 50,
            serviceScore: 40,
            complianceScore: 20,
        }
        const def = applyWeights(scores, DEFAULT_WEIGHTS)
        expect(def).toBeCloseTo(
            (100 * 25 + 80 * 25 + 60 * 20 + 50 * 15 + 40 * 10 + 20 * 5) / 100,
            5,
        )

        const custom = applyWeights(scores, {
            deliveryWeight: 20,
            qualityWeight: 20,
            priceWeight: 20,
            quantityWeight: 20,
            serviceWeight: 10,
            complianceWeight: 10,
        })
        expect(custom).toBeCloseTo(
            (100 * 20 + 80 * 20 + 60 * 20 + 50 * 20 + 40 * 10 + 20 * 10) / 100,
            5,
        )
    })

    it('rejects weights that do not sum to 100', () => {
        expect(() =>
            applyWeights(
                {
                    deliveryScore: 1,
                    qualityScore: 1,
                    priceScore: 1,
                    quantityScore: 1,
                    serviceScore: 1,
                    complianceScore: 1,
                },
                {
                    deliveryWeight: 50,
                    qualityWeight: 50,
                    priceWeight: 0,
                    quantityWeight: 0,
                    serviceWeight: 0,
                    complianceWeight: 10,
                },
            ),
        ).toThrow(/sum to 100/)
    })

    it('price variance PO vs invoice → price score + landed cost variance', () => {
        const r = computePriceVariance([
            { poUnitPrice: 100, invoiceUnitPrice: 110, landedUnitCost: 120 },
            { poUnitPrice: 50, invoiceUnitPrice: 50 },
        ])
        expect(r.avgAbsVariancePct).toBeCloseTo((0.1 + 0) / 2, 5)
        expect(r.landedCostVariancePct).toBeCloseTo(0.2, 5)
        expect(r.priceScore).toBeLessThan(100)
        expect(r.priceScore).toBeGreaterThan(0)
    })

    it('full metrics include quantity and late-delivery fields', () => {
        const m = computeSupplierMetrics(
            {
                deliveries: [
                    {
                        promisedDate: new Date('2026-09-10'),
                        actualDate: new Date('2026-09-10'),
                    },
                ],
                qualityLines: [
                    { quantity: 100, passQuantity: 95, failQuantity: 5 },
                ],
                grLines: [{ quantity: 100, damagedQuantity: 0 }],
                leadTimes: [{ actualLeadDays: 10, promisedLeadDays: 10 }],
                prices: [{ poUnitPrice: 100, invoiceUnitPrice: 100 }],
                quantities: [{ orderedQty: 100, receivedQty: 100 }],
                rfqResponses: [],
                compliance: { totalEvents: 10, exceptionEvents: 0 },
                purchaseVolume: 1000,
                supplierReturnQty: 5,
            },
            DEFAULT_WEIGHTS,
        )
        expect(m.onTimePct).toBe(1)
        expect(m.lateDeliveryRate).toBe(0)
        expect(m.qualityAcceptanceRate).toBeCloseTo(0.95)
        expect(m.rejectionRate).toBeCloseTo(0.05)
        expect(m.returnRate).toBeCloseTo(0.05)
        expect(m.fillRate).toBe(1)
        expect(m.shortageRate).toBe(0)
        expect(m.quantityScore).toBeGreaterThan(0)
        expect(m.overallScore).toBeGreaterThan(0)
    })

    it('aggregates historical trends chronologically', () => {
        const trend = aggregateTrend([
            {
                periodStart: new Date('2026-08-01'),
                periodEnd: new Date('2026-08-31'),
                overallScore: 70,
                deliveryScore: 70,
                qualityScore: 70,
                priceScore: 70,
                quantityScore: 70,
                serviceScore: 70,
                complianceScore: 70,
                purchaseVolume: 100,
            },
            {
                periodStart: new Date('2026-07-01'),
                periodEnd: new Date('2026-07-31'),
                overallScore: 60,
                deliveryScore: 60,
                qualityScore: 60,
                priceScore: 60,
                quantityScore: 60,
                serviceScore: 60,
                complianceScore: 60,
                purchaseVolume: 80,
            },
        ])
        expect(trend).toHaveLength(2)
        expect(trend[0].overallScore).toBe(60)
        expect(trend[1].overallScore).toBe(70)
        expect(trend[1].quantityScore).toBe(70)
    })

    it('compares suppliers by overall score rank', () => {
        const ranked = compareSupplierScores([
            { supplierId: 'b', overallScore: 55, qualityScore: 50 },
            { supplierId: 'a', overallScore: 88, qualityScore: 90 },
            { supplierId: 'c', overallScore: 72, qualityScore: 70 },
        ])
        expect(ranked.map((r) => r.supplierId)).toEqual(['a', 'c', 'b'])
        expect(ranked[0].rank).toBe(1)
        expect(ranked[2].rank).toBe(3)
    })
})

describe('MM-13 alerts never auto-block', () => {
    let service: SupplierAlertService
    const mockPrisma: any = {
        mmSupplierAlert: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(async ({ data }) => ({
                id: 'alert-1',
                ...data,
            })),
            findUnique: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        mmSupplier: {
            update: jest.fn(),
            findUnique: jest.fn(),
        },
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SupplierAlertService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()
        service = module.get(SupplierAlertService)
    })

    it('creates OPEN alert below threshold without touching supplier status', async () => {
        const alert = await service.createIfNeeded({
            companyId: 'co-1',
            supplierId: 'sup-1',
            evaluationId: 'ev-1',
            alertType: 'POOR_SCORE',
            score: 55,
            threshold: 70,
            supplierCode: 'SUP01',
        })
        expect(alert.status).toBe('OPEN')
        expect(alert.alertType).toBe('POOR_SCORE')
        expect(mockPrisma.mmSupplier.update).not.toHaveBeenCalled()
        expect(mockPrisma.mmSupplierAlert.create).toHaveBeenCalled()
    })

    it('creates multi-threshold alert types independently', async () => {
        await service.createIfNeeded({
            companyId: 'co-1',
            supplierId: 'sup-1',
            evaluationId: 'ev-1',
            alertType: 'LATE_DELIVERY',
            score: 0.4,
            threshold: 0.25,
            supplierCode: 'SUP01',
        })
        await service.createIfNeeded({
            companyId: 'co-1',
            supplierId: 'sup-1',
            evaluationId: 'ev-1',
            alertType: 'REPEATED_SHORTAGE',
            score: 0.2,
            threshold: 0.15,
            supplierCode: 'SUP01',
        })
        expect(mockPrisma.mmSupplierAlert.create).toHaveBeenCalledTimes(2)
        expect(mockPrisma.mmSupplier.update).not.toHaveBeenCalled()
        const types = mockPrisma.mmSupplierAlert.create.mock.calls.map(
            (c: any) => c[0].data.alertType,
        )
        expect(types).toEqual(['LATE_DELIVERY', 'REPEATED_SHORTAGE'])
    })

    it('does not expose a blockSupplier API', () => {
        expect((service as any).blockSupplier).toBeUndefined()
        expect((service as any).deactivateSupplier).toBeUndefined()
    })
})
