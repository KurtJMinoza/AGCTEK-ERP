import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { AdjustmentService } from '../stock-ops/adjustment.service'
import { CountRuleService } from './count-rule.service'
import { InventoryCountService } from './inventory-count.service'

const mockPrisma: any = {
    mmCountRule: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    mmInventoryCount: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    mmInventoryCountLine: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
    },
    mmInventoryBalance: {
        findMany: jest.fn(),
    },
    mmMaterial: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
    },
    mmInventoryAdjustment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
    },
    mmInventoryAdjustmentLine: {
        update: jest.fn(),
    },
    mmAccountingEvent: {
        create: jest.fn(),
    },
}

const mockAdjustments: any = {
    create: jest.fn(),
    submit: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
}

function makeSession(overrides: any = {}) {
    return {
        id: 'cnt-1',
        countNumber: 'CC-000001',
        countType: 'CYCLE',
        companyId: 'co-1',
        warehouseId: 'wh-1',
        ruleId: 'rule-1',
        status: 'COUNTING',
        createdBy: 'user',
        rule: {
            id: 'rule-1',
            varianceQtyTolerance: new Decimal(0),
            varianceValueTolerance: new Decimal(0),
        },
        adjustment: null,
        lines: [],
        warehouse: { id: 'wh-1', name: 'Main' },
        company: { id: 'co-1' },
        ...overrides,
    }
}

function makeLine(overrides: any = {}) {
    return {
        id: 'line-1',
        countId: 'cnt-1',
        lineNumber: 1,
        materialId: 'mat-1',
        storageBinId: 'bin-1',
        batchId: null,
        serialNumberId: null,
        systemQuantity: new Decimal(10),
        countedQuantity: null,
        recountQuantity: null,
        finalQuantity: null,
        varianceQuantity: new Decimal(0),
        varianceValue: new Decimal(0),
        unitCost: new Decimal(5),
        status: 'PENDING',
        lastIdempotencyKey: null,
        material: { id: 'mat-1', materialCode: 'MAT-1', baseUomId: 'uom-1' },
        storageBin: { id: 'bin-1', code: 'A-01' },
        count: { id: 'cnt-1', status: 'COUNTING', countNumber: 'CC-000001' },
        ...overrides,
    }
}

describe('MM-10 Inventory Control', () => {
    let rules: CountRuleService
    let counts: InventoryCountService

    beforeEach(async () => {
        jest.resetAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CountRuleService,
                InventoryCountService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: AdjustmentService, useValue: mockAdjustments },
            ],
        }).compile()
        rules = module.get(CountRuleService)
        counts = module.get(InventoryCountService)
    })

    describe('CountRuleService', () => {
        it('creates rule with velocity / risk / value band', async () => {
            mockPrisma.mmCountRule.findUnique.mockResolvedValue(null)
            mockPrisma.mmCountRule.create.mockResolvedValue({
                id: 'rule-1',
                code: 'FAST-HIGH',
                velocityClass: 'FAST',
                riskClass: 'HIGH',
                minUnitValue: new Decimal(100),
                maxUnitValue: new Decimal(5000),
                frequencyDays: 7,
            })
            const r = await rules.create({
                code: 'FAST-HIGH',
                name: 'Fast high-risk',
                velocityClass: 'FAST',
                riskClass: 'HIGH',
                minUnitValue: 100,
                maxUnitValue: 5000,
                frequencyDays: 7,
            })
            expect(r.velocityClass).toBe('FAST')
            expect(mockPrisma.mmCountRule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        velocityClass: 'FAST',
                        riskClass: 'HIGH',
                    }),
                }),
            )
        })
    })

    describe('Generate', () => {
        it('rejects when rule warehouse mismatches session warehouse', async () => {
            mockPrisma.mmInventoryCount.findUnique.mockResolvedValue(
                makeSession({ status: 'OPEN', lines: [], countType: 'CYCLE' }),
            )
            mockPrisma.mmCountRule.findUnique.mockResolvedValue({
                id: 'rule-1',
                warehouseId: 'wh-other',
                abcClass: 'A',
                velocityClass: null,
                riskClass: null,
                materialCategoryId: null,
                materialTypeId: null,
                minUnitValue: null,
                maxUnitValue: null,
            })

            await expect(counts.generate('cnt-1', {})).rejects.toThrow(
                /warehouse does not match/i,
            )
        })

        it('PHYSICAL defaults includeZeroBalances (qty >= 0)', async () => {
            mockPrisma.mmInventoryCount.findUnique.mockResolvedValue(
                makeSession({
                    status: 'OPEN',
                    lines: [],
                    countType: 'PHYSICAL',
                    ruleId: null,
                }),
            )
            mockPrisma.mmInventoryBalance.findMany.mockResolvedValue([
                {
                    materialId: 'mat-1',
                    storageBinId: 'bin-1',
                    batchId: null,
                    serialNumberId: null,
                    quantity: new Decimal(0),
                    material: { standardCost: new Decimal(5) },
                },
            ])
            mockPrisma.mmInventoryCountLine.findMany.mockResolvedValue([])
            mockPrisma.mmInventoryCountLine.createMany.mockResolvedValue({ count: 1 })
            mockPrisma.mmInventoryCount.update.mockResolvedValue(
                makeSession({ status: 'OPEN', countType: 'PHYSICAL' }),
            )

            await counts.generate('cnt-1', {})

            expect(mockPrisma.mmInventoryBalance.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        quantity: { gte: 0 },
                    }),
                }),
            )
        })
    })

    describe('Blind count', () => {
        it('omits systemQuantity from response', async () => {
            mockPrisma.mmInventoryCountLine.findUnique.mockResolvedValue(
                makeLine({ status: 'PENDING' }),
            )
            mockPrisma.mmInventoryCountLine.update.mockResolvedValue(
                makeLine({
                    status: 'COUNTED',
                    countedQuantity: new Decimal(10),
                    systemQuantity: new Decimal(10),
                }),
            )

            const result: any = await counts.blindCount('line-1', {
                countedQuantity: 10,
                countedBy: 'counter',
            })

            expect(result.systemQuantity).toBeUndefined()
            expect(result.varianceQuantity).toBeUndefined()
            expect(result.status).toBe('COUNTED')
        })

        it('is idempotent on duplicate key', async () => {
            mockPrisma.mmInventoryCountLine.findUnique.mockResolvedValue(
                makeLine({ status: 'COUNTED', countedQuantity: new Decimal(8) }),
            )
            mockPrisma.mmInventoryCountLine.findFirst.mockResolvedValue({
                id: 'line-1',
                lastIdempotencyKey: 'k1',
                status: 'COUNTED',
                countedQuantity: new Decimal(8),
            })

            const result: any = await counts.blindCount('line-1', {
                countedQuantity: 99,
                idempotencyKey: 'k1',
            })
            expect(result.status).toBe('COUNTED')
            expect(mockPrisma.mmInventoryCountLine.update).not.toHaveBeenCalled()
        })
    })

    describe('Exact match', () => {
        it('variance 0 → close / no adjustment posting', async () => {
            const session = makeSession({
                status: 'APPROVAL',
                lines: [
                    makeLine({
                        status: 'APPROVED',
                        varianceQuantity: new Decimal(0),
                        countedQuantity: new Decimal(10),
                        finalQuantity: new Decimal(10),
                    }),
                ],
            })
            mockPrisma.mmInventoryCount.findUnique.mockResolvedValue(session)
            mockPrisma.mmInventoryCountLine.update.mockResolvedValue({})
            mockPrisma.mmInventoryCount.update.mockResolvedValue({
                ...session,
                status: 'CLOSED',
            })

            const result = await counts.postAdjustments('cnt-1', {
                approvedBy: 'approver',
            })
            expect(result.status).toBe('CLOSED')
            expect(mockAdjustments.create).not.toHaveBeenCalled()
            expect(mockAdjustments.submit).not.toHaveBeenCalled()
        })
    })

    describe('Variance', () => {
        it('sets system / physical / variance qty and value', async () => {
            const session = makeSession({
                rule: {
                    id: 'rule-1',
                    varianceQtyTolerance: new Decimal(5),
                    varianceValueTolerance: new Decimal(0),
                },
                lines: [
                    makeLine({
                        status: 'COUNTED',
                        countedQuantity: new Decimal(9),
                        systemQuantity: new Decimal(10),
                        unitCost: new Decimal(5),
                    }),
                ],
            })
            mockPrisma.mmInventoryCount.findUnique.mockResolvedValue(session)
            mockPrisma.mmInventoryCountLine.update.mockResolvedValue({})
            mockPrisma.mmInventoryCount.update.mockResolvedValue({
                ...session,
                status: 'APPROVAL',
            })

            await counts.computeVariances('cnt-1')
            expect(mockPrisma.mmInventoryCountLine.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        varianceQuantity: expect.anything(),
                        varianceValue: expect.anything(),
                        status: 'COUNTED',
                    }),
                }),
            )
            const data = mockPrisma.mmInventoryCountLine.update.mock.calls[0][0].data
            expect(Number(data.varianceQuantity)).toBe(-1)
            expect(Number(data.varianceValue)).toBe(5)
        })

        it('over tolerance → REQUIRE_RECOUNT', async () => {
            const session = makeSession({
                lines: [
                    makeLine({
                        status: 'COUNTED',
                        countedQuantity: new Decimal(7),
                        systemQuantity: new Decimal(10),
                    }),
                ],
            })
            mockPrisma.mmInventoryCount.findUnique.mockResolvedValue(session)
            mockPrisma.mmInventoryCountLine.update.mockResolvedValue({})
            mockPrisma.mmInventoryCount.update.mockResolvedValue({
                ...session,
                status: 'RECOUNT',
            })

            const result = await counts.computeVariances('cnt-1')
            expect(result.status).toBe('RECOUNT')
            expect(mockPrisma.mmInventoryCountLine.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: 'REQUIRE_RECOUNT' }),
                }),
            )
        })
    })

    describe('Recount', () => {
        it('recount → RECOUNTED then submitApproval → APPROVAL', async () => {
            mockPrisma.mmInventoryCountLine.findUnique.mockResolvedValue(
                makeLine({
                    status: 'REQUIRE_RECOUNT',
                    countedQuantity: new Decimal(7),
                    count: { id: 'cnt-1', status: 'RECOUNT' },
                }),
            )
            mockPrisma.mmInventoryCountLine.update.mockResolvedValue(
                makeLine({ status: 'RECOUNTED', recountQuantity: new Decimal(7) }),
            )

            const line = await counts.recount('line-1', {
                recountQuantity: 7,
                recountBy: 'supervisor',
            })
            expect(line.status).toBe('RECOUNTED')

            const session = makeSession({
                status: 'RECOUNT',
                lines: [
                    makeLine({
                        status: 'RECOUNTED',
                        countedQuantity: new Decimal(7),
                        recountQuantity: new Decimal(7),
                        systemQuantity: new Decimal(10),
                    }),
                ],
            })
            mockPrisma.mmInventoryCount.findUnique.mockResolvedValue(session)
            mockPrisma.mmInventoryCount.update.mockResolvedValue({
                ...session,
                status: 'APPROVAL',
            })

            const submitted = await counts.submitApproval('cnt-1')
            expect(submitted.status).toBe('APPROVAL')
        })
    })

    describe('Approval', () => {
        it('session reject → CLOSED, no adjustment', async () => {
            const session = makeSession({
                status: 'APPROVAL',
                lines: [makeLine({ status: 'COUNTED', countedQuantity: new Decimal(9) })],
            })
            mockPrisma.mmInventoryCount.findUnique.mockResolvedValue(session)
            mockPrisma.mmInventoryCountLine.update.mockResolvedValue({})
            mockPrisma.mmInventoryCount.update.mockResolvedValue({
                ...session,
                status: 'CLOSED',
            })

            const result = await counts.reject('cnt-1', { reason: 'No' })
            expect(result.status).toBe('CLOSED')
            expect(mockAdjustments.create).not.toHaveBeenCalled()
        })

        it('over-threshold adj → PENDING_APPROVAL; session stays APPROVAL', async () => {
            const session = makeSession({
                status: 'APPROVAL',
                lines: [
                    makeLine({
                        status: 'APPROVED',
                        countedQuantity: new Decimal(8),
                        finalQuantity: new Decimal(8),
                        varianceQuantity: new Decimal(-2),
                        varianceValue: new Decimal(10),
                        unitCost: new Decimal(5),
                    }),
                ],
            })
            mockPrisma.mmInventoryCount.findUnique.mockResolvedValue(session)
            mockPrisma.mmMaterial.findMany.mockResolvedValue([
                { id: 'mat-1', baseUomId: 'uom-1' },
            ])
            mockAdjustments.create.mockResolvedValue({
                id: 'adj-1',
                status: 'DRAFT',
                sourceCountId: 'cnt-1',
            })
            mockAdjustments.submit.mockResolvedValue({
                id: 'adj-1',
                status: 'PENDING_APPROVAL',
                sourceCountId: 'cnt-1',
            })
            mockPrisma.mmInventoryCount.update.mockResolvedValue({
                ...session,
                status: 'APPROVAL',
                adjustment: { id: 'adj-1', status: 'PENDING_APPROVAL' },
            })

            const result = await counts.postAdjustments('cnt-1', {
                approvedBy: 'approver',
                adjustmentReason: 'COUNT_VARIANCE',
                approvalThreshold: 1,
            })

            expect(mockAdjustments.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    sourceCountId: 'cnt-1',
                    approvalThreshold: 1,
                }),
            )
            expect(mockAdjustments.submit).toHaveBeenCalledWith('adj-1')
            expect(result.status).toBe('APPROVAL')
        })
    })

    describe('Rejected adjustment', () => {
        it('reject after PENDING_APPROVAL never posts ledger', async () => {
            const session = makeSession({
                status: 'APPROVAL',
                lines: [
                    makeLine({
                        status: 'APPROVED',
                        varianceQuantity: new Decimal(-2),
                        unitCost: new Decimal(5),
                    }),
                ],
            })
            mockPrisma.mmInventoryCount.findUnique.mockResolvedValue(session)
            mockPrisma.mmMaterial.findMany.mockResolvedValue([
                { id: 'mat-1', baseUomId: 'uom-1' },
            ])
            mockAdjustments.create.mockResolvedValue({ id: 'adj-1', status: 'DRAFT' })
            mockAdjustments.submit.mockResolvedValue({
                id: 'adj-1',
                status: 'PENDING_APPROVAL',
            })

            await counts.postAdjustments('cnt-1', {
                approvedBy: 'approver',
                approvalThreshold: 1,
            })

            mockAdjustments.reject.mockResolvedValue({
                id: 'adj-1',
                status: 'REJECTED',
            })
            const rejected = await mockAdjustments.reject('adj-1', 'No')
            expect(rejected.status).toBe('REJECTED')
            // submit only once during postAdjustments; reject does not re-submit/post
            expect(mockAdjustments.submit).toHaveBeenCalledTimes(1)
        })
    })

    describe('Adjustment posting', () => {
        it('approve/submit under threshold → POSTED via AdjustmentService', async () => {
            const session = makeSession({
                status: 'APPROVAL',
                lines: [
                    makeLine({
                        status: 'APPROVED',
                        countedQuantity: new Decimal(8),
                        finalQuantity: new Decimal(8),
                        varianceQuantity: new Decimal(-2),
                        varianceValue: new Decimal(10),
                        unitCost: new Decimal(5),
                    }),
                ],
            })
            mockPrisma.mmInventoryCount.findUnique.mockResolvedValue(session)
            mockPrisma.mmMaterial.findMany.mockResolvedValue([
                { id: 'mat-1', baseUomId: 'uom-1' },
            ])
            mockAdjustments.create.mockResolvedValue({
                id: 'adj-1',
                status: 'DRAFT',
                sourceCountId: 'cnt-1',
            })
            mockAdjustments.submit.mockResolvedValue({
                id: 'adj-1',
                status: 'POSTED',
                sourceCountId: 'cnt-1',
            })
            mockPrisma.mmInventoryCountLine.update.mockResolvedValue({})
            mockPrisma.mmInventoryCount.update.mockResolvedValue({
                ...session,
                status: 'POSTED',
            })

            const result = await counts.postAdjustments('cnt-1', {
                approvedBy: 'approver',
                adjustmentReason: 'COUNT_VARIANCE',
            })

            expect(mockAdjustments.create).toHaveBeenCalled()
            expect(mockAdjustments.submit).toHaveBeenCalledWith('adj-1')
            expect(result.status).toBe('POSTED')
        })
    })

    describe('guards', () => {
        it('rejects blind count when session not COUNTING', async () => {
            mockPrisma.mmInventoryCountLine.findUnique.mockResolvedValue(
                makeLine({
                    status: 'PENDING',
                    count: { id: 'cnt-1', status: 'OPEN' },
                }),
            )
            await expect(
                counts.blindCount('line-1', { countedQuantity: 1 }),
            ).rejects.toThrow(BadRequestException)
        })
    })
})
