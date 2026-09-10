import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { PurchaseRequisitionService } from './purchase-requisition.service'
import { WorkflowService } from '../workflow/workflow.service'

let seq = 0
function nextId() { return `id-${++seq}` }

function makeLine(overrides: any = {}) {
    const id = nextId()
    return {
        id,
        requisitionId: 'pr-1',
        materialId: 'mat-1',
        description: 'Widget',
        requestedQuantity: new Decimal(100),
        uomId: 'uom-1',
        estimatedUnitPrice: new Decimal(10),
        estimatedTotal: new Decimal(1000),
        requiredDate: new Date(),
        warehouseId: null,
        warehouse: null,
        preferredSupplierId: null,
        preferredSupplier: null,
        convertedQty: new Decimal(0),
        remarks: null,
        material: { id: 'mat-1', materialCode: 'MAT-1', materialName: 'Widget', materialCategoryId: 'cat-1' },
        uom: { id: 'uom-1', code: 'EA', name: 'Each' },
        ...overrides,
    }
}

function makePr(overrides: any = {}) {
    const id = nextId()
    return {
        id,
        requisitionNumber: `REQ-20260101-${String(seq).padStart(5, '0')}`,
        companyId: 'co-1',
        company: { id: 'co-1', name: 'Test Co' },
        businessUnitId: null,
        branchId: null,
        departmentId: 'dept-1',
        costCenterId: 'cc-1',
        projectId: null,
        requesterId: 'user-1',
        requiredDate: new Date(),
        purpose: 'Stock replenishment',
        status: 'DRAFT',
        approvedBy: null,
        rejectionReason: null,
        returnedReason: null,
        submittedAt: null,
        approvedAt: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        workflowInstanceId: null,
        workflowInstance: null,
        lines: [makeLine({ requisitionId: id })],
        conversions: [],
        ...overrides,
    }
}

const mockPrisma: any = {
    mmPurchaseRequisition: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    mmPurchaseRequisitionLine: {
        deleteMany: jest.fn(),
        update: jest.fn(),
    },
    mmPurchaseRequisitionAudit: {
        create: jest.fn(),
        findMany: jest.fn(),
    },
    mmPrConversion: {
        create: jest.fn(),
        findFirst: jest.fn(),
    },
    mmMaterial: {
        findMany: jest.fn(),
    },
}

const mockWorkflow: any = {
    start: jest.fn(),
    approveTask: jest.fn(),
    rejectTask: jest.fn(),
    returnTask: jest.fn(),
    cancel: jest.fn(),
}

let service: PurchaseRequisitionService

beforeEach(async () => {
    seq = 0
    jest.resetAllMocks()
    mockPrisma.mmMaterial.findMany.mockResolvedValue([
        {
            id: 'mat-1',
            status: 'ACTIVE',
            deletedAt: null,
            purchasable: true,
            inventoryManaged: true,
            materialCode: 'MAT-1',
        },
    ])

    const module: TestingModule = await Test.createTestingModule({
        providers: [
            PurchaseRequisitionService,
            { provide: PrismaService, useValue: mockPrisma },
            { provide: WorkflowService, useValue: mockWorkflow },
        ],
    }).compile()

    service = module.get(PurchaseRequisitionService)

    mockWorkflow.start.mockResolvedValue({ instance: { id: 'wf-inst-1' }, task: { id: 'task-1' } })
    mockWorkflow.approveTask.mockResolvedValue({ id: 'task-1', status: 'APPROVED' })
    mockWorkflow.rejectTask.mockResolvedValue({ id: 'task-1', status: 'REJECTED' })
    mockWorkflow.returnTask.mockResolvedValue({ id: 'task-1', status: 'RETURNED' })
})

describe('MM-07 Purchase Requisition', () => {
    it('should create a PR in DRAFT with computed line totals', async () => {
        const pr = makePr()
        pr.lines[0].estimatedTotal = new Decimal(1000)
        mockPrisma.mmPurchaseRequisition.create.mockResolvedValue(pr)

        const req = {
            companyId: 'co-1',
            requesterId: 'user-1',
            requiredDate: '2026-01-01',
            purpose: 'Replenish stock',
            lines: [{ materialId: 'mat-1', requestedQuantity: 100, uomId: 'uom-1', estimatedUnitPrice: 10 }],
        }

        const result = await service.create(req as any)
        expect(result.status).toBe('DRAFT')
        expect(result.requisitionNumber).toMatch(/^REQ-/)
        expect(result.lines[0].estimatedTotal).toEqual(new Decimal(1000))
        expect(mockPrisma.mmPurchaseRequisition.create).toHaveBeenCalledTimes(1)
    })

    it('should reject a PR with no lines', async () => {
        await expect(
            service.create({
                companyId: 'co-1',
                requesterId: 'user-1',
                requiredDate: '2026-01-01',
                purpose: 'test',
                lines: [],
            } as any),
        ).rejects.toThrow(BadRequestException)
    })

    it('should submit a PR and create a workflow instance', async () => {
        const pr = makePr({ status: 'DRAFT', requesterId: 'user-1' })
        mockPrisma.mmPurchaseRequisition.findUnique.mockResolvedValue(pr)
        mockPrisma.mmPurchaseRequisition.update.mockResolvedValue({ ...pr, status: 'PENDING_APPROVAL' })

        const result = await service.submit('pr-1', 'user-1')

        expect(mockWorkflow.start).toHaveBeenCalledWith('PURCHASE_REQUISITION', 'pr-1', expect.objectContaining({
            amount: expect.any(Decimal),
            initiatedBy: 'user-1',
            context: expect.objectContaining({
                companyId: 'co-1',
                departmentId: 'dept-1',
                costCenterId: 'cc-1',
                materialCategoryIds: ['cat-1'],
            }),
        }))
        expect(result.status).toBe('PENDING_APPROVAL')
    })

    it('should reject submit by a non-requester', async () => {
        const pr = makePr({ status: 'DRAFT', requesterId: 'user-1' })
        mockPrisma.mmPurchaseRequisition.findUnique.mockResolvedValue(pr)

        await expect(service.submit('pr-1', 'user-2')).rejects.toThrow(BadRequestException)
    })

    it('should approve via workflow and set APPROVED', async () => {
        const pr = makePr({
            status: 'PENDING_APPROVAL',
            workflowInstance: { id: 'instance-1', tasks: [{ id: 'task-1', status: 'PENDING' }] },
        })
        mockPrisma.mmPurchaseRequisition.findUnique.mockResolvedValue(pr)
        mockPrisma.mmPurchaseRequisition.update.mockResolvedValue({ ...pr, status: 'APPROVED' })

        const result = await service.approveViaWorkflow('pr-1', 'approver-1', 'OK')
        expect(mockWorkflow.approveTask).toHaveBeenCalledWith('task-1', { userId: 'approver-1', comment: 'OK' })
        expect(result.status).toBe('APPROVED')
    })

    it('should reject via workflow with reason', async () => {
        const pr = makePr({
            status: 'PENDING_APPROVAL',
            workflowInstance: { id: 'instance-1', tasks: [{ id: 'task-1', status: 'PENDING' }] },
        })
        mockPrisma.mmPurchaseRequisition.findUnique.mockResolvedValue(pr)
        mockPrisma.mmPurchaseRequisition.update.mockResolvedValue({ ...pr, status: 'REJECTED' })

        const result = await service.rejectViaWorkflow('pr-1', 'Budget too high', 'approver-1')
        expect(mockWorkflow.rejectTask).toHaveBeenCalledWith('task-1', { userId: 'approver-1', comment: 'Budget too high' })
        expect(result.status).toBe('REJECTED')
    })

    it('should return via workflow', async () => {
        const pr = makePr({
            status: 'PENDING_APPROVAL',
            workflowInstance: { id: 'instance-1', tasks: [{ id: 'task-1', status: 'PENDING' }] },
        })
        mockPrisma.mmPurchaseRequisition.findUnique.mockResolvedValue(pr)
        mockPrisma.mmPurchaseRequisition.update.mockResolvedValue({ ...pr, status: 'RETURNED' })

        const result = await service.returnViaWorkflow('pr-1', 'Missing details', 'approver-1')
        expect(mockWorkflow.returnTask).toHaveBeenCalledWith('task-1', { userId: 'approver-1', comment: 'Missing details' })
        expect(result.status).toBe('RETURNED')
    })

    it('should cancel from DRAFT and reject cancel from APPROVED', async () => {
        const draft = makePr({ status: 'DRAFT' })
        mockPrisma.mmPurchaseRequisition.findUnique.mockResolvedValueOnce(draft)
        mockPrisma.mmPurchaseRequisition.update.mockResolvedValueOnce({ ...draft, status: 'CANCELLED' })

        const cancelled = await service.cancel('pr-1', 'user-1')
        expect(cancelled.status).toBe('CANCELLED')
        expect(mockWorkflow.cancel).toHaveBeenCalledWith('PURCHASE_REQUISITION', 'pr-1')

        const approved = makePr({ status: 'APPROVED' })
        mockPrisma.mmPurchaseRequisition.findUnique.mockResolvedValueOnce(approved)

        await expect(service.cancel('pr-1', 'user-1')).rejects.toThrow(BadRequestException)
    })

    it('should close an approved PR', async () => {
        const approved = makePr({ status: 'APPROVED' })
        mockPrisma.mmPurchaseRequisition.findUnique.mockResolvedValue(approved)
        mockPrisma.mmPurchaseRequisition.update.mockResolvedValue({ ...approved, status: 'CLOSED' })

        const closed = await service.close('pr-1', 'user-1')
        expect(closed.status).toBe('CLOSED')
    })

    it('should partially convert a line (100 -> 60, remaining 40)', async () => {
        const pr = makePr({ status: 'APPROVED' })
        pr.lines[0].convertedQty = new Decimal(0)
        mockPrisma.mmPurchaseRequisition.findUnique
            .mockResolvedValueOnce(pr)          // convert initial find
            .mockResolvedValueOnce({ ...pr, lines: [{ ...pr.lines[0], convertedQty: new Decimal(60) }] }) // refreshed
        mockPrisma.mmPrConversion.create.mockResolvedValue({})
        mockPrisma.mmPurchaseRequisitionLine.update.mockResolvedValue({})
        mockPrisma.mmPurchaseRequisition.update.mockResolvedValue({ ...pr, status: 'PARTIALLY_CONVERTED' })

        const result = await service.convert('pr-1', {
            lines: [{ lineId: pr.lines[0].id, targetType: 'PO', convertedQty: 60 }],
        }, 'user-1')

        expect(result.status).toBe('PARTIALLY_CONVERTED')
        const line = pr.lines[0]
        const remaining = new Decimal(100).minus(new Decimal(60))
        expect(remaining).toEqual(new Decimal(40))
    })

    it('should fully convert -> FULLY_CONVERTED', async () => {
        const pr = makePr({ status: 'APPROVED' })
        pr.lines[0].convertedQty = new Decimal(0)
        mockPrisma.mmPurchaseRequisition.findUnique
            .mockResolvedValueOnce(pr)
            .mockResolvedValueOnce({ ...pr, lines: [{ ...pr.lines[0], convertedQty: new Decimal(100) }] })
        mockPrisma.mmPrConversion.create.mockResolvedValue({})
        mockPrisma.mmPurchaseRequisitionLine.update.mockResolvedValue({})
        mockPrisma.mmPurchaseRequisition.update.mockResolvedValue({ ...pr, status: 'FULLY_CONVERTED' })

        const result = await service.convert('pr-1', {
            lines: [{ lineId: pr.lines[0].id, targetType: 'PO', convertedQty: 100 }],
        }, 'user-1')

        expect(result.status).toBe('FULLY_CONVERTED')
    })

    it('should reject over-conversion beyond requested quantity', async () => {
        const pr = makePr({ status: 'APPROVED' })
        pr.lines[0].convertedQty = new Decimal(70)
        pr.lines[0].requestedQuantity = new Decimal(100)
        mockPrisma.mmPurchaseRequisition.findUnique.mockResolvedValue(pr)

        await expect(
            service.convert('pr-1', { lines: [{ lineId: pr.lines[0].id, targetType: 'PO', convertedQty: 50 }] }, 'user-1'),
        ).rejects.toThrow(BadRequestException)
    })

    it('should reject duplicate conversion of same line+target', async () => {
        const pr = makePr({ status: 'APPROVED' })
        pr.lines[0].convertedQty = new Decimal(60)
        mockPrisma.mmPurchaseRequisition.findUnique.mockResolvedValue(pr)
        mockPrisma.mmPrConversion.findFirst.mockResolvedValueOnce({ id: 'existing-conv' })

        await expect(
            service.convert('pr-1', { lines: [{ lineId: pr.lines[0].id, targetType: 'PO', convertedQty: 10 }] }, 'user-1'),
        ).rejects.toThrow(BadRequestException)
    })
})