import { Test, TestingModule } from '@nestjs/testing'
import { PRODUCT_IN_USE_MESSAGE, ProductService } from './product.service'
import { PrismaService } from '../prisma/prisma.service'
import { CommercialAvailabilityService } from './commercial-availability.service'

/**
 * Product Catalog / storefront ATP must read the live MM inventory ledger and
 * must never fall back to material master static stock fields.
 */
describe('ProductService.getStorefrontAvailability', () => {
    const prisma: any = {
        sdProduct: { findUnique: jest.fn() },
        sdProductMaterialAssignment: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
        },
        sdProductVariant: { findMany: jest.fn() },
    }
    const availability = {
        getCompanyMaterialLedger: jest.fn(),
    }

    let service: ProductService

    beforeEach(async () => {
        jest.clearAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductService,
                { provide: PrismaService, useValue: prisma },
                {
                    provide: CommercialAvailabilityService,
                    useValue: availability,
                },
            ],
        }).compile()
        service = module.get(ProductService)
    })

    it('returns MM ledger stock for the linked material (never a false zero)', async () => {
        prisma.sdProduct.findUnique.mockResolvedValue({
            id: 'p1',
            productType: 'STOCK_ITEM',
            isActive: true,
        })
        prisma.sdProductVariant.findMany.mockResolvedValue([])
        prisma.sdProductMaterialAssignment.findMany.mockResolvedValue([
            { materialId: 'mat-1', companyId: 'company-1', divisionId: null },
        ])
        availability.getCompanyMaterialLedger.mockResolvedValue({
            onHandQty: 50,
            reservedQty: 10,
            availableQty: 40,
        })

        const result = await service.getStorefrontAvailability(
            'DIV_RETAIL',
            'SKU-1',
            availability as never,
        )

        expect(result.availableQuantity).toBe(40)
        expect(result.physicalStock).toBe(50)
        expect(result.reservedQuantity).toBe(10)
        expect(availability.getCompanyMaterialLedger).toHaveBeenCalledWith(
            'mat-1',
            'company-1',
        )
    })

    it('filters the MM ledger query by the product assignment companyId', async () => {
        prisma.sdProduct.findUnique.mockResolvedValue({
            id: 'p1',
            productType: 'STOCK_ITEM',
            isActive: true,
        })
        prisma.sdProductVariant.findMany.mockResolvedValue([])
        prisma.sdProductMaterialAssignment.findMany.mockResolvedValue([
            {
                materialId: 'mat-1',
                companyId: 'company-agctek',
                divisionId: null,
            },
        ])
        availability.getCompanyMaterialLedger.mockResolvedValue({
            onHandQty: 12,
            reservedQty: 2,
            availableQty: 10,
        })

        await service.getStorefrontAvailability(
            'DIV_RETAIL',
            'SKU-1',
            availability as never,
        )

        expect(availability.getCompanyMaterialLedger).toHaveBeenCalledWith(
            'mat-1',
            'company-agctek',
        )
    })

    it('reads stock from the selected variant material, not the parent product', async () => {
        prisma.sdProduct.findUnique.mockResolvedValue({
            id: 'p1',
            productType: 'STOCK_ITEM',
            isActive: true,
        })
        prisma.sdProductVariant.findMany.mockResolvedValue([
            {
                id: 'v-parent',
                materialId: 'mat-parent',
                companyId: 'company-1',
                isActive: true,
                isDefault: false,
                sortOrder: 0,
            },
            {
                id: 'v-selected',
                materialId: 'mat-selected',
                companyId: 'company-1',
                isActive: true,
                isDefault: false,
                sortOrder: 1,
            },
        ])
        availability.getCompanyMaterialLedger.mockResolvedValue({
            onHandQty: 7,
            reservedQty: 1,
            availableQty: 6,
        })

        const result = await service.getStorefrontAvailability(
            'DIV_RETAIL',
            'SKU-1',
            availability as never,
            'v-selected',
        )

        expect(result.hasVariants).toBe(true)
        expect(result.variantId).toBe('v-selected')
        expect(result.materialId).toBe('mat-selected')
        expect(result.availableQuantity).toBe(6)
        expect(result.physicalStock).toBe(7)
        expect(availability.getCompanyMaterialLedger).toHaveBeenCalledWith(
            'mat-selected',
            'company-1',
        )
        expect(availability.getCompanyMaterialLedger).not.toHaveBeenCalledWith(
            'mat-parent',
            'company-1',
        )
    })

    it('falls back to the default variant material when no variant is selected', async () => {
        prisma.sdProduct.findUnique.mockResolvedValue({
            id: 'p1',
            productType: 'STOCK_ITEM',
            isActive: true,
        })
        prisma.sdProductVariant.findMany.mockResolvedValue([
            {
                id: 'v-other',
                materialId: 'mat-other',
                companyId: 'company-1',
                isActive: true,
                isDefault: false,
                sortOrder: 0,
            },
            {
                id: 'v-default',
                materialId: 'mat-default',
                companyId: 'company-1',
                isActive: true,
                isDefault: true,
                sortOrder: 1,
            },
        ])
        availability.getCompanyMaterialLedger.mockResolvedValue({
            onHandQty: 30,
            reservedQty: 0,
            availableQty: 30,
        })

        const result = await service.getStorefrontAvailability(
            'DIV_RETAIL',
            'SKU-1',
            availability as never,
        )

        expect(result.materialId).toBe('mat-default')
        expect(result.variantId).toBe('v-default')
        expect(result.availableQuantity).toBe(30)
    })

    it('never uses the parent product material when the product has variants', async () => {
        prisma.sdProduct.findUnique.mockResolvedValue({
            id: 'p1',
            productType: 'STOCK_ITEM',
            isActive: true,
        })
        prisma.sdProductVariant.findMany.mockResolvedValue([
            {
                id: 'v-1',
                materialId: 'mat-variant',
                companyId: 'company-1',
                isActive: true,
                isDefault: true,
                sortOrder: 0,
            },
        ])
        prisma.sdProductMaterialAssignment.findMany.mockResolvedValue([
            {
                materialId: 'mat-parent-with-huge-stock',
                companyId: 'company-1',
                divisionId: null,
            },
        ])
        availability.getCompanyMaterialLedger.mockResolvedValue({
            onHandQty: 3,
            reservedQty: 0,
            availableQty: 3,
        })

        const result = await service.getStorefrontAvailability(
            'DIV_RETAIL',
            'SKU-1',
            availability as never,
        )

        expect(result.materialId).toBe('mat-variant')
        expect(result.availableQuantity).toBe(3)
        expect(
            availability.getCompanyMaterialLedger,
        ).not.toHaveBeenCalledWith(
            'mat-parent-with-huge-stock',
            'company-1',
        )
    })

    it('reports NOT_MAPPED when a variant links to no MM material', async () => {
        prisma.sdProduct.findUnique.mockResolvedValue({
            id: 'p1',
            productType: 'STOCK_ITEM',
            isActive: true,
        })
        prisma.sdProductVariant.findMany.mockResolvedValue([
            {
                id: 'v-1',
                materialId: null,
                companyId: 'company-1',
                isActive: true,
                isDefault: true,
                sortOrder: 0,
            },
        ])

        const result = await service.getStorefrontAvailability(
            'DIV_RETAIL',
            'SKU-1',
            availability as never,
        )

        expect(result.state).toBe('NOT_MAPPED')
        expect(result.availableQuantity).toBe(0)
        expect(availability.getCompanyMaterialLedger).not.toHaveBeenCalled()
    })

    it('reports OUT_OF_STOCK when the MM ledger has no sellable stock', async () => {
        prisma.sdProduct.findUnique.mockResolvedValue({
            id: 'p1',
            productType: 'STOCK_ITEM',
            isActive: true,
        })
        prisma.sdProductVariant.findMany.mockResolvedValue([])
        prisma.sdProductMaterialAssignment.findMany.mockResolvedValue([
            { materialId: 'mat-1', companyId: 'company-1', divisionId: null },
        ])
        availability.getCompanyMaterialLedger.mockResolvedValue({
            onHandQty: 0,
            reservedQty: 0,
            availableQty: 0,
        })

        const result = await service.getStorefrontAvailability(
            'DIV_RETAIL',
            'SKU-1',
            availability as never,
        )

        expect(result.state).toBe('OUT_OF_STOCK')
        expect(result.availableQuantity).toBe(0)
        // A genuine zero from the ledger is still reported — the API contract is
        // honest, the caller must not invent stock for a failed request.
        expect(availability.getCompanyMaterialLedger).toHaveBeenCalledTimes(1)
    })
})

describe('ProductService deletion lifecycle', () => {
    const product = {
        id: 'product-1',
        sku: 'SKU-1',
        status: 'ACTIVE',
        isActive: true,
        attributes: null,
        materialAssignments: [],
    }

    const makePrisma = () => ({
        sdProduct: {
            findUnique: jest.fn().mockResolvedValue(product),
            delete: jest.fn().mockResolvedValue({ id: product.id }),
        },
        sdProductVariant: { findMany: jest.fn().mockResolvedValue([]) },
        sdProductMaterialAssignment: { findMany: jest.fn().mockResolvedValue([]) },
        sdSalesOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
        sdFulfillmentLine: { count: jest.fn().mockResolvedValue(0) },
        sdShipment: { count: jest.fn().mockResolvedValue(0) },
        wmPackingSession: { count: jest.fn().mockResolvedValue(0) },
        wmPackage: { count: jest.fn().mockResolvedValue(0) },
        wmPickingTask: { count: jest.fn().mockResolvedValue(0) },
        sdSalesInvoiceLine: { count: jest.fn().mockResolvedValue(0) },
        sdSalesReturnLine: { count: jest.fn().mockResolvedValue(0) },
        sdReturnRequestLine: { count: jest.fn().mockResolvedValue(0) },
        mmInventoryReservationHeader: { count: jest.fn().mockResolvedValue(0) },
        mmInventoryReservation: { count: jest.fn().mockResolvedValue(0) },
        mmInventoryTransaction: { count: jest.fn().mockResolvedValue(0) },
        retailCartItem: { count: jest.fn().mockResolvedValue(0) },
    })

    it('allows a product with no operational references to be hard-deleted', async () => {
        const prisma = makePrisma()
        const service = new ProductService(prisma as unknown as PrismaService)

        await expect(service.remove(product.id)).resolves.toEqual({
            id: product.id,
            deleted: true,
        })
        expect(prisma.sdProduct.delete).toHaveBeenCalledWith({
            where: { id: product.id },
        })
    })

    it('blocks deletion with a conflict when the product was used in a sales order', async () => {
        const prisma = makePrisma()
        prisma.sdSalesOrderLine.findMany.mockResolvedValue([
            { id: 'order-line-1', salesOrderId: 'order-1' },
        ])
        const service = new ProductService(prisma as unknown as PrismaService)

        await expect(service.remove(product.id)).rejects.toThrow(
            PRODUCT_IN_USE_MESSAGE,
        )
        expect(prisma.sdProduct.delete).not.toHaveBeenCalled()
    })
})
