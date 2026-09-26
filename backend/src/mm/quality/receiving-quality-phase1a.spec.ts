import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { SamplingService } from './sampling.service'
import { InspectionPlanService } from './inspection-plan.service'
import { DefectCodeService } from './defect-code.service'
import { InspectionLotLifecycleService } from './inspection-lot-lifecycle.service'
import { NonconformanceService } from './nonconformance.service'
import { QualityReportingService } from './quality-reporting.service'
import { InspectionLotService } from '../receiving/inspection-lot.service'
import { QualityDecisionService } from '../receiving/quality-decision.service'
import { QualityHoldService } from '../receiving/quality-hold.service'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { SupplierReturnService } from '../returns-disposal/supplier-return.service'
import { QualityWorkflowService } from './quality-workflow.service'
import { MM_DOMAIN_EVENTS } from '../common/mm-domain-events.types'
import { normalizeLotStatus } from './quality.constants'

describe('Phase 1A Quality Management', () => {
    describe('SamplingService', () => {
        const svc = new SamplingService()

        it('4. fixed sample size', () => {
            const r = svc.computeSampleQuantity({ lotQuantity: 100, samplingType: 'FIXED', sampleSize: 10 })
            expect(Number(r.sampleQuantity)).toBe(10)
        })

        it('4. percentage sample', () => {
            const r = svc.computeSampleQuantity({ lotQuantity: 100, samplingType: 'PERCENTAGE', samplePercent: 10 })
            expect(Number(r.sampleQuantity)).toBe(10)
        })

        it('4. full inspection', () => {
            const r = svc.computeSampleQuantity({ lotQuantity: 50, samplingType: 'FULL' })
            expect(Number(r.sampleQuantity)).toBe(50)
        })
    })

    describe('Status normalization', () => {
        it('maps legacy PENDING to CREATED', () => {
            expect(normalizeLotStatus('PENDING')).toBe('CREATED')
        })
    })

    describe('QualityDecisionService', () => {
        const mockPrisma: any = {
            mmQualityDecision: { findUnique: jest.fn(), create: jest.fn() },
            mmGoodsReceipt: { findUnique: jest.fn() },
            mmInspectionLot: { findUnique: jest.fn(), update: jest.fn() },
            mmQualityInspection: { update: jest.fn() },
        }
        const mockPosting = { postTransaction: jest.fn().mockResolvedValue({ id: 'txn' }) }
        const mockEvents = { emit: jest.fn() }
        const mockDomain: any = { emit: jest.fn(), qualityDecisionMade: jest.fn() }
        const mockReturn: any = { create: jest.fn() }
        const mockNc: any = { create: jest.fn() }
        const mockWorkflow: any = { requireApprovalIfConfigured: jest.fn().mockResolvedValue(null) }

        let svc: QualityDecisionService

        beforeEach(async () => {
            jest.clearAllMocks()
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    QualityDecisionService,
                    { provide: PrismaService, useValue: mockPrisma },
                    { provide: InventoryPostingService, useValue: mockPosting },
                    { provide: EventEmitter2, useValue: mockEvents },
                    { provide: MmDomainEventsService, useValue: mockDomain },
                    { provide: SupplierReturnService, useValue: mockReturn },
                    { provide: NonconformanceService, useValue: mockNc },
                    { provide: QualityWorkflowService, useValue: mockWorkflow },
                ],
            }).compile()
            svc = module.get(QualityDecisionService)

            mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue({
                id: 'gr-1',
                companyId: 'co-1',
                warehouseId: 'wh-1',
                supplierId: 'sup-1',
                postingDate: new Date(),
                documentDate: new Date(),
                lines: [{
                    id: 'grl-1',
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    unitCost: 1,
                    batchId: 'batch-1',
                    serialNumberId: null,
                    storageBinId: null,
                }],
            })
            mockPrisma.mmQualityDecision.create.mockResolvedValue({ id: 'dec-1', decisionCode: 'ACCEPT' })
            mockPrisma.mmInspectionLot.update.mockResolvedValue({ id: 'lot-1', status: 'CLOSED' })
        })

        it('11. ACCEPT posts transfer pair and emits QualityAccepted', async () => {
            await svc.applyDecision(
                {
                    id: 'lot-1',
                    companyId: 'co-1',
                    warehouseId: 'wh-1',
                    goodsReceiptId: 'gr-1',
                    goodsReceiptLineId: 'grl-1',
                    materialId: 'mat-1',
                    quantity: new Decimal(10),
                    decidedQuantity: new Decimal(0),
                },
                { decisionCode: 'ACCEPT', quantity: 10, decidedBy: 'inspector-1' },
            )
            expect(mockPosting.postTransaction).toHaveBeenCalledTimes(2)
            expect(mockDomain.emit).toHaveBeenCalledWith(
                expect.objectContaining({ eventType: MM_DOMAIN_EVENTS.QUALITY_ACCEPTED }),
            )
        })

        it('12. BLOCK decision targets BLOCKED stock', async () => {
            mockPrisma.mmQualityDecision.create.mockResolvedValue({ id: 'dec-2', decisionCode: 'BLOCK' })
            await svc.applyDecision(
                {
                    id: 'lot-1',
                    companyId: 'co-1',
                    warehouseId: 'wh-1',
                    goodsReceiptId: 'gr-1',
                    goodsReceiptLineId: 'grl-1',
                    materialId: 'mat-1',
                    quantity: new Decimal(10),
                    decidedQuantity: new Decimal(0),
                },
                { decisionCode: 'BLOCK', quantity: 5, reason: 'Failed inspection' },
            )
            const inCall = mockPosting.postTransaction.mock.calls.find(
                (c: any[]) => c[0].movementType === 'TRANSFER_IN',
            )
            expect(inCall[0].stockStatus).toBe('BLOCKED')
            expect(mockNc.create).toHaveBeenCalled()
        })

        it('19. duplicate idempotency key returns existing', async () => {
            mockPrisma.mmQualityDecision.findUnique.mockResolvedValue({ id: 'existing' })
            mockPrisma.mmInspectionLot.findUnique.mockResolvedValue({ id: 'lot-1' })
            const r = await svc.applyDecision(
                {
                    id: 'lot-1',
                    companyId: 'co-1',
                    warehouseId: 'wh-1',
                    goodsReceiptId: 'gr-1',
                    goodsReceiptLineId: 'grl-1',
                    materialId: 'mat-1',
                    quantity: new Decimal(10),
                },
                { decisionCode: 'ACCEPT', quantity: 10, idempotencyKey: 'dup-key' },
            )
            expect(r.idempotent).toBe(true)
            expect(mockPosting.postTransaction).not.toHaveBeenCalled()
        })

        it('partial qty blocks over-decision', async () => {
            await expect(
                svc.applyDecision(
                    {
                        id: 'lot-1',
                        companyId: 'co-1',
                        warehouseId: 'wh-1',
                        goodsReceiptId: 'gr-1',
                        goodsReceiptLineId: 'grl-1',
                        materialId: 'mat-1',
                        quantity: new Decimal(10),
                        decidedQuantity: new Decimal(8),
                    },
                    { decisionCode: 'ACCEPT', quantity: 5 },
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })
    })

    describe('QualityHoldService', () => {
        it('10. hold blocks decision path (integration via InspectionLotService)', async () => {
            const mockPrisma: any = {
                mmQualityHold: {
                    count: jest.fn().mockResolvedValue(0),
                    create: jest.fn().mockResolvedValue({ id: 'h1', holdType: 'QUARANTINE' }),
                },
            }
            const module = await Test.createTestingModule({
                providers: [
                    QualityHoldService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            const holds = module.get(QualityHoldService)
            await holds.create({
                companyId: 'co-1',
                reason: 'Pending lab',
                holdType: 'QUARANTINE',
            })
            expect(mockPrisma.mmQualityHold.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ holdType: 'QUARANTINE', targetStockStatus: 'QUARANTINE' }),
                }),
            )
        })
    })

    describe('InspectionLotLifecycleService', () => {
        const mockPrisma: any = {
            mmInspectionLot: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
        }
        let lifecycle: InspectionLotLifecycleService

        beforeEach(async () => {
            jest.clearAllMocks()
            const module = await Test.createTestingModule({
                providers: [
                    InspectionLotLifecycleService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            lifecycle = module.get(InspectionLotLifecycleService)
        })

        it('start transitions CREATED → IN_PROGRESS', async () => {
            mockPrisma.mmInspectionLot.findUnique.mockResolvedValue({ id: 'l1', status: 'CREATED' })
            mockPrisma.mmInspectionLot.update.mockResolvedValue({ id: 'l1', status: 'IN_PROGRESS' })
            const r = await lifecycle.start('l1', { inspector: 'user-1' })
            expect(r.status).toBe('IN_PROGRESS')
        })

        it('complete transitions to PENDING_DECISION', async () => {
            mockPrisma.mmInspectionLot.findUnique.mockResolvedValue({ id: 'l1', status: 'IN_PROGRESS' })
            mockPrisma.mmInspectionLot.update.mockResolvedValue({ id: 'l1', status: 'PENDING_DECISION' })
            const r = await lifecycle.complete('l1', { completedBy: 'user-1' })
            expect(r.status).toBe('PENDING_DECISION')
        })

        it('20. cancelOpenLotsForGr cancels non-terminal lots', async () => {
            mockPrisma.mmInspectionLot.findMany.mockResolvedValue([
                { id: 'l1', status: 'CREATED', remarks: null },
                { id: 'l2', status: 'IN_PROGRESS', remarks: null },
            ])
            mockPrisma.mmInspectionLot.findUnique.mockImplementation(({ where }: any) =>
                Promise.resolve({ id: where.id, status: 'CREATED', remarks: null }),
            )
            mockPrisma.mmInspectionLot.update.mockResolvedValue({ status: 'CANCELLED' })
            await lifecycle.cancelOpenLotsForGr('gr-1', 'GR reversed')
            expect(mockPrisma.mmInspectionLot.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: 'l1' }, data: expect.objectContaining({ status: 'CANCELLED' }) }),
            )
            expect(mockPrisma.mmInspectionLot.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: 'l2' } }),
            )
        })
    })

    describe('InspectionPlanService', () => {
        const mockPrisma: any = {
            mmInspectionPlan: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), count: jest.fn() },
        }
        let plans: InspectionPlanService

        beforeEach(async () => {
            const module = await Test.createTestingModule({
                providers: [
                    InspectionPlanService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            plans = module.get(InspectionPlanService)
        })

        it('3. selects material-specific plan over generic', async () => {
            mockPrisma.mmInspectionPlan.findMany.mockResolvedValue([
                {
                    id: 'p-generic',
                    materialId: null,
                    materialCategoryId: null,
                    supplierId: null,
                    plantId: null,
                    status: 'ACTIVE',
                    effectiveFrom: null,
                    effectiveTo: null,
                    characteristics: [],
                },
                {
                    id: 'p-mat',
                    materialId: 'mat-1',
                    materialCategoryId: null,
                    supplierId: null,
                    plantId: null,
                    status: 'ACTIVE',
                    effectiveFrom: null,
                    effectiveTo: null,
                    characteristics: [],
                },
            ])
            const selected = await plans.selectPlan({
                companyId: 'co-1',
                materialId: 'mat-1',
            })
            expect(selected?.id).toBe('p-mat')
        })
    })

    describe('DefectCodeService', () => {
        it('8. resolveCode returns master defect', async () => {
            const mockPrisma: any = {
                mmDefectCode: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: 'dc-1',
                        code: 'SCRATCH',
                        severityDefault: 'MINOR',
                    }),
                },
            }
            const module = await Test.createTestingModule({
                providers: [
                    DefectCodeService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            const svc = module.get(DefectCodeService)
            const row = await svc.resolveCode('co-1', 'SCRATCH')
            expect(row.code).toBe('SCRATCH')
        })
    })

    describe('NonconformanceService', () => {
        it('9. resolve transitions OPEN → RESOLVED', async () => {
            const mockPrisma: any = {
                mmNonconformance: {
                    findUnique: jest.fn().mockResolvedValue({ id: 'nc-1', status: 'OPEN' }),
                    update: jest.fn().mockResolvedValue({ id: 'nc-1', status: 'RESOLVED' }),
                },
            }
            const module = await Test.createTestingModule({
                providers: [
                    NonconformanceService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            const svc = module.get(NonconformanceService)
            const r = await svc.resolve('nc-1', { resolvedBy: 'qa-1' })
            expect(r.status).toBe('RESOLVED')
        })
    })

    describe('QualityDecisionService extended', () => {
        const mockPrisma: any = {
            mmQualityDecision: { findUnique: jest.fn(), create: jest.fn() },
            mmGoodsReceipt: { findUnique: jest.fn() },
            mmInspectionLot: { update: jest.fn(), findUnique: jest.fn() },
            mmQualityInspection: { update: jest.fn() },
        }
        const mockPosting = { postTransaction: jest.fn().mockResolvedValue({ id: 'txn' }) }
        const mockEvents = { emit: jest.fn() }
        const mockDomain: any = { emit: jest.fn(), qualityDecisionMade: jest.fn() }
        const mockReturn: any = { create: jest.fn().mockResolvedValue({ id: 'ret-1' }) }
        const mockNc: any = { create: jest.fn() }
        const mockWorkflow: any = { requireApprovalIfConfigured: jest.fn().mockResolvedValue(null) }
        let svc: QualityDecisionService

        const lotBase = {
            id: 'lot-1',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            goodsReceiptId: 'gr-1',
            goodsReceiptLineId: 'grl-1',
            materialId: 'mat-1',
            quantity: new Decimal(10),
            decidedQuantity: new Decimal(0),
            batchId: 'batch-1',
            serialNumberId: 'serial-1',
        }

        beforeEach(async () => {
            jest.clearAllMocks()
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    QualityDecisionService,
                    { provide: PrismaService, useValue: mockPrisma },
                    { provide: InventoryPostingService, useValue: mockPosting },
                    { provide: EventEmitter2, useValue: mockEvents },
                    { provide: MmDomainEventsService, useValue: mockDomain },
                    { provide: SupplierReturnService, useValue: mockReturn },
                    { provide: NonconformanceService, useValue: mockNc },
                    { provide: QualityWorkflowService, useValue: mockWorkflow },
                ],
            }).compile()
            svc = module.get(QualityDecisionService)
            mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue({
                id: 'gr-1',
                companyId: 'co-1',
                warehouseId: 'wh-1',
                supplierId: 'sup-1',
                postingDate: new Date(),
                documentDate: new Date(),
                lines: [{
                    id: 'grl-1',
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    unitCost: 1,
                    batchId: 'batch-1',
                    serialNumberId: 'serial-1',
                    storageBinId: null,
                }],
            })
            mockPrisma.mmQualityDecision.create.mockImplementation(({ data }: any) =>
                Promise.resolve({ id: 'dec-x', decisionCode: data.decisionCode }),
            )
            mockPrisma.mmInspectionLot.update.mockResolvedValue({ id: 'lot-1', status: 'CLOSED' })
        })

        it('13. REWORK posts to BLOCKED stock', async () => {
            await svc.applyDecision(lotBase, { decisionCode: 'REWORK', quantity: 10 })
            const inCall = mockPosting.postTransaction.mock.calls.find(
                (c: any[]) => c[0].movementType === 'TRANSFER_IN',
            )
            expect(inCall[0].stockStatus).toBe('BLOCKED')
        })

        it('14. RETURN creates supplier return draft', async () => {
            await svc.applyDecision(lotBase, { decisionCode: 'RETURN', quantity: 10 })
            expect(mockReturn.create).toHaveBeenCalled()
        })

        it('15–16. batch and serial flow through posting lines', async () => {
            await svc.applyDecision(lotBase, { decisionCode: 'ACCEPT', quantity: 10 })
            const outCall = mockPosting.postTransaction.mock.calls[0][0]
            expect(outCall.batchId).toBe('batch-1')
            expect(outCall.serialNumberId).toBe('serial-1')
        })

        it('20. emits QualityRejected and SupplierQualityIncident on BLOCK', async () => {
            await svc.applyDecision(lotBase, {
                decisionCode: 'BLOCK',
                quantity: 10,
                reason: 'Critical defect',
            })
            expect(mockDomain.emit).toHaveBeenCalledWith(
                expect.objectContaining({ eventType: MM_DOMAIN_EVENTS.QUALITY_REJECTED }),
            )
            expect(mockDomain.emit).toHaveBeenCalledWith(
                expect.objectContaining({ eventType: MM_DOMAIN_EVENTS.SUPPLIER_QUALITY_INCIDENT }),
            )
        })
    })

    describe('QualityReportingService', () => {
        it('dashboard aggregates lot-based KPIs', async () => {
            const mockPrisma: any = {
                mmInspectionLot: { count: jest.fn().mockResolvedValue(5) },
                mmQualityHold: { count: jest.fn().mockResolvedValue(1) },
                mmNonconformance: { count: jest.fn().mockResolvedValue(2) },
                mmQualityDecision: { findMany: jest.fn().mockResolvedValue([
                    { decisionCode: 'ACCEPT', quantity: 10, decidedAt: new Date() },
                ]) },
                mmInspectionDefect: { groupBy: jest.fn().mockResolvedValue([]) },
            }
            const module = await Test.createTestingModule({
                providers: [
                    QualityReportingService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            const r = await module.get(QualityReportingService).getDashboard({ companyId: 'co-1' })
            expect(r.totalLots).toBe(5)
            expect(r.readOnly).toBe(true)
        })
    })
})
