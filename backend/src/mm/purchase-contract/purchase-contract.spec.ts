import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PurchaseContractService } from './purchase-contract.service'

describe('MM-07 Purchase Contracts', () => {
    let service: PurchaseContractService
    const mockPrisma: any = {
        mmPurchaseContract: {
            create: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        mmPurchaseContractLine: {
            deleteMany: jest.fn(),
        },
        mmPurchaseContractAudit: {
            create: jest.fn().mockResolvedValue({}),
        },
        mmPurchaseOrder: {
            findUnique: jest.fn(),
        },
        mmSupplier: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
        },
        mmMaterial: {
            findMany: jest.fn(),
        },
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        mockPrisma.mmSupplier.findFirst.mockResolvedValue({
            id: 'sup-1',
            status: 'ACTIVE',
            deletedAt: null,
            supplierCode: 'SUP-1',
            companyId: 'co-1',
            sourcingType: 'APPROVED',
            documents: [],
        })
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
                PurchaseContractService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()
        service = module.get(PurchaseContractService)
    })

    it('creates DRAFT contract with optional PO link (no inventory posting)', async () => {
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({
            id: 'po-1',
            supplierId: 'sup-1',
        })
        mockPrisma.mmPurchaseContract.count.mockResolvedValue(0)
        mockPrisma.mmPurchaseContract.create.mockResolvedValue({
            id: 'pc-1',
            contractNumber: 'PC-20260908-0001',
            status: 'DRAFT',
            purchaseOrderId: 'po-1',
            supplierId: 'sup-1',
        })

        const result = await service.create({
            companyId: 'co-1',
            supplierId: 'sup-1',
            buyerId: 'buyer-1',
            validFrom: '2026-09-01',
            purchaseOrderId: 'po-1',
            lines: [
                {
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    negotiatedPrice: 12.5,
                    moq: 10,
                    leadTimeDays: 5,
                },
            ],
        })

        expect(result.status).toBe('DRAFT')
        expect(result.purchaseOrderId).toBe('po-1')
        expect(mockPrisma.mmPurchaseContract.create).toHaveBeenCalled()
        expect(Object.keys(mockPrisma)).not.toContain('mmInventoryTransaction')
    })

    it('activates DRAFT contract and links PO relation', async () => {
        const draft = {
            id: 'pc-1',
            status: 'DRAFT',
            supplierId: 'sup-1',
            purchaseOrderId: null,
        }
        mockPrisma.mmPurchaseContract.findUnique.mockResolvedValue(draft)
        mockPrisma.mmPurchaseContract.update.mockResolvedValue({
            ...draft,
            status: 'ACTIVE',
            activatedAt: new Date(),
        })

        const activated = await service.activate('pc-1')
        expect(activated.status).toBe('ACTIVE')

        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({
            id: 'po-2',
            supplierId: 'sup-1',
        })
        mockPrisma.mmPurchaseContract.findUnique.mockResolvedValue({
            ...draft,
            status: 'ACTIVE',
        })
        mockPrisma.mmPurchaseContract.update.mockResolvedValue({
            ...draft,
            status: 'ACTIVE',
            purchaseOrderId: 'po-2',
        })

        const linked = await service.linkPurchaseOrder('pc-1', 'po-2')
        expect(linked.purchaseOrderId).toBe('po-2')
    })

    it('rejects PO link when supplier mismatches', async () => {
        mockPrisma.mmPurchaseContract.findUnique.mockResolvedValue({
            id: 'pc-1',
            status: 'ACTIVE',
            supplierId: 'sup-1',
        })
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({
            id: 'po-9',
            supplierId: 'sup-other',
        })

        await expect(
            service.linkPurchaseOrder('pc-1', 'po-9'),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('contract module source never imports InventoryPostingService', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const src = require('fs').readFileSync(
            require('path').join(__dirname, 'purchase-contract.service.ts'),
            'utf8',
        ) as string
        expect(src).not.toMatch(/from ['"].*inventory-posting/)
        expect(src).not.toMatch(/mmInventoryTransaction/)
        expect(src).not.toMatch(/postTransaction/)
    })
})

describe('MM-07 Procurement History', () => {
    it('history service is read-only over PO lines', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const src = require('fs').readFileSync(
            require('path').join(
                __dirname,
                '../procurement-history/procurement-history.service.ts',
            ),
            'utf8',
        ) as string
        expect(src).toMatch(/findMany/)
        expect(src).not.toMatch(/\.create\(/)
        expect(src).not.toMatch(/InventoryPostingService/)
    })
})
