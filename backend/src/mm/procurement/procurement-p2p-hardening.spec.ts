import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import {
    assertSupplierProcurement,
    assertCompetitiveSourcing,
} from './assert-supplier-procurement'
import { ProcurementBudgetService } from './procurement-budget.service'
import { PurchaseCommitmentService } from './purchase-commitment.service'
import { PurchaseContractService } from '../purchase-contract/purchase-contract.service'
import { PurchaseOrderService } from '../purchase-order/purchase-order.service'
import { RfqService } from '../rfq/rfq.service'
import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from '../../prisma/prisma.service'
import { WorkflowService } from '../workflow/workflow.service'

describe('Procurement P2P hardening', () => {
    describe('assertSupplierProcurement', () => {
        it('rejects expired required supplier documents', () => {
            expect(() =>
                assertSupplierProcurement(
                    {
                        id: 'sup-1',
                        status: 'ACTIVE',
                        companyId: 'co-1',
                        documents: [
                            {
                                id: 'doc-1',
                                isRequiredForPurchasing: true,
                                expiresAt: new Date('2020-01-01'),
                                docType: 'ISO',
                            },
                        ],
                    },
                    { companyId: 'co-1', purpose: 'PO' },
                ),
            ).toThrow(BadRequestException)
        })

        it('rejects supplier outside company purchasing scope', () => {
            expect(() =>
                assertSupplierProcurement(
                    {
                        id: 'sup-1',
                        status: 'ACTIVE',
                        companyId: 'co-other',
                        documents: [],
                    },
                    { companyId: 'co-1', purpose: 'PO' },
                ),
            ).toThrow(/purchasing scope/)
        })

        it('rejects BLOCKED sourcing type', () => {
            expect(() =>
                assertSupplierProcurement(
                    {
                        id: 'sup-1',
                        status: 'ACTIVE',
                        companyId: 'co-1',
                        sourcingType: 'BLOCKED',
                        documents: [],
                    },
                    { companyId: 'co-1', purpose: 'PO' },
                ),
            ).toThrow(/BLOCKED/)
        })
    })

    describe('assertCompetitiveSourcing', () => {
        it('requires two quotations when competitive sourcing applies', () => {
            expect(() =>
                assertCompetitiveSourcing({
                    submittedQuotationCount: 1,
                    awardedSupplierSourcingType: 'COMPETITIVE_REQUIRED',
                }),
            ).toThrow(/at least two submitted quotations/)
        })

        it('allows single-source award with documented reason', () => {
            expect(() =>
                assertCompetitiveSourcing({
                    submittedQuotationCount: 1,
                    awardedSupplierSourcingType: 'COMPETITIVE_REQUIRED',
                    reason: 'Approved single source exception',
                }),
            ).not.toThrow()
        })
    })

    describe('ProcurementBudgetService', () => {
        it('validates PR budget via stub boundary', async () => {
            const svc = new ProcurementBudgetService()
            const result = await svc.validatePrBudget({
                companyId: 'co-1',
                amount: new Decimal(1000),
            })
            expect(result.validated).toBe(true)
            expect(result.externalRef).toContain('MM-BUDGET-STUB')
        })
    })

    describe('PurchaseCommitmentService', () => {
        const prisma: any = {
            mmPurchaseCommitment: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
            mmPurchaseOrder: { update: jest.fn() },
        }

        it('records OPEN commitment on PO approval', async () => {
            prisma.mmPurchaseCommitment.findFirst.mockResolvedValue(null)
            prisma.mmPurchaseCommitment.create.mockResolvedValue({ id: 'c-1', status: 'OPEN' })
            prisma.mmPurchaseOrder.update.mockResolvedValue({})

            const svc = new PurchaseCommitmentService(prisma as PrismaService)
            const row = await svc.recordCommitment({
                purchaseOrderId: 'po-1',
                companyId: 'co-1',
                amount: 500,
            })

            expect(row.status).toBe('OPEN')
            expect(prisma.mmPurchaseOrder.update).toHaveBeenCalled()
        })
    })

    describe('Contract release → PO', () => {
        let contractService: PurchaseContractService
        const mockPrisma: any = {
            mmPurchaseContract: {
                findUnique: jest.fn(),
                count: jest.fn(),
            },
            mmPurchaseContractRelease: { create: jest.fn(), count: jest.fn() },
            mmPurchaseContractAudit: { create: jest.fn() },
            mmPurchaseOrder: { create: jest.fn(), findFirst: jest.fn() },
            mmPurchaseContractLine: { update: jest.fn() },
            mmSupplier: { findFirst: jest.fn() },
            mmMaterial: { findMany: jest.fn() },
            $transaction: jest.fn((fn: Function) => fn(mockPrisma)),
        }

        beforeEach(async () => {
            jest.clearAllMocks()
            mockPrisma.mmSupplier.findFirst.mockResolvedValue({
                id: 'sup-1',
                status: 'ACTIVE',
                companyId: 'co-1',
                sourcingType: 'APPROVED',
                documents: [],
            })
            mockPrisma.mmMaterial.findMany.mockResolvedValue([
                {
                    id: 'mat-1',
                    status: 'ACTIVE',
                    purchasable: true,
                    inventoryManaged: true,
                },
            ])
            mockPrisma.mmPurchaseContractRelease.count.mockResolvedValue(0)
            mockPrisma.mmPurchaseOrder.findFirst.mockResolvedValue(null)

            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    PurchaseContractService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            contractService = module.get(PurchaseContractService)
        })

        it('creates PO from contract release and tracks released quantity', async () => {
            const contractLineId = 'cl-1'
            mockPrisma.mmPurchaseContract.findUnique.mockResolvedValue({
                id: 'pc-1',
                contractNumber: 'PC-1',
                companyId: 'co-1',
                supplierId: 'sup-1',
                status: 'ACTIVE',
                validFrom: new Date('2020-01-01'),
                validTo: new Date('2030-01-01'),
                currencyId: 'cur-1',
                paymentTermsId: 'pt-1',
                deliveryTerms: 'FOB',
                lines: [
                    {
                        id: contractLineId,
                        lineNumber: 1,
                        materialId: 'mat-1',
                        uomId: 'uom-1',
                        contractQuantity: new Decimal(100),
                        releasedQuantity: new Decimal(0),
                        negotiatedPrice: new Decimal(12),
                        moq: new Decimal(5),
                        remarks: 'Line 1',
                    },
                ],
                supplier: { id: 'sup-1' },
                company: { id: 'co-1' },
            })

            mockPrisma.mmPurchaseContractRelease.create.mockResolvedValue({
                id: 'rel-1',
                releaseNumber: 'PCR-1',
                lines: [{ contractLineId, quantity: new Decimal(20) }],
            })
            mockPrisma.mmPurchaseContractLine.update.mockResolvedValue({})
            mockPrisma.mmPurchaseOrder.create.mockResolvedValue({
                id: 'po-1',
                poNumber: 'PO-1',
                status: 'DRAFT',
                purchaseContractId: 'pc-1',
                contractReleaseId: 'rel-1',
                lines: [{ quantity: new Decimal(20) }],
            })
            mockPrisma.mmPurchaseContractAudit.create.mockResolvedValue({})

            const result = await contractService.release('pc-1', {
                buyerId: 'buyer-1',
                lines: [{ contractLineId, quantity: 20 }],
            })

            expect(result.purchaseOrder.status).toBe('DRAFT')
            expect(mockPrisma.mmPurchaseContractLine.update).toHaveBeenCalled()
            expect(mockPrisma.mmPurchaseOrder.create).toHaveBeenCalled()
        })
    })

    describe('PO revision', () => {
        let poService: PurchaseOrderService
        const mockPrisma: any = {
            mmPurchaseOrder: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            mmPurchaseOrderRevision: { create: jest.fn() },
            mmPurchaseOrderAudit: { create: jest.fn() },
            mmSupplier: { findFirst: jest.fn() },
        }

        beforeEach(async () => {
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    PurchaseOrderService,
                    { provide: PrismaService, useValue: mockPrisma },
                    { provide: WorkflowService, useValue: {} },
                    {
                        provide: PurchaseCommitmentService,
                        useValue: { recordCommitment: jest.fn(), cancelCommitment: jest.fn() },
                    },
                ],
            }).compile()
            poService = module.get(PurchaseOrderService)
            mockPrisma.mmPurchaseOrderAudit.create.mockResolvedValue({})
        })

        it('snapshots approved PO and returns to DRAFT for revision', async () => {
            mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({
                id: 'po-1',
                poNumber: 'PO-1',
                companyId: 'co-1',
                supplierId: 'sup-1',
                status: 'APPROVED',
                revisionNumber: 1,
                totalAmount: new Decimal(100),
                lines: [
                    {
                        id: 'pol-1',
                        materialId: 'mat-1',
                        quantity: new Decimal(10),
                        unitPrice: new Decimal(10),
                        lineTotal: new Decimal(100),
                        receivedQuantity: new Decimal(0),
                        material: { materialCategoryId: 'cat-1' },
                    },
                ],
                company: { id: 'co-1' },
                supplier: { id: 'sup-1' },
            })
            mockPrisma.mmPurchaseOrderRevision.create.mockResolvedValue({})
            mockPrisma.mmPurchaseOrder.update.mockResolvedValue({
                id: 'po-1',
                status: 'DRAFT',
                revisionNumber: 2,
                lines: [],
            })

            const updated = await poService.revise('po-1', {
                reason: 'Price change',
                revisedBy: 'buyer-1',
            })

            expect(updated.revisionNumber).toBe(2)
            expect(updated.status).toBe('DRAFT')
            expect(mockPrisma.mmPurchaseOrderRevision.create).toHaveBeenCalled()
        })
    })

    describe('Quotation comparison persist', () => {
        let rfqService: RfqService
        const mockPrisma: any = {
            mmRfq: { findUnique: jest.fn() },
            mmQuotationComparison: { create: jest.fn() },
            mmRfqAudit: { create: jest.fn() },
        }

        beforeEach(async () => {
            const module: TestingModule = await Test.createTestingModule({
                providers: [RfqService, { provide: PrismaService, useValue: mockPrisma }],
            }).compile()
            rfqService = module.get(RfqService)
            mockPrisma.mmRfqAudit.create.mockResolvedValue({})
        })

        it('persists comparison snapshot with selection reason', async () => {
            mockPrisma.mmRfq.findUnique.mockResolvedValue({
                id: 'rfq-1',
                rfqNumber: 'RFQ-1',
                companyId: 'co-1',
                status: 'EVALUATION',
                autoSelectCheapest: false,
                responseDeadline: new Date('2030-01-01'),
                lines: [],
                invitedSuppliers: [],
                quotations: [
                    {
                        id: 'q-1',
                        quotationNumber: 'Q-1',
                        supplierId: 'sup-1',
                        validityDate: new Date('2030-01-01'),
                        status: 'SUBMITTED',
                        freight: new Decimal(0),
                        tax: new Decimal(0),
                        total: new Decimal(100),
                        supplier: { supplierCode: 'S1', supplierName: 'Sup 1' },
                        paymentTerms: null,
                        currency: null,
                        lines: [],
                    },
                ],
                awards: [],
            })
            mockPrisma.mmQuotationComparison.create.mockResolvedValue({ id: 'cmp-1' })

            const saved = await rfqService.saveComparison({
                rfqId: 'rfq-1',
                comparedBy: 'buyer-1',
                selectedQuotationId: 'q-1',
                selectionReason: 'Best lead time',
            })

            expect(saved.id).toBe('cmp-1')
            expect(mockPrisma.mmQuotationComparison.create).toHaveBeenCalled()
        })
    })
})
