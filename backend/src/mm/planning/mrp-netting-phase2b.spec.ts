/**
 * Phase 2B: Deterministic MRP netting pipeline
 */
import { Decimal } from '@prisma/client/runtime/library'
import { Test, TestingModule } from '@nestjs/testing'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CalendarDayPlanningCalendar } from './calendar-day-planning-calendar'
import {
    applySafetyStockRules,
    detectProjectedShortage,
    runNettingPipeline,
    applyLotSizeAndMoq,
    buildPipelineExplanation,
} from './mrp-netting.pipeline'
import { buildProjectedStockBuckets } from './projected-stock.service'
import type { PairSnapshot } from './mrp-scope-loader.service'
import type { ResolvedPlanningParams } from './reorder-rule.service'
import { MmDemandAggregationService } from '../integration/demand/mm-demand-aggregation.service'
import { MrpScopeLoaderService } from './mrp-scope-loader.service'
import { InventoryAvailabilityService } from '../inventory/inventory-availability.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('MRP Netting Phase 2B', () => {
    const calendar = new CalendarDayPlanningCalendar()
    const asOf = new Date('2026-09-11T00:00:00.000Z')
    const horizonEnd = new Date('2026-09-25T00:00:00.000Z')

    const timePhasedParams: ResolvedPlanningParams = {
        reorderPoint: new Decimal(0),
        safetyStock: new Decimal(100),
        reorderQuantity: new Decimal(0),
        minimumOrderQuantity: new Decimal(25),
        minStock: new Decimal(0),
        maxStock: new Decimal(0),
        lotSize: new Decimal(10),
        reviewPeriodDays: 0,
        planningHorizonDays: null,
        planningStrategy: 'TIME_PHASED',
        procurementType: 'BUY',
        leadTimeDays: 7,
        source: 'RULE',
    }

    function buildSepExampleSnap(): PairSnapshot {
        return {
            unrestrictedQty: new Decimal(150),
            reservedQty: new Decimal(0),
            qualityQty: new Decimal(0),
            blockedQty: new Decimal(0),
            openingAvailable: new Decimal(150),
            demandQty: new Decimal(280),
            independentDemandQty: new Decimal(280),
            bomDependentDemandQty: new Decimal(0),
            incomingQty: new Decimal(200),
            plannedSupplyQty: new Decimal(0),
            productionSupplyQty: new Decimal(0),
            earliestDemandDate: new Date('2026-09-15T00:00:00.000Z'),
            demandSourceTypes: ['SALES'],
            demandIds: ['d1', 'd2'],
            independentDemandLines: [
                {
                    id: 'd1',
                    sourceType: 'SALES',
                    sourceDocumentId: 'SO-1001',
                    demandDate: new Date('2026-09-15T00:00:00.000Z'),
                    quantity: new Decimal(100),
                    warehouseId: 'wh-1',
                },
                {
                    id: 'd2',
                    sourceType: 'SALES',
                    sourceDocumentId: null,
                    demandDate: new Date('2026-09-25T00:00:00.000Z'),
                    quantity: new Decimal(180),
                    warehouseId: 'wh-1',
                },
            ],
            demandEvents: [
                { date: new Date('2026-09-15T00:00:00.000Z'), quantity: new Decimal(100) },
                { date: new Date('2026-09-25T00:00:00.000Z'), quantity: new Decimal(180) },
            ],
            supplyEvents: [
                { date: new Date('2026-09-20T00:00:00.000Z'), quantity: new Decimal(200) },
            ],
            reservationEvents: [],
        }
    }

    it('TIME_PHASED Sep 15/20/25 example — shortage 30 on Sep 25', () => {
        const snap = buildSepExampleSnap()
        const result = runNettingPipeline({
            snap,
            params: timePhasedParams,
            asOf,
            horizonEnd,
            includeOpenReceipts: true,
            calendar,
        })

        expect(Number(result.net.shortageQty)).toBe(30)
        expect(Number(result.net.recommendedQty)).toBe(30)
        expect(result.shortageDate?.toISOString().slice(0, 10)).toBe('2026-09-25')
        expect(Number(result.projectedClosingQty)).toBe(70)

        const buckets = result.buckets
        const sep15 = buckets.find((b) => b.bucketDate.toISOString().slice(0, 10) === '2026-09-15')
        const sep20 = buckets.find((b) => b.bucketDate.toISOString().slice(0, 10) === '2026-09-20')
        const sep25 = buckets.find((b) => b.bucketDate.toISOString().slice(0, 10) === '2026-09-25')
        expect(Number(sep15?.closingQty)).toBe(50)
        expect(Number(sep20?.closingQty)).toBe(250)
        expect(Number(sep25?.closingQty)).toBe(70)

        expect(result.net.expectedProcurementDate?.toISOString().slice(0, 10)).toBe(
            '2026-09-18',
        )
    })

    it('explanation cites violation date, projected closing, and safety deficit', () => {
        const snap = buildSepExampleSnap()
        const result = runNettingPipeline({
            snap,
            params: timePhasedParams,
            asOf,
            horizonEnd,
            includeOpenReceipts: true,
            calendar,
        })
        const text = buildPipelineExplanation({
            materialCode: 'RM-001',
            warehouseId: 'wh-1',
            snap,
            net: result.net,
            params: timePhasedParams,
            reasonCode: 'SHORTAGE',
            demandSource: 'SALES',
            planningDate: result.shortageDate!,
            independentDemandLines: snap.independentDemandLines,
            timePhased: {
                violationDate: result.shortageDate!,
                projectedClosing: result.projectedClosingQty!,
                safetyStockViolation: result.safetyStockViolationQty!,
            },
        })
        expect(text).toContain('Violation date: 2026-09-25')
        expect(text).toContain('Projected closing: 70')
        expect(text).toContain('Safety deficit: 30')
    })

    it('MOQ and lot size applied after bucket shortage', () => {
        const qty = applyLotSizeAndMoq(
            new Decimal(12),
            new Decimal(25),
            new Decimal(10),
            new Decimal(0),
        )
        expect(Number(qty)).toBe(30)
    })

    it('REORDER_POINT uses aggregate netting — no bucket shortage date', () => {
        const snap = buildSepExampleSnap()
        const result = runNettingPipeline({
            snap,
            params: { ...timePhasedParams, planningStrategy: 'REORDER_POINT' },
            asOf,
            horizonEnd,
            includeOpenReceipts: true,
            calendar,
        })
        expect(result.shortageDate).toBeNull()
        expect(result.safetyStockViolationQty).toBeNull()
    })

    it('deterministic — identical inputs yield identical outputs', () => {
        const snap = buildSepExampleSnap()
        const input = {
            snap,
            params: timePhasedParams,
            asOf,
            horizonEnd,
            includeOpenReceipts: true,
            calendar,
        }
        const a = runNettingPipeline(input)
        const b = runNettingPipeline(input)
        expect(Number(a.net.recommendedQty)).toBe(Number(b.net.recommendedQty))
        expect(a.shortageDate?.getTime()).toBe(b.shortageDate?.getTime())
        expect(Number(a.projectedClosingQty)).toBe(Number(b.projectedClosingQty))
    })

    it('two warehouses independent (WH-2 has separate shortage)', () => {
        const wh1 = runNettingPipeline({
            snap: buildSepExampleSnap(),
            params: timePhasedParams,
            asOf,
            horizonEnd,
            includeOpenReceipts: true,
            calendar,
        })
        const wh2Snap: PairSnapshot = {
            ...buildSepExampleSnap(),
            openingAvailable: new Decimal(0),
            unrestrictedQty: new Decimal(0),
            demandEvents: [],
            demandQty: new Decimal(0),
            supplyEvents: [],
            incomingQty: new Decimal(0),
            reservationEvents: [],
        }
        const wh2 = runNettingPipeline({
            snap: wh2Snap,
            params: timePhasedParams,
            asOf,
            horizonEnd,
            includeOpenReceipts: true,
            calendar,
        })
        expect(Number(wh1.net.recommendedQty)).toBe(30)
        expect(Number(wh2.net.recommendedQty)).toBe(100)
        expect(Number(wh1.net.recommendedQty)).not.toBe(Number(wh2.net.recommendedQty))
    })

    it('reservation lowers opening via bucket path', () => {
        const snap: PairSnapshot = {
            ...buildSepExampleSnap(),
            openingAvailable: new Decimal(140),
            reservationEvents: [
                { date: new Date('2026-09-15T00:00:00.000Z'), quantity: new Decimal(10) },
            ],
        }
        const buckets = buildProjectedStockBuckets({
            asOf,
            horizonEnd,
            openingAvailable: snap.openingAvailable,
            demands: snap.demandEvents,
            supplies: snap.supplyEvents,
            reservations: snap.reservationEvents,
        })
        const sep15 = buckets.find((b) => b.bucketDate.toISOString().slice(0, 10) === '2026-09-15')
        expect(Number(sep15?.closingQty)).toBe(30)
    })

    describe('MrpScopeLoaderService performance', () => {
        it('loadScope uses bounded findMany calls for large pair count', async () => {
            const findMany = jest.fn().mockImplementation((args: any) => {
                if (args?.select?.warehouseId && args?.select?.materialId) {
                    return Promise.resolve([])
                }
                if (args?.where?.materialId?.in) {
                    return Promise.resolve([])
                }
                return Promise.resolve([])
            })
            const mockDemandAggregation = {
                loadForMrp: jest.fn().mockResolvedValue([]),
            }
            const mockPrisma = {
                mmPlanningDemand: { findMany },
                mmExpectedReceiptLine: { findMany },
                mmPurchaseOrderLine: { findMany },
                mmInventoryReservation: { findMany },
                mmSupplyProposal: { findMany },
                mmReorderRule: { findMany },
                mmSupplierMaterial: { findMany },
                mmMaterial: { findMany },
                mmInventoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
            }
            const mockAvailability = {
                getAvailabilityBatch: jest.fn().mockResolvedValue(new Map()),
            }
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    MrpScopeLoaderService,
                    { provide: PrismaService, useValue: mockPrisma },
                    {
                        provide: InventoryAvailabilityService,
                        useValue: mockAvailability,
                    },
                    {
                        provide: MmDemandAggregationService,
                        useValue: mockDemandAggregation,
                    },
                ],
            }).compile()
            const loader = module.get(MrpScopeLoaderService)
            const materialIds = Array.from({ length: 500 }, (_, i) => `mat-${i}`)
            const warehouseIds = ['wh-1', 'wh-2']
            await loader.loadScope({
                companyId: 'co-1',
                warehouseIds,
                materialIds,
                asOf,
                horizonEnd,
                includeOpenReceipts: true,
                currentRunId: 'run-1',
            })
            expect(findMany.mock.calls.length).toBeLessThanOrEqual(8)
            expect(mockAvailability.getAvailabilityBatch).toHaveBeenCalledTimes(1)
        })
    })

    describe('architecture guard', () => {
        it('pipeline files do not import InventoryPostingService', () => {
            for (const file of [
                'mrp-netting.pipeline.ts',
                'mrp-scope-loader.service.ts',
                'mrp-netting.pure.ts',
            ]) {
                const src = readFileSync(join(__dirname, file), 'utf8')
                expect(src).not.toMatch(/InventoryPostingService/)
            }
        })
    })
})
