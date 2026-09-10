import { Test, TestingModule } from '@nestjs/testing'
import {
    computeOnTimePct,
    computeQualityAcceptance,
    computePriceVariance,
    computeSupplierMetrics,
    applyWeights,
    aggregateTrend,
    compareSupplierScores,
} from './score-engine'
import { SupplierAlertService } from './supplier-alert.service'
import { PrismaService } from '../../prisma/prisma.service'

const DEFAULT_WEIGHTS = {
    deliveryWeight: 30,
    qualityWeight: 30,
    priceWeight: 20,
    serviceWeight: 10,
    complianceWeight: 10,
}

describe('MM-13 supplier score engine', () => {
    it('computes on-time % from promised vs actual dates', () => {
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
    })

    it('quality = accepted / received', () => {
        const r = computeQualityAcceptance(
            [
                { quantity: 100, passQuantity: 90, failQuantity: 10 },
                { quantity: 50, passQuantity: 50, failQuantity: 0 },
            ],
            [{ quantity: 150, damagedQuantity: 5 }],
        )
        expect(r.acceptanceRate).toBeCloseTo(140 / 150, 5)
        // Fail/damage do not inflate return rate — only supplier returns do
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

    it('weighted overall with default and custom weights', () => {
        const scores = {
            deliveryScore: 100,
            qualityScore: 80,
            priceScore: 60,
            serviceScore: 40,
            complianceScore: 20,
        }
        const def = applyWeights(scores, DEFAULT_WEIGHTS)
        expect(def).toBeCloseTo(72, 5)

        const custom = applyWeights(scores, {
            deliveryWeight: 20,
            qualityWeight: 20,
            priceWeight: 20,
            serviceWeight: 20,
            complianceWeight: 20,
        })
        expect(custom).toBeCloseTo(60, 5)
    })

    it('rejects weights that do not sum to 100', () => {
        expect(() =>
            applyWeights(
                {
                    deliveryScore: 1,
                    qualityScore: 1,
                    priceScore: 1,
                    serviceScore: 1,
                    complianceScore: 1,
                },
                {
                    deliveryWeight: 50,
                    qualityWeight: 50,
                    priceWeight: 0,
                    serviceWeight: 0,
                    complianceWeight: 10,
                },
            ),
        ).toThrow(/sum to 100/)
    })

    it('price variance PO vs invoice → price score', () => {
        const r = computePriceVariance([
            { poUnitPrice: 100, invoiceUnitPrice: 110 },
            { poUnitPrice: 50, invoiceUnitPrice: 50 },
        ])
        expect(r.avgAbsVariancePct).toBeCloseTo((0.1 + 0) / 2, 5)
        expect(r.priceScore).toBeLessThan(100)
        expect(r.priceScore).toBeGreaterThan(0)
    })

    it('full metrics include lead-time blended delivery score', () => {
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
                rfqResponses: [],
                compliance: { totalEvents: 10, exceptionEvents: 0 },
                purchaseVolume: 1000,
                supplierReturnQty: 5,
            },
            DEFAULT_WEIGHTS,
        )
        expect(m.onTimePct).toBe(1)
        expect(m.qualityAcceptanceRate).toBeCloseTo(0.95)
        expect(m.returnRate).toBeCloseTo(0.05)
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
                serviceScore: 60,
                complianceScore: 60,
                purchaseVolume: 80,
            },
        ])
        expect(trend).toHaveLength(2)
        expect(trend[0].overallScore).toBe(60)
        expect(trend[1].overallScore).toBe(70)
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
            score: 55,
            threshold: 70,
            supplierCode: 'SUP-001',
        })
        expect(alert.status).toBe('OPEN')
        expect(mockPrisma.mmSupplierAlert.create).toHaveBeenCalled()
        expect(mockPrisma.mmSupplier.update).not.toHaveBeenCalled()
    })
})

describe('MM-13 manual assessment isolation', () => {
    it('manual assessment service does not touch mmSupplierEvaluation', async () => {
        const mockPrisma: any = {
            mmSupplier: {
                findFirst: jest.fn().mockResolvedValue({ id: 'sup-1' }),
            },
            mmSupplierManualAssessment: {
                create: jest.fn().mockImplementation(async ({ data }) => ({
                    id: 'ma-1',
                    ...data,
                    status: data.status ?? 'DRAFT',
                })),
            },
            mmSupplierEvaluation: {
                update: jest.fn(),
                upsert: jest.fn(),
            },
        }
        const { SupplierManualAssessmentService } = await import(
            './supplier-manual-assessment.service'
        )
        const svc = new SupplierManualAssessmentService(mockPrisma)
        await svc.create({
            companyId: 'co-1',
            supplierId: 'sup-1',
            assessedBy: 'user-1',
            overallScore: 75,
            notes: 'Site visit',
        } as any)
        expect(mockPrisma.mmSupplierManualAssessment.create).toHaveBeenCalled()
        expect(mockPrisma.mmSupplierEvaluation.update).not.toHaveBeenCalled()
        expect(mockPrisma.mmSupplierEvaluation.upsert).not.toHaveBeenCalled()
    })
})
