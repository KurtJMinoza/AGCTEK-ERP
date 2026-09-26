import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { PurchaseOrderService } from '../purchase-order/purchase-order.service'
import { PrismaService } from '../../prisma/prisma.service'
import { WorkflowService } from '../workflow/workflow.service'
import { PurchaseCommitmentService } from '../procurement/purchase-commitment.service'

describe('PO supplier usability gate', () => {
    let service: PurchaseOrderService
    const prisma: any = {
        mmSupplier: { findFirst: jest.fn() },
        mmMaterial: { findMany: jest.fn() },
        mmPurchaseOrder: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findUnique: jest.fn(),
        },
        mmPurchaseOrderAudit: { create: jest.fn() },
        mmPurchaseOrderLine: { deleteMany: jest.fn() },
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PurchaseOrderService,
                { provide: PrismaService, useValue: prisma },
                { provide: WorkflowService, useValue: {} },
                {
                    provide: PurchaseCommitmentService,
                    useValue: {
                        recordCommitment: jest.fn(),
                        cancelCommitment: jest.fn(),
                    },
                },
            ],
        }).compile()
        service = module.get(PurchaseOrderService)

        prisma.mmMaterial.findMany.mockResolvedValue([
            {
                id: 'mat-1',
                status: 'ACTIVE',
                deletedAt: null,
                purchasable: true,
                inventoryManaged: true,
                materialCode: 'MAT-1',
            },
        ])
        prisma.mmPurchaseOrder.findFirst.mockResolvedValue(null)
        prisma.mmPurchaseOrderAudit.create.mockResolvedValue({})
    })

    const dto = () => ({
        companyId: 'co-1',
        supplierId: 'sup-1',
        buyerId: 'buyer-1',
        lines: [
            {
                materialId: 'mat-1',
                quantity: 1,
                uomId: 'uom-1',
                unitPrice: 10,
            },
        ],
    })

    it('rejects PO create when supplier is INACTIVE', async () => {
        prisma.mmSupplier.findFirst.mockResolvedValue({
            id: 'sup-1',
            status: 'INACTIVE',
            deletedAt: null,
            supplierCode: 'SUP-1',
            companyId: 'co-1',
            sourcingType: null,
            documents: [],
        })
        await expect(service.create(dto() as any)).rejects.toThrow(BadRequestException)
        expect(prisma.mmPurchaseOrder.create).not.toHaveBeenCalled()
    })

    it('rejects PO create when supplier is BLOCKED', async () => {
        prisma.mmSupplier.findFirst.mockResolvedValue({
            id: 'sup-1',
            status: 'BLOCKED',
            deletedAt: null,
            supplierCode: 'SUP-1',
            companyId: 'co-1',
            sourcingType: null,
            documents: [],
        })
        await expect(service.create(dto() as any)).rejects.toThrow(BadRequestException)
    })

    it('allows PO create when supplier is ACTIVE', async () => {
        prisma.mmSupplier.findFirst.mockResolvedValue({
            id: 'sup-1',
            status: 'ACTIVE',
            deletedAt: null,
            supplierCode: 'SUP-1',
            companyId: 'co-1',
            sourcingType: 'APPROVED',
            documents: [],
        })
        prisma.mmPurchaseOrder.create.mockResolvedValue({
            id: 'po-1',
            poNumber: 'PO-1',
            lines: [],
        })

        const result = await service.create(dto() as any)
        expect(result.id).toBe('po-1')
        expect(prisma.mmPurchaseOrder.create).toHaveBeenCalled()
    })
})
