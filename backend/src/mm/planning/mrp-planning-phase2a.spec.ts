/**
 * Phase 2A: Advanced MRP Planning Foundation — scenario matrix
 * MRP produces planning output only — never posts inventory.
 */
import { Decimal } from '@prisma/client/runtime/library'
import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
    computeNetting,
    canonicalizeDemandSource,
    buildSuggestionExplanation,
} from './mrp-engine.service'
import {
    buildProjectedStockBuckets,
} from './projected-stock.service'
import { ReorderRuleService } from './reorder-rule.service'
import { MrpRunService } from './mrp-run.service'
import { MrpEngineService } from './mrp-engine.service'
import { ProjectedStockService } from './projected-stock.service'
import { InventoryAvailabilityService } from '../inventory/inventory-availability.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('MRP Planning Phase 2A', () => {
    const asOf = new Date('2026-09-11T00:00:00.000Z')
    const horizonEnd = new Date('2026-09-14T00:00:00.000Z')

    const baseNet = {
        unrestrictedQty: new Decimal(100),
        reservedQty: new Decimal(0),
        qualityQty: new Decimal(0),
        blockedQty: new Decimal(0),
        incomingQty: new Decimal(0),
        plannedSupplyQty: new Decimal(0),
        productionSupplyQty: new Decimal(0),
        demandQty: new Decimal(0),
        safetyStock: new Decimal(0),
        reorderPoint: new Decimal(0),
        reorderQuantity: new Decimal(0),
        minimumOrderQuantity: new Decimal(0),
        lotSize: new Decimal(0),
        minStock: new Decimal(0),
        maxStock: new Decimal(0),
        leadTimeDays: 0,
        includeOpenReceipts: true,
        asOf,
        procurementType: 'BUY',
    }

    describe('projected stock buckets (pure)', () => {
        it('1) demand only reduces closing qty on demand date', () => {
            const buckets = buildProjectedStockBuckets({
                asOf,
                horizonEnd,
                openingAvailable: new Decimal(50),
                demands: [{ date: new Date('2026-09-12T00:00:00.000Z'), quantity: new Decimal(20) }],
                supplies: [],
            })
            expect(buckets.length).toBe(4)
            expect(Number(buckets[0].closingQty)).toBe(50)
            expect(Number(buckets[1].demandQty)).toBe(20)
            expect(Number(buckets[1].closingQty)).toBe(30)
        })

        it('2) supply only increases closing on supply date', () => {
            const buckets = buildProjectedStockBuckets({
                asOf,
                horizonEnd,
                openingAvailable: new Decimal(10),
                demands: [],
                supplies: [{ date: new Date('2026-09-13T00:00:00.000Z'), quantity: new Decimal(25) }],
            })
            expect(Number(buckets[2].supplyQty)).toBe(25)
            expect(Number(buckets[2].closingQty)).toBe(35)
        })

        it('3) demand + supply net correctly', () => {
            const buckets = buildProjectedStockBuckets({
                asOf,
                horizonEnd,
                openingAvailable: new Decimal(100),
                demands: [{ date: new Date('2026-09-12T00:00:00.000Z'), quantity: new Decimal(40) }],
                supplies: [{ date: new Date('2026-09-12T00:00:00.000Z'), quantity: new Decimal(15) }],
            })
            expect(Number(buckets[1].closingQty)).toBe(75)
        })

        it('9) multiple demand dates hit separate buckets', () => {
            const buckets = buildProjectedStockBuckets({
                asOf,
                horizonEnd,
                openingAvailable: new Decimal(100),
                demands: [
                    { date: new Date('2026-09-11T00:00:00.000Z'), quantity: new Decimal(10) },
                    { date: new Date('2026-09-13T00:00:00.000Z'), quantity: new Decimal(30) },
                ],
                supplies: [],
            })
            expect(Number(buckets[0].demandQty)).toBe(10)
            expect(Number(buckets[2].demandQty)).toBe(30)
            expect(Number(buckets[3].closingQty)).toBe(60)
        })

        it('13) reservation reduces closing on reservation date', () => {
            const buckets = buildProjectedStockBuckets({
                asOf,
                horizonEnd,
                openingAvailable: new Decimal(50),
                demands: [],
                supplies: [],
                reservations: [
                    { date: new Date('2026-09-12T00:00:00.000Z'), quantity: new Decimal(12) },
                ],
            })
            expect(Number(buckets[1].reservationQty)).toBe(12)
            expect(Number(buckets[1].closingQty)).toBe(38)
        })
    })

    describe('netting scenarios', () => {
        it('4) safety stock shortage', () => {
            const r = computeNetting({
                ...baseNet,
                unrestrictedQty: new Decimal(10),
                safetyStock: new Decimal(25),
            })
            expect(r.shortage).toBe(true)
            expect(Number(r.netRequirement)).toBe(15)
        })

        it('5) reorder point below flag', () => {
            const r = computeNetting({
                ...baseNet,
                unrestrictedQty: new Decimal(8),
                reorderPoint: new Decimal(20),
                reorderQuantity: new Decimal(40),
            })
            expect(r.belowReorderPoint).toBe(true)
        })

        it('6) MOQ floors recommended quantity', () => {
            const r = computeNetting({
                ...baseNet,
                unrestrictedQty: new Decimal(0),
                demandQty: new Decimal(3),
                minimumOrderQuantity: new Decimal(25),
            })
            expect(Number(r.recommendedQty)).toBe(25)
        })

        it('7) lot size rounds up', () => {
            const r = computeNetting({
                ...baseNet,
                unrestrictedQty: new Decimal(0),
                demandQty: new Decimal(12),
                lotSize: new Decimal(10),
            })
            expect(Number(r.recommendedQty)).toBe(20)
        })

        it('8) lead time drives expected procurement date', () => {
            const r = computeNetting({
                ...baseNet,
                unrestrictedQty: new Decimal(0),
                demandQty: new Decimal(5),
                leadTimeDays: 14,
            })
            const days =
                (r.expectedProcurementDate!.getTime() - asOf.getTime()) /
                (24 * 60 * 60 * 1000)
            expect(Math.round(days)).toBe(14)
        })

        it('10) multiple warehouses independent', () => {
            const whA = computeNetting({ ...baseNet, demandQty: new Decimal(10) })
            const whB = computeNetting({
                ...baseNet,
                unrestrictedQty: new Decimal(0),
                demandQty: new Decimal(10),
            })
            expect(Number(whA.netRequirement)).toBe(0)
            expect(Number(whB.netRequirement)).toBe(10)
        })

        it('11) open PO incoming reduces net', () => {
            const r = computeNetting({
                ...baseNet,
                unrestrictedQty: new Decimal(0),
                demandQty: new Decimal(50),
                incomingQty: new Decimal(30),
            })
            expect(Number(r.netRequirement)).toBe(20)
        })

        it('12) planned supply covers demand (ER/PO analog)', () => {
            const r = computeNetting({
                ...baseNet,
                unrestrictedQty: new Decimal(0),
                demandQty: new Decimal(40),
                incomingQty: new Decimal(40),
            })
            expect(Number(r.netRequirement)).toBe(0)
        })

        it('13) reservation lowers available without double demand', () => {
            const r = computeNetting({
                ...baseNet,
                unrestrictedQty: new Decimal(50),
                reservedQty: new Decimal(15),
                demandQty: new Decimal(40),
            })
            expect(Number(r.availableQty)).toBe(35)
            expect(Number(r.netRequirement)).toBe(5)
        })

        it('14) cancelled demand excluded by caller aggregation', () => {
            const openOnly = new Decimal(30)
            const r = computeNetting({
                ...baseNet,
                unrestrictedQty: new Decimal(0),
                demandQty: openOnly,
            })
            expect(Number(r.grossDemand)).toBe(30)
        })
    })

    describe('effective-dated planning parameters', () => {
        it('16) resolveParams picks rule active only in window', async () => {
            const mockPrisma = {
                mmReorderRule: {
                    findMany: jest.fn().mockResolvedValue([
                        {
                            warehouseId: 'wh-1',
                            reorderPoint: 100,
                            safetyStock: 10,
                            reorderQuantity: 50,
                            minimumOrderQuantity: 5,
                            minStock: 0,
                            maxStock: 0,
                            lotSize: 0,
                            reviewPeriodDays: 0,
                            planningHorizonDays: null,
                            planningStrategy: 'REORDER_POINT',
                            procurementType: 'BUY',
                            leadTimeDays: 7,
                            effectiveFrom: new Date('2026-01-01'),
                            effectiveTo: new Date('2026-06-01'),
                        },
                        {
                            warehouseId: 'wh-1',
                            reorderPoint: 20,
                            safetyStock: 5,
                            reorderQuantity: 40,
                            minimumOrderQuantity: 5,
                            minStock: 0,
                            maxStock: 0,
                            lotSize: 0,
                            reviewPeriodDays: 0,
                            planningHorizonDays: 45,
                            planningStrategy: 'REORDER_POINT',
                            procurementType: 'BUY',
                            leadTimeDays: 3,
                            effectiveFrom: new Date('2026-06-01'),
                            effectiveTo: null,
                        },
                    ]),
                },
                mmMaterial: { findUnique: jest.fn() },
            }
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    ReorderRuleService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            const rules = module.get(ReorderRuleService)
            const params = await rules.resolveParams(
                'co-1',
                'mat-1',
                'wh-1',
                {
                    safetyStock: 0,
                    reorderPoint: 0,
                    reorderQuantity: 0,
                    minimumOrderQuantity: 0,
                    leadTimeDays: 0,
                },
                new Date('2026-09-11'),
            )
            expect(Number(params.reorderPoint)).toBe(20)
            expect(params.planningHorizonDays).toBe(45)
        })
    })

    describe('run lifecycle', () => {
        it('15) duplicate RUNNING blocked on execute', async () => {
            const mockPrisma = {
                mmMrpRun: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'run-1',
                        status: 'RUNNING',
                    }),
                },
            }
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    MrpRunService,
                    { provide: PrismaService, useValue: mockPrisma },
                    {
                        provide: MrpEngineService,
                        useValue: { executeRun: jest.fn() },
                    },
                ],
            }).compile()
            const runs = module.get(MrpRunService)
            await expect(runs.execute('run-1')).rejects.toBeInstanceOf(
                BadRequestException,
            )
        })

        it('15b) runKey dedup returns existing QUEUED run within 5 min', async () => {
            const existing = {
                id: 'run-dup',
                runNumber: 'MRP-001',
                status: 'QUEUED',
            }
            const mockPrisma = {
                mmMrpRun: {
                    findFirst: jest.fn().mockResolvedValue(existing),
                    create: jest.fn(),
                },
            }
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    MrpRunService,
                    { provide: PrismaService, useValue: mockPrisma },
                    {
                        provide: MrpEngineService,
                        useValue: { executeRun: jest.fn() },
                    },
                ],
            }).compile()
            const runs = module.get(MrpRunService)
            const result = await runs.create({
                companyId: 'co-1',
                runKey: 'batch-1',
            })
            expect(result).toEqual(existing)
            expect(mockPrisma.mmMrpRun.create).not.toHaveBeenCalled()
        })
    })

    describe('explainability contract', () => {
        it('structured suggestion explanation includes ATP fields', () => {
            const text = buildSuggestionExplanation({
                demandSource: 'IMPORTED',
                reason: 'SHORTAGE',
                requiredDate: asOf,
                quantity: new Decimal(25),
                leadTimeDays: 7,
                moq: new Decimal(10),
                warehouseId: 'wh-1',
                preferredSupplierId: null,
                availableQuantity: new Decimal(5),
                safetyStock: new Decimal(20),
                incomingSupply: new Decimal(10),
                planningRule: 'REORDER_POINT',
            })
            expect(text).toContain('Available: 5')
            expect(text).toContain('Safety stock: 20')
            expect(text).toContain('Incoming supply: 10')
            expect(text).toContain('Planning rule: REORDER_POINT')
            expect(canonicalizeDemandSource('IMPORTED')).toBe('IMPORTED')
        })
    })

    describe('architecture guard', () => {
        it('17) MRP engine does not import InventoryPostingService', () => {
            const src = readFileSync(
                join(__dirname, 'mrp-engine.service.ts'),
                'utf8',
            )
            expect(src).not.toMatch(/InventoryPostingService/)
            expect(src).toMatch(/InventoryAvailabilityService/)
            expect(src).toMatch(/ProjectedStockService/)
        })

        it('17b) projected stock service does not write balances', () => {
            const src = readFileSync(
                join(__dirname, 'projected-stock.service.ts'),
                'utf8',
            )
            expect(src).not.toMatch(/mmInventoryBalance/)
            expect(src).toMatch(/mmProjectedStock/)
        })
    })
})
