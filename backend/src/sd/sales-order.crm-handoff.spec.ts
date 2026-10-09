import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../prisma/prisma.service'
import { SalesOrderService } from './sales-order.service'
import type { QuotationService } from './quotation.service'

const product = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    sku: `SKU-${id}`,
    name: `Product ${id}`,
    price: new Decimal('12.50'),
    divisionId: 'DIV_A',
    isActive: true,
    ...overrides,
})

const customer = (overrides: Record<string, unknown> = {}) => ({
    id: 'cust-1',
    customerNumber: 'CUST-000001',
    companyName: 'Acme',
    email: 'buyer@acme.test',
    currency: 'PHP',
    status: 'ACTIVE',
    ...overrides,
})

const uniqueViolation = (field: string) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: [field] },
    })

const recorded = (overrides: Record<string, unknown> = {}) => ({
    id: 'so-existing',
    orderNumber: 'SO-000003',
    status: 'DRAFT',
    customerId: 'cust-1',
    currency: 'PHP',
    totalAmount: new Decimal('37.5'),
    ...overrides,
})

function setup() {
    const prisma = {
        sdSalesOrder: {
            findUnique: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(7),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'so-1', ...args.data }),
            ),
        },
        sdCustomer: { findUnique: jest.fn().mockResolvedValue(customer()) },
        sdProduct: {
            findMany: jest.fn().mockResolvedValue([product('p1'), product('p2')]),
        },
        $transaction: jest.fn(),
    }
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma))
    const quotations = { claimForConversion: jest.fn() }
    const optionVariants = {
        findVariantById: jest.fn().mockResolvedValue(null),
        hasVariants: jest.fn().mockResolvedValue(false),
    }
    const service = new SalesOrderService(
        prisma as unknown as PrismaService,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        quotations as unknown as QuotationService,
        optionVariants as never,
    )
    return { prisma, service, quotations }
}

const input = {
    crmOpportunityId: 'opp-1',
    customerId: 'cust-1',
    lines: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
    ],
    notes: 'Handoff',
    salesOwnerId: 'user-owner',
    createdBy: 'user-1',
}

describe('SalesOrderService.createFromCrmOpportunity', () => {
    it('creates an ECOMMERCE / CRM draft priced from the SD catalog in one transaction', async () => {
        const { prisma, service } = setup()

        const result = await service.createFromCrmOpportunity(input)

        expect(prisma.$transaction).toHaveBeenCalledTimes(1)
        expect(prisma.sdSalesOrder.findUnique).toHaveBeenCalledWith({
            where: { crmOpportunityId: 'opp-1' },
        })
        const data = prisma.sdSalesOrder.create.mock.calls[0][0].data as {
            subtotal: Decimal
            lines: { create: { lineTotal: Decimal }[] }
        }
        expect(data).toMatchObject({
            orderNumber: 'SO-000008',
            channel: 'ECOMMERCE',
            source: 'CRM',
            crmOpportunityId: 'opp-1',
            status: 'DRAFT',
            divisionId: 'DIV_A',
            currency: 'PHP',
            customerId: 'cust-1',
            customerName: 'Acme',
            notes: 'Handoff',
            salesOwnerId: 'user-owner',
            createdBy: 'user-1',
        })
        expect(data).not.toHaveProperty('idempotencyKey')
        const lines = data.lines.create
        expect(lines[0]).toMatchObject({ lineNumber: 1, productId: 'p1', sku: 'SKU-p1' })
        expect(lines[0].lineTotal.toFixed(2)).toBe('25.00')
        expect(lines.every((l) => !('materialId' in l))).toBe(true)
        expect(result).toEqual({
            salesOrderId: 'so-1',
            orderNumber: 'SO-000008',
            status: 'DRAFT',
            customerId: 'cust-1',
            currency: 'PHP',
            total: '37.50',
            created: true,
        })
    })

    it('returns the recorded order for the opportunity without creating another', async () => {
        const { prisma, service } = setup()
        prisma.sdSalesOrder.findUnique.mockResolvedValue(recorded())

        const result = await service.createFromCrmOpportunity(input)

        expect(result).toMatchObject({ salesOrderId: 'so-existing', total: '37.50', created: false })
        expect(prisma.sdSalesOrder.create).not.toHaveBeenCalled()
        expect(prisma.sdCustomer.findUnique).not.toHaveBeenCalled()
    })

    it('returns the recorded order even if a retry sends different lines', async () => {
        const { prisma, service } = setup()
        prisma.sdSalesOrder.findUnique.mockResolvedValue(recorded())

        const result = await service.createFromCrmOpportunity({ ...input, lines: [] })

        expect(result.created).toBe(false)
    })

    it('re-fetches the winner when a concurrent handoff hits the crmOpportunityId constraint', async () => {
        const { prisma, service } = setup()
        prisma.sdSalesOrder.create.mockRejectedValueOnce(uniqueViolation('crmOpportunityId'))
        prisma.sdSalesOrder.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(recorded({ id: 'so-winner' }))

        const result = await service.createFromCrmOpportunity(input)

        expect(prisma.$transaction).toHaveBeenCalledTimes(2)
        expect(result).toMatchObject({ salesOrderId: 'so-winner', created: false })
    })

    it('retries an order-number collision with a suffixed number', async () => {
        const { prisma, service } = setup()
        prisma.sdSalesOrder.create.mockRejectedValueOnce(uniqueViolation('orderNumber'))

        const result = await service.createFromCrmOpportunity(input)

        expect(result.created).toBe(true)
        expect(prisma.sdSalesOrder.create.mock.calls[1][0].data.orderNumber).toMatch(
            /^SO-000008-[0-9A-F]{4}$/,
        )
    })

    it('rejects zero lines, duplicates and non-positive quantities', async () => {
        const { prisma, service } = setup()
        await expect(service.createFromCrmOpportunity({ ...input, lines: [] })).rejects.toThrow(
            /At least one line/,
        )
        await expect(
            service.createFromCrmOpportunity({
                ...input,
                lines: [
                    { productId: 'p1', quantity: 1 },
                    { productId: 'p1', quantity: 2 },
                ],
            }),
        ).rejects.toBeInstanceOf(BadRequestException)
        await expect(
            service.createFromCrmOpportunity({ ...input, lines: [{ productId: 'p1', quantity: 0 }] }),
        ).rejects.toThrow(/positive/)
        expect(prisma.sdSalesOrder.create).not.toHaveBeenCalled()
    })

    it('rejects unknown, inactive and cross-division products', async () => {
        const { prisma, service } = setup()
        prisma.sdProduct.findMany.mockResolvedValueOnce([product('p1')])
        await expect(service.createFromCrmOpportunity(input)).rejects.toThrow(/Unknown product/)

        prisma.sdProduct.findMany.mockResolvedValueOnce([
            product('p1'),
            product('p2', { isActive: false }),
        ])
        await expect(service.createFromCrmOpportunity(input)).rejects.toThrow(/Inactive product/)

        prisma.sdProduct.findMany.mockResolvedValueOnce([
            product('p1'),
            product('p2', { divisionId: 'DIV_B' }),
        ])
        await expect(service.createFromCrmOpportunity(input)).rejects.toThrow(/one sales division/)
        expect(prisma.sdSalesOrder.create).not.toHaveBeenCalled()
    })

    it('rejects a customer billed in another currency instead of converting', async () => {
        const { prisma, service } = setup()
        prisma.sdCustomer.findUnique.mockResolvedValue(customer({ currency: 'USD' }))

        await expect(service.createFromCrmOpportunity(input)).rejects.toThrow(
            /billed in USD.*does not convert/,
        )
        expect(prisma.sdSalesOrder.create).not.toHaveBeenCalled()
    })

    it('requires an existing, active customer', async () => {
        const { prisma, service } = setup()
        prisma.sdCustomer.findUnique.mockResolvedValueOnce(null)
        await expect(service.createFromCrmOpportunity(input)).rejects.toBeInstanceOf(
            NotFoundException,
        )

        prisma.sdCustomer.findUnique.mockResolvedValueOnce(customer({ status: 'BLOCKED' }))
        await expect(service.createFromCrmOpportunity(input)).rejects.toBeInstanceOf(
            ConflictException,
        )
    })

    it("does not treat a quotation's active-per-opportunity violation as a retryable order conflict", () => {
        const { service } = setup()
        const violation = (modelName: string, target: string[]) =>
            new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
                code: 'P2002',
                clientVersion: 'test',
                meta: { modelName, target },
            })

        expect(service.isRetryableCrmHandoffConflict(violation('SdSalesOrder', ['crmOpportunityId']))).toBe(true)
        expect(service.isRetryableCrmHandoffConflict(violation('SdSalesOrder', ['orderNumber']))).toBe(true)
        expect(service.isRetryableCrmHandoffConflict(violation('SdQuotation', ['crmOpportunityId']))).toBe(false)
    })

    describe('from a quotation', () => {
        const frozenQuote = {
            id: 'q-1',
            quotationNumber: 'Q-000042',
            divisionId: 'DIV_A',
            subtotal: new Decimal('2800.97'),
            totalAmount: new Decimal('2800.97'),
            lines: [
                {
                    id: 'ql-1',
                    quotationId: 'q-1',
                    lineNumber: 1,
                    productId: 'p1',
                    sku: 'SKU-p1',
                    description: 'Product p1',
                    quantity: new Decimal(2),
                    unitPrice: new Decimal('1250.50'),
                    lineTotal: new Decimal('2501.00'),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'ql-2',
                    quotationId: 'q-1',
                    lineNumber: 2,
                    productId: 'p2',
                    sku: 'SKU-p2',
                    description: 'Product p2',
                    quantity: new Decimal(3),
                    unitPrice: new Decimal('99.99'),
                    lineTotal: new Decimal('299.97'),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
        }
        const fromQuote = { ...input, lines: undefined, quotationId: 'q-1' }

        it('creates the order from the frozen quotation lines and prices, not the catalog', async () => {
            const { prisma, service, quotations } = setup()
            quotations.claimForConversion.mockResolvedValue({ quote: frozenQuote, alreadyConverted: false })

            const result = await service.createFromCrmOpportunity(fromQuote)

            expect(quotations.claimForConversion).toHaveBeenCalledWith(prisma, {
                quotationId: 'q-1',
                crmOpportunityId: 'opp-1',
                customerId: 'cust-1',
                convertedBy: 'user-1',
            })
            expect(prisma.sdProduct.findMany).not.toHaveBeenCalled()
            const data = prisma.sdSalesOrder.create.mock.calls[0][0].data as Record<string, any>
            expect(data).toMatchObject({
                quotationId: 'q-1',
                crmOpportunityId: 'opp-1',
                channel: 'ECOMMERCE',
                source: 'CRM',
                status: 'DRAFT',
                divisionId: 'DIV_A',
                customerName: 'Acme',
            })
            expect(data.totalAmount.toFixed(2)).toBe('2800.97')
            expect(
                data.lines.create.map((l: Record<string, any>) => [l.lineNumber, l.sku, l.quantity.toString(), l.unitPrice.toFixed(2)]),
            ).toEqual([
                [1, 'SKU-p1', '2', '1250.50'],
                [2, 'SKU-p2', '3', '99.99'],
            ])
            expect(data.lines.create[0]).not.toHaveProperty('id')
            expect(data.lines.create[0]).not.toHaveProperty('quotationId')
            expect(result).toMatchObject({ created: true, total: '2800.97' })
        })

        it('returns the order of a concurrent conversion instead of creating another', async () => {
            const { prisma, service, quotations } = setup()
            quotations.claimForConversion.mockResolvedValue({ quote: frozenQuote, alreadyConverted: true })
            prisma.sdSalesOrder.findUnique
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(recorded({ id: 'so-first', quotationId: 'q-1' }))

            const result = await service.createFromCrmOpportunity(fromQuote)

            expect(prisma.sdSalesOrder.findUnique).toHaveBeenLastCalledWith({ where: { quotationId: 'q-1' } })
            expect(result).toMatchObject({ salesOrderId: 'so-first', created: false })
            expect(prisma.sdSalesOrder.create).not.toHaveBeenCalled()
        })

        it('reports a CONVERTED quotation without an order as a conflict', async () => {
            const { service, quotations } = setup()
            quotations.claimForConversion.mockResolvedValue({ quote: frozenQuote, alreadyConverted: true })

            await expect(service.createFromCrmOpportunity(fromQuote)).rejects.toThrow(/CONVERTED but has no sales order/)
        })

        it('refuses a quotation and lines together before claiming', async () => {
            const { prisma, service, quotations } = setup()

            await expect(service.createFromCrmOpportunity({ ...input, quotationId: 'q-1' })).rejects.toThrow(
                'Send either a quotation or lines, not both',
            )
            expect(quotations.claimForConversion).not.toHaveBeenCalled()
            expect(prisma.sdSalesOrder.create).not.toHaveBeenCalled()
        })

        it('propagates claim refusals and re-checks the customer', async () => {
            const { prisma, service, quotations } = setup()
            const expired = new ConflictException({ code: 'QUOTATION_EXPIRED' })
            quotations.claimForConversion.mockRejectedValueOnce(expired)
            await expect(service.createFromCrmOpportunity(fromQuote)).rejects.toBe(expired)

            quotations.claimForConversion.mockResolvedValue({ quote: frozenQuote, alreadyConverted: false })
            prisma.sdCustomer.findUnique.mockResolvedValueOnce(customer({ status: 'BLOCKED' }))
            await expect(service.createFromCrmOpportunity(fromQuote)).rejects.toThrow(/BLOCKED/)
            expect(prisma.sdSalesOrder.create).not.toHaveBeenCalled()
        })

        it('returns the recorded order for the opportunity without claiming the quotation', async () => {
            const { prisma, service, quotations } = setup()
            prisma.sdSalesOrder.findUnique.mockResolvedValue(recorded())

            await expect(service.createFromCrmOpportunity(fromQuote)).resolves.toMatchObject({ created: false })
            expect(quotations.claimForConversion).not.toHaveBeenCalled()
        })
    })

    describe("inside the caller's transaction", () => {
        it('uses the given client and does not open its own transaction', async () => {
            const { prisma, service } = setup()

            const result = await service.createFromCrmOpportunity(input, {
                tx: prisma as unknown as Prisma.TransactionClient,
            })

            expect(result.created).toBe(true)
            expect(prisma.$transaction).not.toHaveBeenCalled()
        })

        it('surfaces unique violations for the caller to retry', async () => {
            const { prisma, service } = setup()
            const conflict = uniqueViolation('crmOpportunityId')
            prisma.sdSalesOrder.create.mockRejectedValueOnce(conflict)

            await expect(
                service.createFromCrmOpportunity(input, {
                    tx: prisma as unknown as Prisma.TransactionClient,
                }),
            ).rejects.toBe(conflict)
            expect(service.isRetryableCrmHandoffConflict(conflict)).toBe(true)
            expect(service.isRetryableCrmHandoffConflict(uniqueViolation('orderNumber'))).toBe(true)
            expect(service.isRetryableCrmHandoffConflict(uniqueViolation('email'))).toBe(false)
            expect(service.isRetryableCrmHandoffConflict(new Error('boom'))).toBe(false)
        })
    })
})
