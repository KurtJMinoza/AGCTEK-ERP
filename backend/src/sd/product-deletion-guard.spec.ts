import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { ProductService } from './product.service'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Product Catalog deletion guard: a product used in operational transactions
 * must never be hard-deleted — historical picking / packing / shipment /
 * invoice rows reference it and would break. Deactivate / archive instead.
 */
describe('ProductService.remove (deletion guard)', () => {
    const product = {
        id: 'p1',
        divisionId: 'DIV_RETAIL',
        sku: 'RET-PRD-000001',
        name: 'KIRKLAND FISH OIL 400',
        isActive: true,
        status: 'ACTIVE',
        imageUrl: '/uploads/products/fish-oil.png',
        attributes: null,
        materialAssignments: [],
    }

    /** count() models keyed by prisma model name. */
    const COUNT_MODELS = [
        'sdFulfillmentLine',
        'sdShipment',
        'wmPackingSession',
        'wmPackage',
        'wmPickingTask',
        'sdSalesInvoiceLine',
        'sdSalesReturnLine',
        'sdReturnRequestLine',
        'mmInventoryReservationHeader',
        'mmInventoryReservation',
        'mmInventoryTransaction',
        'retailCartItem',
    ] as const

    function setup(overrides: {
        orderLines?: unknown[]
        variants?: unknown[]
        assignments?: unknown[]
        counts?: Record<string, number>
    } = {}) {
        const {
            orderLines = [],
            variants = [],
            assignments = [],
            counts = {},
        } = overrides
        const countMock = (model: string) =>
            jest.fn(() => Promise.resolve(counts[model] ?? 0))

        const prisma: Record<string, unknown> = {
            sdProduct: {
                findUnique: jest.fn().mockResolvedValue(product),
                delete: jest.fn().mockResolvedValue(product),
                update: jest.fn().mockResolvedValue(product),
            },
            sdSalesOrderLine: {
                findMany: jest.fn().mockResolvedValue(orderLines),
            },
            sdProductVariant: {
                findMany: jest.fn().mockResolvedValue(variants),
            },
            sdProductMaterialAssignment: {
                findMany: jest.fn().mockResolvedValue(assignments),
            },
        }
        for (const model of COUNT_MODELS) {
            prisma[model] = { count: countMock(model) }
        }
        const service = new ProductService(
            prisma as unknown as PrismaService,
        )
        return {
            prisma: prisma as unknown as Record<
                string,
                { delete: jest.Mock; count: jest.Mock }
            >,
            service,
        }
    }

    it('1. a product with no references can be hard-deleted', async () => {
        const { prisma, service } = setup()

        await expect(service.remove('p1')).resolves.toEqual({
            id: 'p1',
            deleted: true,
        })
        expect(prisma.sdProduct.delete).toHaveBeenCalledWith({
            where: { id: 'p1' },
        })
    })

    it('2. a product used in a Sales Order cannot be hard deleted (409)', async () => {
        const { service } = setup({
            orderLines: [
                {
                    id: 'sol-1',
                    salesOrderId: 'so-1',
                    reservationHeaderId: null,
                },
            ],
        })

        await expect(service.remove('p1')).rejects.toThrow(ConflictException)
        await expect(service.remove('p1')).rejects.toThrow(
            'already used in orders, picking, packing, shipment, invoice, or inventory',
        )
    })

    it('3. a product used in Picking cannot be hard deleted', async () => {
        const { service } = setup({
            orderLines: [
                {
                    id: 'sol-1',
                    salesOrderId: 'so-1',
                    reservationHeaderId: null,
                },
            ],
            counts: { wmPickingTask: 2 },
        })

        await expect(service.remove('p1')).rejects.toThrow(ConflictException)
    })

    it('4. a product used in Packing cannot be hard deleted', async () => {
        const { service } = setup({
            orderLines: [
                {
                    id: 'sol-1',
                    salesOrderId: 'so-1',
                    reservationHeaderId: null,
                },
            ],
            counts: { wmPackingSession: 1, wmPackage: 3 },
        })

        await expect(service.remove('p1')).rejects.toThrow(ConflictException)
    })

    it('5. a product used in Shipment/Invoice cannot be hard deleted', async () => {
        const { prisma, service } = setup({
            orderLines: [
                {
                    id: 'sol-1',
                    salesOrderId: 'so-1',
                    reservationHeaderId: null,
                },
            ],
            counts: { sdShipment: 1, sdSalesInvoiceLine: 2 },
        })

        await expect(service.remove('p1')).rejects.toThrow(ConflictException)
        expect(prisma.sdProduct.delete).not.toHaveBeenCalled()
    })

    it('inventory activity on the linked MM material blocks deletion', async () => {
        const { service } = setup({
            assignments: [{ materialId: 'mat-1' }],
            counts: { mmInventoryTransaction: 5 },
        })

        await expect(service.remove('p1')).rejects.toThrow(ConflictException)
    })

    it('reports which references blocked the delete', async () => {
        const { service } = setup({
            orderLines: [
                {
                    id: 'sol-1',
                    salesOrderId: 'so-1',
                    reservationHeaderId: 'rsv-1',
                },
            ],
            assignments: [{ materialId: 'mat-1' }],
            counts: {
                wmPickingTask: 1,
                mmInventoryReservationHeader: 1,
                retailCartItem: 2,
            },
        })

        await expect(service.remove('p1')).rejects.toMatchObject({
            response: {
                message: expect.stringContaining('cannot be deleted'),
                references: expect.arrayContaining([
                    'sales order lines',
                    'picking task lines',
                    'inventory reservations',
                    'active cart items',
                ]),
            },
        })
    })

    it('a variant referenced by an order line blocks deletion', async () => {
        const { service } = setup({
            variants: [{ id: 'v1', materialId: 'mat-1' }],
            orderLines: [
                {
                    id: 'sol-1',
                    salesOrderId: 'so-1',
                    reservationHeaderId: null,
                },
            ],
        })

        await expect(service.remove('p1')).rejects.toThrow(ConflictException)
    })

    it('404 for an unknown product', async () => {
        const prisma = {
            sdProduct: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockResolvedValue(null),
            },
        }
        const service = new ProductService(
            prisma as unknown as PrismaService,
        )

        await expect(service.remove('missing')).rejects.toThrow(
            NotFoundException,
        )
    })
})

describe('ProductService lifecycle status', () => {
    const product = {
        id: 'p1',
        divisionId: 'DIV_RETAIL',
        sku: 'RET-PRD-000001',
        name: 'KIRKLAND FISH OIL 400',
        isActive: true,
        status: 'ACTIVE',
        imageUrl: '',
        attributes: null,
        materialAssignments: [],
    }

    function setup() {
        const prisma = {
            sdProduct: {
                findUnique: jest.fn().mockResolvedValue(product),
                update: jest.fn().mockResolvedValue(product),
            },
        }
        const service = new ProductService(
            prisma as unknown as PrismaService,
        )
        return { prisma, service }
    }

    it('6/7. deactivating clears isActive so the shop and new orders hide it', async () => {
        const { prisma, service } = setup()

        await service.setStatus('p1', 'INACTIVE', 'admin-1')

        expect(prisma.sdProduct.update).toHaveBeenCalledWith({
            where: { id: 'p1' },
            data: expect.objectContaining({
                status: 'INACTIVE',
                isActive: false,
                updatedBy: 'admin-1',
            }),
        })
    })

    it('archiving keeps the product for history but unsellable', async () => {
        const { prisma, service } = setup()

        await service.setStatus('p1', 'ARCHIVED', 'admin-1')

        expect(prisma.sdProduct.update).toHaveBeenCalledWith({
            where: { id: 'p1' },
            data: expect.objectContaining({
                status: 'ARCHIVED',
                isActive: false,
            }),
        })
    })

    it('reactivating restores sellability', async () => {
        const inactive = { ...product, status: 'INACTIVE', isActive: false }
        const prisma = {
            sdProduct: {
                findUnique: jest.fn().mockResolvedValue(inactive),
                update: jest.fn().mockResolvedValue(inactive),
            },
        }
        const service = new ProductService(
            prisma as unknown as PrismaService,
        )

        await service.setStatus('p1', 'ACTIVE', 'admin-1')

        expect(prisma.sdProduct.update).toHaveBeenCalledWith({
            where: { id: 'p1' },
            data: expect.objectContaining({
                status: 'ACTIVE',
                isActive: true,
            }),
        })
    })

    it('rejects an unknown status', async () => {
        const { service } = setup()

        await expect(
            service.setStatus('p1', 'DELETED', 'admin-1'),
        ).rejects.toThrow(BadRequestException)
    })
})
