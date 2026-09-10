import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { PurchaseOrderService } from './purchase-order.service'
import { WorkflowService } from '../workflow/workflow.service'
import { GoodsReceiptService } from '../stock-ops/goods-receipt.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { QualityInspectionService } from '../inbound/quality-inspection.service'
import { PutawayService } from '../warehouse/putaway/putaway.service'
import { NotificationsService } from '../../notifications/notifications.service'

let seq = 0
function nextId() {
    return `id-${++seq}`
}

function makePoLine(overrides: any = {}) {
    return {
        id: nextId(),
        purchaseOrderId: 'po-1',
        lineNumber: 1,
        materialId: 'mat-1',
        description: 'Widget',
        quantity: new Decimal(100),
        uomId: 'uom-1',
        unitPrice: new Decimal(10),
        discount: new Decimal(0),
        tax: new Decimal(0),
        freight: new Decimal(0),
        lineTotal: new Decimal(1000),
        requiredDate: null,
        expectedDeliveryDate: null,
        warehouseId: null,
        warehouse: null,
        storageBinId: null,
        storageBin: null,
        costCenterId: null,
        projectId: null,
        receivedQuantity: new Decimal(0),
        invoicedQuantity: new Decimal(0),
        prLineId: null,
        rfqLineId: null,
        quotationLineId: null,
        remarks: null,
        material: {
            id: 'mat-1',
            materialCode: 'MAT-1',
            materialName: 'Widget',
            materialCategoryId: 'cat-1',
        },
        uom: { id: 'uom-1', code: 'EA', name: 'Each' },
        ...overrides,
    }
}

function makePo(overrides: any = {}) {
    const id = overrides.id ?? nextId()
    return {
        id,
        poNumber: `PO-20260904-${String(seq).padStart(5, '0')}`,
        companyId: 'co-1',
        company: { id: 'co-1', name: 'Test Co' },
        branchId: null,
        supplierId: 'sup-1',
        supplier: { id: 'sup-1', supplierCode: 'S1', supplierName: 'Supplier' },
        buyerId: 'buyer-1',
        currencyId: null,
        currency: null,
        paymentTermsId: null,
        paymentTerms: null,
        deliveryTerms: null,
        warehouseId: 'wh-1',
        warehouse: { id: 'wh-1', code: 'WH1', name: 'Main' },
        expectedDeliveryDate: null,
        status: 'DRAFT',
        totalAmount: new Decimal(1000),
        purchaseRequisitionId: 'pr-1',
        purchaseRequisition: { id: 'pr-1', requisitionNumber: 'PR-1' },
        rfqId: 'rfq-1',
        rfq: { id: 'rfq-1', rfqNumber: 'RFQ-1' },
        quotationId: 'q-1',
        quotation: { id: 'q-1', quotationNumber: 'SQ-1' },
        awardId: 'award-1',
        award: { id: 'award-1' },
        overDeliveryPctOverride: null,
        underDeliveryPctOverride: null,
        priceTolerancePctOverride: null,
        quantityTolerancePctOverride: null,
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        returnedReason: null,
        submittedAt: null,
        sentAt: null,
        closedAt: null,
        cancelledAt: null,
        cancelReason: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        workflowInstanceId: null,
        workflowInstance: null,
        lines: [makePoLine({ purchaseOrderId: id })],
        attachments: [],
        goodsReceipts: [{ id: 'gr-1', documentNumber: 'GR-1', status: 'POSTED', postingDate: new Date() }],
        ...overrides,
    }
}

const mockPrisma: any = {
    mmPurchaseOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    mmPurchaseOrderLine: {
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
    },
    mmPurchaseOrderAudit: {
        create: jest.fn(),
        findMany: jest.fn(),
    },
    mmPurchaseOrderAttachment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
    },
    mmPoToleranceConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
    },
    mmApprovalWorkflow: {
        findMany: jest.fn(),
        create: jest.fn(),
    },
    mmWorkflowInstance: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
    },
    mmApprovalTask: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
    },
    mmGoodsReceipt: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    mmInventoryTransaction: {
        findMany: jest.fn(),
    },
    mmAccountingEvent: {
        create: jest.fn(),
    },
    notification: {
        create: jest.fn(),
    },
}

const mockWorkflow: any = {
    start: jest.fn(),
    approveTask: jest.fn(),
    rejectTask: jest.fn(),
    returnTask: jest.fn(),
    cancel: jest.fn(),
    findByEntity: jest.fn(),
}

const mockPosting: any = {
    postTransaction: jest.fn(),
    reverseTransaction: jest.fn(),
}

const mockEvents: any = {
    emit: jest.fn(),
}

let poService: PurchaseOrderService
let grService: GoodsReceiptService
let workflowService: WorkflowService

beforeEach(async () => {
    seq = 0
    jest.resetAllMocks()

    const module: TestingModule = await Test.createTestingModule({
        providers: [
            PurchaseOrderService,
            GoodsReceiptService,
            { provide: PrismaService, useValue: mockPrisma },
            { provide: WorkflowService, useValue: mockWorkflow },
            { provide: InventoryPostingService, useValue: mockPosting },
            { provide: EventEmitter2, useValue: mockEvents },
            { provide: QualityInspectionService, useValue: {} },
            {
                provide: PutawayService,
                useValue: {
                    createFromGoodsReceiptLine: jest.fn().mockResolvedValue(null),
                },
            },
        ],
    }).compile()

    const wfModule: TestingModule = await Test.createTestingModule({
        providers: [
            WorkflowService,
            { provide: PrismaService, useValue: mockPrisma },
            { provide: EventEmitter2, useValue: mockEvents },
            {
                provide: NotificationsService,
                useValue: { create: jest.fn().mockResolvedValue({}) },
            },
        ],
    }).compile()

    poService = module.get(PurchaseOrderService)
    grService = module.get(GoodsReceiptService)
    workflowService = wfModule.get(WorkflowService)

    mockWorkflow.start.mockResolvedValue({
        instance: { id: 'wf-inst-1' },
        task: { id: 'task-1' },
    })
    mockWorkflow.approveTask.mockResolvedValue({ id: 'task-1', status: 'APPROVED' })
    mockWorkflow.findByEntity.mockResolvedValue({
        id: 'wf-inst-1',
        tasks: [{ id: 'task-1', status: 'PENDING' }],
    })
    mockPrisma.mmPurchaseOrderAudit.create.mockResolvedValue({})
    mockPrisma.notification.create.mockResolvedValue({})
})

describe('MM-07 PurchaseOrderService lifecycle', () => {
    it('submit → workflow → approve', async () => {
        const po = makePo({ id: 'po-1', status: 'DRAFT' })
        mockPrisma.mmPurchaseOrder.findUnique
            .mockResolvedValueOnce(po)
            .mockResolvedValueOnce({ ...po, status: 'PENDING_APPROVAL', workflowInstanceId: 'wf-inst-1' })
        mockPrisma.mmPurchaseOrder.update.mockResolvedValue({
            ...po,
            status: 'PENDING_APPROVAL',
            workflowInstanceId: 'wf-inst-1',
        })

        const submitted = await poService.submit('po-1', 'buyer-1')
        expect(mockWorkflow.start).toHaveBeenCalledWith(
            'PURCHASE_ORDER',
            'po-1',
            expect.objectContaining({
                context: expect.objectContaining({
                    companyId: 'co-1',
                    supplierId: 'sup-1',
                    materialCategoryIds: ['cat-1'],
                }),
            }),
        )
        expect(submitted.status).toBe('PENDING_APPROVAL')

        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({
            ...po,
            status: 'PENDING_APPROVAL',
        })
        mockPrisma.mmPurchaseOrder.update.mockResolvedValue({
            ...po,
            status: 'APPROVED',
        })

        const approved = await poService.approveViaWorkflow('po-1', 'mgr-1')
        expect(mockWorkflow.approveTask).toHaveBeenCalledWith('task-1', {
            userId: 'mgr-1',
            comment: undefined,
        })
        expect(approved.status).toBe('APPROVED')
    })

    it('cancel allowed before receipt and blocked after', async () => {
        const po = makePo({
            id: 'po-2',
            status: 'SENT',
            lines: [makePoLine({ receivedQuantity: new Decimal(0) })],
        })
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue(po)
        mockPrisma.mmPurchaseOrder.update.mockResolvedValue({ ...po, status: 'CANCELLED' })

        const cancelled = await poService.cancel('po-2', 'no longer needed')
        expect(cancelled.status).toBe('CANCELLED')

        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({
            ...po,
            lines: [makePoLine({ receivedQuantity: new Decimal(5) })],
        })
        await expect(poService.cancel('po-2')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('document-flow payload includes PR/RFQ/quotation/award/GR ids', async () => {
        const po = makePo({ id: 'po-3' })
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue(po)

        const flow = await poService.getDocumentFlow('po-3')
        expect(flow.purchaseRequisition?.id).toBe('pr-1')
        expect(flow.rfq?.id).toBe('rfq-1')
        expect(flow.quotation?.id).toBe('q-1')
        expect(flow.award?.id).toBe('award-1')
        expect(flow.goodsReceipts[0].id).toBe('gr-1')
        expect(flow.purchaseOrder.id).toBe('po-3')
    })
})

describe('MM-07 GoodsReceipt PO tolerances', () => {
    function makeGr(overrides: any = {}) {
        return {
            id: 'gr-1',
            documentNumber: 'GR-20260904-00001',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            purchaseOrderId: 'po-1',
            postingDate: new Date(),
            documentDate: new Date(),
            stockStatus: 'UNRESTRICTED',
            remarks: null,
            createdBy: null,
            status: 'DRAFT',
            lines: [
                {
                    id: 'grl-1',
                    quantity: new Decimal(40),
                    purchaseOrderLineId: 'pol-1',
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    unitCost: new Decimal(10),
                    totalCost: new Decimal(400),
                    storageBinId: null,
                    batchId: null,
                    serialNumberId: null,
                    material: {},
                    uom: {},
                    storageBin: null,
                },
            ],
            warehouse: {},
            ...overrides,
        }
    }

    it('partial receipt within tolerance updates status to PARTIALLY_RECEIVED', async () => {
        const gr = makeGr()
        const poLine = makePoLine({
            id: 'pol-1',
            quantity: new Decimal(100),
            receivedQuantity: new Decimal(0),
        })
        const po = makePo({
            id: 'po-1',
            status: 'SENT',
            lines: [poLine],
            overDeliveryPctOverride: new Decimal(5),
            underDeliveryPctOverride: new Decimal(0),
        })

        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue(gr)
        mockPrisma.mmPurchaseOrder.findUnique
            .mockResolvedValueOnce(po) // tolerance check
            .mockResolvedValueOnce({
                ...po,
                lines: [{ ...poLine, receivedQuantity: new Decimal(40) }],
            }) // status refresh
        mockPrisma.mmPoToleranceConfig.findUnique.mockResolvedValue(null)
        mockPrisma.mmPurchaseOrderLine.findUnique.mockResolvedValue(poLine)
        mockPrisma.mmPurchaseOrderLine.update.mockResolvedValue({
            ...poLine,
            receivedQuantity: new Decimal(40),
        })
        mockPrisma.mmPurchaseOrder.update.mockResolvedValue({
            ...po,
            status: 'PARTIALLY_RECEIVED',
        })
        mockPrisma.mmGoodsReceipt.update.mockResolvedValue({ ...gr, status: 'POSTED' })
        mockPosting.postTransaction.mockResolvedValue({})

        const result = await grService.post('gr-1')
        expect(result.status).toBe('POSTED')
        expect(mockPrisma.mmPurchaseOrder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { status: 'PARTIALLY_RECEIVED' },
            }),
        )
    })

    it('over-delivery beyond tolerance is rejected', async () => {
        const gr = makeGr({
            lines: [
                {
                    id: 'grl-1',
                    quantity: new Decimal(20),
                    purchaseOrderLineId: 'pol-1',
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    unitCost: new Decimal(10),
                    totalCost: new Decimal(200),
                    storageBinId: null,
                    batchId: null,
                    serialNumberId: null,
                    material: {},
                    uom: {},
                    storageBin: null,
                },
            ],
        })
        const poLine = makePoLine({
            id: 'pol-1',
            quantity: new Decimal(100),
            receivedQuantity: new Decimal(100),
        })
        const po = makePo({
            id: 'po-1',
            status: 'PARTIALLY_RECEIVED',
            lines: [poLine],
            overDeliveryPctOverride: new Decimal(0),
        })

        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue(gr)
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue(po)
        mockPrisma.mmPoToleranceConfig.findUnique.mockResolvedValue(null)

        await expect(grService.post('gr-1')).rejects.toThrow(/Over-delivery/)
        expect(mockPosting.postTransaction).not.toHaveBeenCalled()
    })
})

describe('Workflow filter matching', () => {
    it('matches by amount + company/supplier when defs present', async () => {
        mockPrisma.mmWorkflowInstance.findFirst.mockResolvedValue(null)
        mockPrisma.mmApprovalWorkflow.findMany.mockResolvedValue([
            {
                id: 'wf-default',
                code: 'PURCHASE_ORDER_DEFAULT',
                entityType: 'PURCHASE_ORDER',
                approverRole: 'MANAGER',
                companyId: null,
                departmentId: null,
                costCenterId: null,
                supplierId: null,
                materialCategoryId: null,
                minAmount: new Decimal(0),
                maxAmount: null,
                sortOrder: 0,
                isActive: true,
            },
            {
                id: 'wf-specific',
                code: 'PO_SUP_CO',
                entityType: 'PURCHASE_ORDER',
                approverRole: 'DIRECTOR',
                companyId: 'co-1',
                departmentId: null,
                costCenterId: null,
                supplierId: 'sup-1',
                materialCategoryId: null,
                minAmount: new Decimal(500),
                maxAmount: new Decimal(5000),
                sortOrder: 1,
                isActive: true,
            },
        ])
        mockPrisma.mmWorkflowInstance.create.mockResolvedValue({ id: 'inst-1' })
        mockPrisma.mmApprovalTask.create.mockResolvedValue({ id: 'task-1' })

        const result = await workflowService.start('PURCHASE_ORDER', 'po-x', {
            amount: 1000,
            context: { companyId: 'co-1', supplierId: 'sup-1' },
        })

        expect(mockPrisma.mmWorkflowInstance.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ workflowId: 'wf-specific' }),
            }),
        )
        expect(result.task.id).toBe('task-1')
    })
})
