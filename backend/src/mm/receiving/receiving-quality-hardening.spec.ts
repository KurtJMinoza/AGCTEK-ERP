import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { ExpectedReceiptService } from '../inbound/expected-receipt.service'
import { ReceivingDocumentService } from './receiving-document.service'
import { ReceivingVarianceService } from './receiving-variance.service'
import { InspectionRequirementService } from './inspection-requirement.service'
import { QualityRuleService } from '../quality/quality-rule.service'
import { InspectionLotService } from './inspection-lot.service'
import { QualityDecisionService } from './quality-decision.service'
import { GoodsReceiptService } from '../stock-ops/goods-receipt.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { SupplierReturnService } from '../returns-disposal/supplier-return.service'
import { MM_DOMAIN_EVENTS } from '../common/mm-domain-events.types'
import { InspectionPlanService } from '../quality/inspection-plan.service'
import { SamplingService } from '../quality/sampling.service'
import { DefectCodeService } from '../quality/defect-code.service'
import { NonconformanceService } from '../quality/nonconformance.service'
import { QualityWorkflowService } from '../quality/quality-workflow.service'

const mockPrisma: any = {
    mmPurchaseOrder: { findUnique: jest.fn() },
    mmExpectedReceipt: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
    },
    mmAsn: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
    },
    mmReceivingDocument: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    mmReceivingVariance: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
    },
    mmGoodsReceipt: { findUnique: jest.fn(), update: jest.fn() },
    mmMaterial: { findUnique: jest.fn() },
    warehouse: { findUnique: jest.fn() },
    mmSupplier: { findUnique: jest.fn() },
    mmSupplierMaterial: { findFirst: jest.fn() },
    mmBarcode: { findFirst: jest.fn() },
    mmBatch: { findUnique: jest.fn() },
    mmSerialNumber: { findUnique: jest.fn() },
    mmInspectionLot: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    mmInspectionPlan: { findFirst: jest.fn() },
    mmInspectionSample: { create: jest.fn() },
    mmInspectionResult: { create: jest.fn() },
    mmInspectionDefect: { create: jest.fn() },
    mmInspectionCharacteristic: { findUnique: jest.fn() },
    mmQualityDecision: { create: jest.fn() },
    mmQualityInspection: { update: jest.fn() },
    mmSupplierReturn: { create: jest.fn() },
}

const mockGrService: any = {
    create: jest.fn(),
    post: jest.fn(),
}

const mockPosting: any = { postTransaction: jest.fn() }

const mockDomainEvents: any = {
    emit: jest.fn(),
    qualityDecisionMade: jest.fn(),
}

const mockQualityRuleService: any = {
    resolveInspectionRequirement: jest.fn().mockResolvedValue({
        action: 'NO_INSPECTION',
        inspectionRequired: false,
        matchedRuleId: null,
        matchedRuleCode: null,
    }),
}

const mockPlanService: any = { selectPlan: jest.fn().mockResolvedValue(null) }
const mockSampling: any = {
    computeSampleQuantity: jest.fn().mockReturnValue({
        sampleQuantity: new Decimal(5),
        samplingType: 'FIXED',
    }),
}
const mockDefectCodes: any = {
    resolveCode: jest.fn().mockResolvedValue({ id: 'dc-1', code: 'D01', severityDefault: 'MAJOR' }),
}
const mockNonconformance: any = {
    createFromDefect: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'nc-1' }),
}

const mockSupplierReturn: any = { create: jest.fn() }

function inspectionLotModuleProviders() {
    return [
        InspectionLotService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QualityDecisionService, useValue: { applyDecision: jest.fn() } },
        { provide: MmDomainEventsService, useValue: mockDomainEvents },
        { provide: InspectionPlanService, useValue: mockPlanService },
        { provide: SamplingService, useValue: mockSampling },
        { provide: DefectCodeService, useValue: mockDefectCodes },
        { provide: NonconformanceService, useValue: mockNonconformance },
    ]
}

const mockEvents: any = { emit: jest.fn() }

describe('Receiving + Quality hardening (Phase 3)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockSampling.computeSampleQuantity.mockReturnValue({
            sampleQuantity: new Decimal(5),
            samplingType: 'FIXED',
        })
        mockDefectCodes.resolveCode.mockResolvedValue({
            id: 'dc-1',
            code: 'D01',
            severityDefault: 'MAJOR',
        })
    })

    describe('1. PO 100 units → ER', () => {
        it('creates expected receipt with open qty from PO line', async () => {
            mockPrisma.mmExpectedReceipt.findFirst.mockResolvedValue(null)
            mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({
                id: 'po-1',
                companyId: 'co-1',
                supplierId: 'sup-1',
                warehouseId: 'wh-1',
                status: 'SENT',
                expectedDeliveryDate: new Date(),
                lines: [
                    {
                        id: 'pol-1',
                        materialId: 'mat-1',
                        quantity: new Decimal(100),
                        receivedQuantity: new Decimal(0),
                        uomId: 'uom-1',
                    },
                ],
            })
            mockPrisma.mmExpectedReceipt.create.mockResolvedValue({
                id: 'er-1',
                documentNumber: 'ER-1',
                lines: [{ expectedQuantity: new Decimal(100) }],
            })

            const module = await Test.createTestingModule({
                providers: [
                    ExpectedReceiptService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            const svc = module.get(ExpectedReceiptService)

            await svc.createFromPo({ purchaseOrderId: 'po-1' })
            expect(mockPrisma.mmExpectedReceipt.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        lines: {
                            create: [
                                expect.objectContaining({ expectedQuantity: new Decimal(100) }),
                            ],
                        },
                    }),
                }),
            )
        })
    })

    describe('2. ASN 100 → ER link', () => {
        it('builds ER from confirmed ASN lines', async () => {
            mockPrisma.mmAsn.findUnique.mockResolvedValue({
                id: 'asn-1',
                status: 'CONFIRMED',
                companyId: 'co-1',
                supplierId: 'sup-1',
                purchaseOrderId: 'po-1',
                warehouseId: 'wh-1',
                expectedDate: new Date(),
                lines: [
                    {
                        id: 'asnl-1',
                        materialId: 'mat-1',
                        quantity: new Decimal(100),
                        uomId: 'uom-1',
                        purchaseOrderLineId: 'pol-1',
                    },
                ],
            })
            mockPrisma.mmExpectedReceipt.findFirst.mockResolvedValue(null)
            mockPrisma.mmExpectedReceipt.create.mockResolvedValue({ id: 'er-asn' })

            const module = await Test.createTestingModule({
                providers: [
                    ExpectedReceiptService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            await module.get(ExpectedReceiptService).createFromAsn({ asnId: 'asn-1' })

            expect(mockPrisma.mmExpectedReceipt.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        asnId: 'asn-1',
                        sourceType: 'ASN',
                        lines: {
                            create: [
                                expect.objectContaining({ expectedQuantity: new Decimal(100) }),
                            ],
                        },
                    }),
                }),
            )
        })
    })

    describe('3. Receive 100 → receiving doc → post → GR', () => {
        let svc: ReceivingDocumentService

        beforeEach(async () => {
            mockQualityRuleService.resolveInspectionRequirement.mockResolvedValue({
                action: 'NO_INSPECTION',
                inspectionRequired: false,
                matchedRuleId: null,
                matchedRuleCode: null,
            })
            const module = await Test.createTestingModule({
                providers: [
                    ReceivingDocumentService,
                    ReceivingVarianceService,
                    InspectionRequirementService,
                    { provide: QualityRuleService, useValue: mockQualityRuleService },
                    { provide: PrismaService, useValue: mockPrisma },
                    { provide: GoodsReceiptService, useValue: mockGrService },
                    { provide: MmDomainEventsService, useValue: mockDomainEvents },
                ],
            }).compile()
            svc = module.get(ReceivingDocumentService)
            mockPrisma.mmReceivingDocument.findFirst.mockResolvedValue(null)
            mockPrisma.mmReceivingVariance.deleteMany.mockResolvedValue({ count: 0 })
            mockPrisma.mmMaterial.findUnique.mockResolvedValue({ qualityInspectionRequired: false })
            mockPrisma.warehouse.findUnique.mockResolvedValue({ qualityInspectionRequired: false })
            mockGrService.create.mockResolvedValue({ id: 'gr-1', documentNumber: 'GR-1' })
            mockGrService.post.mockResolvedValue({
                id: 'gr-1',
                documentNumber: 'GR-1',
                status: 'POSTED',
            })
        })

        function erDoc() {
            return {
                id: 'er-1',
                status: 'OPEN',
                companyId: 'co-1',
                warehouseId: 'wh-1',
                purchaseOrderId: 'po-1',
                supplierId: 'sup-1',
                sourceType: 'PO',
                asnId: null,
                lines: [
                    {
                        id: 'erl-1',
                        materialId: 'mat-1',
                        expectedQuantity: new Decimal(100),
                        receivedQuantity: new Decimal(0),
                        uomId: 'uom-1',
                        purchaseOrderLineId: 'pol-1',
                        material: {
                            materialCode: 'M1',
                            batchManaged: false,
                            serialManaged: false,
                        },
                    },
                ],
            }
        }

        it('validates variances then posts through GoodsReceiptService', async () => {
            mockPrisma.mmExpectedReceipt.findUnique.mockResolvedValue(erDoc())
            mockPrisma.mmReceivingDocument.create.mockResolvedValue({
                id: 'rcv-1',
                documentNumber: 'RCV-1',
                status: 'DRAFT',
                companyId: 'co-1',
                expectedReceiptId: 'er-1',
                warehouseId: 'wh-1',
                purchaseOrderId: 'po-1',
                supplierId: 'sup-1',
                goodsReceiptId: null,
                lines: [
                    {
                        id: 'rcvl-1',
                        expectedReceiptLineId: 'erl-1',
                        materialId: 'mat-1',
                        receivedQuantity: new Decimal(100),
                        damagedQuantity: new Decimal(0),
                        rejectedQuantity: new Decimal(0),
                        uomId: 'uom-1',
                        unitCost: new Decimal(0),
                        remarks: null,
                        barcode: null,
                        batchId: null,
                        serialNumberId: null,
                    },
                ],
                variances: [],
            })
            let docStatus = 'DRAFT'
            mockPrisma.mmReceivingDocument.findUnique.mockImplementation(({ where }: any) =>
                Promise.resolve({
                    id: where.id,
                    status: docStatus,
                    companyId: 'co-1',
                    expectedReceiptId: 'er-1',
                    warehouseId: 'wh-1',
                    purchaseOrderId: 'po-1',
                    supplierId: 'sup-1',
                    goodsReceiptId: null,
                    receiverId: null,
                    postingDate: null,
                    documentDate: null,
                    createdBy: null,
                    lines: [
                        {
                            id: 'rcvl-1',
                            expectedReceiptLineId: 'erl-1',
                            materialId: 'mat-1',
                            receivedQuantity: new Decimal(100),
                            damagedQuantity: new Decimal(0),
                            rejectedQuantity: new Decimal(0),
                            uomId: 'uom-1',
                            unitCost: new Decimal(0),
                            remarks: null,
                            barcode: null,
                            batchId: null,
                            serialNumberId: null,
                            storageBinId: null,
                        },
                    ],
                    variances: [],
                }),
            )
            mockPrisma.mmReceivingDocument.update.mockImplementation(({ data }: any) => {
                if (data.status) docStatus = data.status
                return Promise.resolve({
                    id: 'rcv-1',
                    status: data.status ?? docStatus,
                    variances: [],
                    lines: [],
                })
            })
            mockPrisma.mmReceivingVariance.createMany.mockResolvedValue({ count: 0 })

            const draft = await svc.createDraft({
                expectedReceiptId: 'er-1',
                lines: [{ expectedReceiptLineId: 'erl-1', receivedQuantity: 100 }],
            })
            expect(draft.id).toBe('rcv-1')

            await svc.validate('rcv-1')
            expect(mockDomainEvents.emit).toHaveBeenCalledWith(
                expect.objectContaining({ eventType: MM_DOMAIN_EVENTS.RECEIVING_VALIDATED }),
            )

            const posted = await svc.post('rcv-1')
            expect(mockGrService.create).toHaveBeenCalled()
            expect(mockGrService.post).toHaveBeenCalledWith('gr-1')
            expect(posted.goodsReceipt.status).toBe('POSTED')
            expect(mockDomainEvents.emit).toHaveBeenCalledWith(
                expect.objectContaining({ eventType: MM_DOMAIN_EVENTS.RECEIVING_POSTED }),
            )
        })
    })

    describe('4–5. Inspection required + lot at GR post', () => {
        it('rule engine triggers QI stock on GR line mapping', async () => {
            const mockRules = {
                resolveInspectionRequirement: jest.fn().mockResolvedValue({
                    action: 'INSPECTION_REQUIRED',
                    inspectionRequired: true,
                    matchedRuleId: 'rule-1',
                    matchedRuleCode: 'SEED-MAT-M1',
                }),
            }

            const module = await Test.createTestingModule({
                providers: [
                    InspectionRequirementService,
                    { provide: QualityRuleService, useValue: mockRules },
                ],
            }).compile()
            const required = await module
                .get(InspectionRequirementService)
                .isInspectionRequired({
                    companyId: 'co-1',
                    materialId: 'mat-1',
                    warehouseId: 'wh-1',
                    supplierId: 'sup-1',
                })
            expect(required).toBe(true)
            expect(mockRules.resolveInspectionRequirement).toHaveBeenCalled()
        })

        it('creates inspection lot without legacy QI when GR post triggers createFromGoodsReceipt', async () => {
            mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue({
                id: 'gr-1',
                companyId: 'co-1',
                warehouseId: 'wh-1',
                supplierId: 'sup-1',
                lines: [
                    {
                        id: 'grl-1',
                        materialId: 'mat-1',
                        material: { materialCategoryId: 'cat-1' },
                    },
                ],
                supplier: { id: 'sup-1' },
            })
            mockPrisma.mmInspectionLot.findFirst.mockResolvedValue(null)
            mockPrisma.mmInspectionLot.create.mockResolvedValue({
                id: 'il-1',
                lotNumber: 'IL-1',
                status: 'CREATED',
            })
            mockPrisma.mmInspectionSample.create.mockResolvedValue({ id: 's1' })

            const module = await Test.createTestingModule({
                providers: inspectionLotModuleProviders(),
            }).compile()

            const lots = await module.get(InspectionLotService).createFromGoodsReceipt('gr-1', [
                { goodsReceiptLineId: 'grl-1', materialId: 'mat-1', quantity: 100 },
            ])
            expect(lots).toHaveLength(1)
            expect(mockPlanService.selectPlan).toHaveBeenCalled()
            expect(mockDomainEvents.emit).toHaveBeenCalledWith(
                expect.objectContaining({ eventType: MM_DOMAIN_EVENTS.INSPECTION_LOT_CREATED }),
            )
        })
    })

    describe('6. Record sample + characteristic results', () => {
        it('persists samples, results, and defects', async () => {
            mockPrisma.mmInspectionLot.findUnique.mockResolvedValue({
                id: 'il-1',
                companyId: 'co-1',
                status: 'CREATED',
                qualityHolds: [],
                material: {},
                goodsReceipt: {},
                plan: null,
                samples: [],
                results: [],
                defects: [],
                decisions: [],
            })
            mockPrisma.mmInspectionLot.update.mockResolvedValue({ id: 'il-1', status: 'IN_PROGRESS' })
            mockPrisma.mmInspectionSample.create.mockResolvedValue({})
            mockPrisma.mmInspectionResult.create.mockResolvedValue({})
            mockPrisma.mmInspectionDefect.create.mockResolvedValue({ id: 'def-1' })

            const module = await Test.createTestingModule({
                providers: inspectionLotModuleProviders(),
            }).compile()

            await module.get(InspectionLotService).recordResults('il-1', {
                samples: [{ sampleSize: 5 }],
                results: [{ characteristicId: 'ch-1', numericValue: 10, passed: true }],
                defects: [{ defectCode: 'D01', quantity: 1 }],
            })

            expect(mockPrisma.mmInspectionSample.create).toHaveBeenCalled()
            expect(mockPrisma.mmInspectionResult.create).toHaveBeenCalled()
            expect(mockPrisma.mmInspectionDefect.create).toHaveBeenCalled()
        })
    })

    describe('7–9. Usage decisions', () => {
        let svc: QualityDecisionService

        beforeEach(async () => {
            const module = await Test.createTestingModule({
                providers: [
                    QualityDecisionService,
                    { provide: PrismaService, useValue: mockPrisma },
                    { provide: InventoryPostingService, useValue: mockPosting },
                    { provide: EventEmitter2, useValue: mockEvents },
                    { provide: MmDomainEventsService, useValue: mockDomainEvents },
                    { provide: SupplierReturnService, useValue: mockSupplierReturn },
                    { provide: NonconformanceService, useValue: mockNonconformance },
                    {
                        provide: QualityWorkflowService,
                        useValue: { requireApprovalIfConfigured: jest.fn().mockResolvedValue(null) },
                    },
                ],
            }).compile()
            svc = module.get(QualityDecisionService)
            mockPosting.postTransaction.mockResolvedValue({})
            mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue({
                id: 'gr-1',
                companyId: 'co-1',
                warehouseId: 'wh-1',
                supplierId: 'sup-1',
                purchaseOrderId: 'po-1',
                postingDate: new Date(),
                documentDate: new Date(),
                lines: [
                    {
                        id: 'grl-1',
                        materialId: 'mat-1',
                        uomId: 'uom-1',
                        unitCost: new Decimal(5),
                        storageBinId: null,
                        batchId: null,
                        serialNumberId: null,
                        material: {},
                        uom: {},
                    },
                ],
                supplier: {},
            })
            mockPrisma.mmQualityDecision.create.mockResolvedValue({ id: 'qd-1' })
            mockPrisma.mmInspectionLot.update.mockResolvedValue({ id: 'il-1', status: 'COMPLETED' })
        })

        it('7. ACCEPT moves stock to UNRESTRICTED and emits putaway', async () => {
            await svc.applyDecision(
                {
                    id: 'il-1',
                    companyId: 'co-1',
                    warehouseId: 'wh-1',
                    goodsReceiptId: 'gr-1',
                    goodsReceiptLineId: 'grl-1',
                    materialId: 'mat-1',
                    quantity: new Decimal(100),
                },
                { decisionCode: 'ACCEPT', quantity: 100, decidedBy: 'qa-1' },
            )
            expect(mockPosting.postTransaction).toHaveBeenCalledWith(
                expect.objectContaining({ stockStatus: 'UNRESTRICTED', movementType: 'TRANSFER_IN' }),
            )
            expect(mockDomainEvents.emit).toHaveBeenCalledWith(
                expect.objectContaining({ eventType: MM_DOMAIN_EVENTS.PUTAWAY_REQUESTED }),
            )
        })

        it('8. REJECT alias maps to BLOCK and moves stock to BLOCKED', async () => {
            await svc.applyDecision(
                {
                    id: 'il-2',
                    companyId: 'co-1',
                    warehouseId: 'wh-1',
                    goodsReceiptId: 'gr-1',
                    goodsReceiptLineId: 'grl-1',
                    materialId: 'mat-1',
                    quantity: new Decimal(50),
                },
                { decisionCode: 'REJECT', quantity: 50 },
            )
            expect(mockPosting.postTransaction).toHaveBeenCalledWith(
                expect.objectContaining({ stockStatus: 'BLOCKED', movementType: 'TRANSFER_IN' }),
            )
            expect(mockNonconformance.create).toHaveBeenCalled()
        })

        it('9. RETURN creates supplier return draft', async () => {
            mockSupplierReturn.create.mockResolvedValue({ id: 'sr-1' })
            await svc.applyDecision(
                {
                    id: 'il-3',
                    companyId: 'co-1',
                    warehouseId: 'wh-1',
                    goodsReceiptId: 'gr-1',
                    goodsReceiptLineId: 'grl-1',
                    materialId: 'mat-1',
                    quantity: new Decimal(20),
                },
                { decisionCode: 'RETURN', quantity: 20, notes: 'Return to vendor' },
            )
            expect(mockSupplierReturn.create).toHaveBeenCalled()
            expect(mockDomainEvents.emit).toHaveBeenCalledWith(
                expect.objectContaining({ eventType: MM_DOMAIN_EVENTS.SUPPLIER_RETURN_REQUESTED }),
            )
        })
    })

    describe('10–13. Typed variances', () => {
        let svc: ReceivingVarianceService

        beforeEach(async () => {
            const module = await Test.createTestingModule({
                providers: [
                    ReceivingVarianceService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            svc = module.get(ReceivingVarianceService)
            mockPrisma.mmBarcode.findFirst.mockResolvedValue(null)
        })

        const baseInput = {
            expectedReceiptLineId: 'erl-1',
            materialId: 'mat-1',
            uomId: 'uom-1',
            expectedQuantity: 100,
            alreadyReceived: 0,
            receivedQuantity: 100,
            damagedQuantity: 0,
            rejectedQuantity: 0,
            material: { materialCode: 'M1', batchManaged: false, serialManaged: false },
        }

        it('10. over-receipt variance', async () => {
            const v = await svc.detectLineVariances({ ...baseInput, receivedQuantity: 110 })
            expect(v.some((x) => x.varianceType === 'OVER_RECEIPT')).toBe(true)
            expect(svc.flagsFromVariances(v)).toContain('OVERAGE')
        })

        it('11. under-receipt variance', async () => {
            const v = await svc.detectLineVariances({ ...baseInput, receivedQuantity: 40 })
            expect(v.some((x) => x.varianceType === 'UNDER_RECEIPT')).toBe(true)
            expect(svc.flagsFromVariances(v)).toContain('SHORTAGE')
        })

        it('12. batch mismatch variance', async () => {
            mockPrisma.mmBatch.findUnique.mockResolvedValue({ materialId: 'mat-other' })
            const v = await svc.detectLineVariances({
                ...baseInput,
                batchId: 'batch-1',
                material: { materialCode: 'M1', batchManaged: true, serialManaged: false },
            })
            expect(v.some((x) => x.varianceType === 'BATCH_MISMATCH')).toBe(true)
        })

        it('13. serial mismatch variance', async () => {
            mockPrisma.mmSerialNumber.findUnique.mockResolvedValue({ materialId: 'mat-other' })
            const v = await svc.detectLineVariances({
                ...baseInput,
                serialNumberId: 'ser-1',
                material: { materialCode: 'M1', batchManaged: false, serialManaged: true },
            })
            expect(v.some((x) => x.varianceType === 'SERIAL_MISMATCH')).toBe(true)
        })
    })

    describe('14–15. Configurable inspection rules (Phase 1B)', () => {
        it('14. supplier-scoped rule requires inspection', async () => {
            const mockRules = {
                resolveInspectionRequirement: jest.fn().mockResolvedValue({
                    action: 'INSPECTION_REQUIRED',
                    inspectionRequired: true,
                    matchedRuleCode: 'SEED-SUP-S1',
                }),
            }

            const module = await Test.createTestingModule({
                providers: [
                    InspectionRequirementService,
                    { provide: QualityRuleService, useValue: mockRules },
                ],
            }).compile()
            const required = await module
                .get(InspectionRequirementService)
                .isInspectionRequired({
                    companyId: 'co-1',
                    materialId: 'mat-1',
                    warehouseId: 'wh-1',
                    supplierId: 'sup-1',
                })
            expect(required).toBe(true)
        })

        it('15. NO_INSPECTION rule suppresses inspection', async () => {
            const mockRules = {
                resolveInspectionRequirement: jest.fn().mockResolvedValue({
                    action: 'NO_INSPECTION',
                    inspectionRequired: false,
                    matchedRuleCode: 'EXEMPT-ALL',
                }),
            }

            const module = await Test.createTestingModule({
                providers: [
                    InspectionRequirementService,
                    { provide: QualityRuleService, useValue: mockRules },
                ],
            }).compile()
            const required = await module
                .get(InspectionRequirementService)
                .isInspectionRequired({
                    companyId: 'co-1',
                    materialId: 'mat-1',
                    warehouseId: 'wh-1',
                    supplierId: 'sup-1',
                })
            expect(required).toBe(false)
        })
    })
})
