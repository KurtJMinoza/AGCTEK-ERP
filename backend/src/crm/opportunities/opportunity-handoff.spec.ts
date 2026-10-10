import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import type { PermissionsService } from '../../permissions/permissions.service'
import type { PrismaService } from '../../prisma/prisma.service'
import type { QuotationService } from '../../sd/quotation.service'
import type { SalesOrderService } from '../../sd/sales-order.service'
import { CrmMessagesService } from '../messages/crm-messages.service'
import { CrmOpportunitiesController } from './opportunities.controller'
import type { CrmOpportunitiesService } from './opportunities.service'
import { CrmOpportunityHandoffService } from './opportunity-handoff.service'

const user = { id: 'user-1', role: 'sales' }
const dto = { lines: [{ productId: 'p1', quantity: 2 }], notes: 'Rush delivery' }
const updatedAt = new Date('2026-10-01T00:00:00Z')

const opportunity = (overrides: Record<string, unknown> = {}) => ({
    id: 'opp-1',
    name: 'Big deal',
    customerId: 'cust-1',
    stage: 'NEGOTIATION',
    amount: new Decimal('5000'),
    expectedCloseDate: new Date('2026-12-31T00:00:00Z'),
    currency: 'PHP',
    assignedTo: 'owner-1',
    sdSalesOrderId: null as string | null,
    updatedAt,
    ...overrides,
})

const sdOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'so-1',
    orderNumber: 'SO-000010',
    status: 'DRAFT',
    channel: 'ECOMMERCE',
    source: 'CRM',
    currency: 'PHP',
    customerId: 'cust-1',
    totalAmount: new Decimal('25'),
    lines: [{}],
    createdAt: new Date('2026-10-06T00:00:00Z'),
    ...overrides,
})

const handoff = (overrides: Record<string, unknown> = {}) => ({
    salesOrderId: 'so-1',
    orderNumber: 'SO-000010',
    status: 'DRAFT',
    customerId: 'cust-1',
    currency: 'PHP',
    total: '25.00',
    created: true,
    ...overrides,
})

const uniqueViolation = (field: string) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: [field] },
    })

function setup(opp = opportunity()) {
    const prisma = {
        crmOpportunity: {
            findUnique: jest.fn().mockResolvedValue(opp),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        crmMessage: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
        $transaction: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ id: opp.id }]),
    }
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma))
    const quotations = {
        expireOverdue: jest.fn().mockResolvedValue(0),
        findActiveForOpportunity: jest.fn().mockResolvedValue(null),
        findOne: jest.fn(),
    }
    const opportunities = {
        findOne: jest.fn().mockResolvedValue({ id: 'opp-1', sdSalesOrderId: 'so-1' }),
        assertCanWin: jest.fn().mockResolvedValue(undefined),
    }
    const salesOrders = {
        createFromCrmOpportunity: jest.fn().mockResolvedValue(handoff()),
        findOne: jest.fn().mockResolvedValue(sdOrder()),
        isRetryableCrmHandoffConflict: jest.fn(
            (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002',
        ),
    }
    const permissions = { assertPermission: jest.fn().mockResolvedValue(undefined) }
    const messages = { recordSystem: jest.fn().mockResolvedValue({ count: 0 }) } as unknown as CrmMessagesService
    const service = new CrmOpportunityHandoffService(
        prisma as unknown as PrismaService,
        opportunities as unknown as CrmOpportunitiesService,
        salesOrders as unknown as SalesOrderService,
        permissions as unknown as PermissionsService,
        quotations as unknown as QuotationService,
        messages,
    )
    return { prisma, opportunities, salesOrders, permissions, quotations, messages, service }
}

const linkCall = (prisma: ReturnType<typeof setup>['prisma'], idx = 0) =>
    prisma.crmOpportunity.updateMany.mock.calls[idx][0] as {
        where: Record<string, unknown>
        data: Record<string, unknown>
    }

describe('CrmOpportunityHandoffService.win', () => {
    it('creates the SD order and commits Closed Won in one transaction', async () => {
        const { prisma, opportunities, salesOrders, permissions, service } = setup()

        const result = await service.win('opp-1', dto, user)

        expect(opportunities.assertCanWin).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'opp-1', stage: 'NEGOTIATION' }),
        )
        expect(permissions.assertPermission).toHaveBeenCalledWith({ role: 'sales' }, 'sd.sales-orders', 'create')
        expect(prisma.$transaction).toHaveBeenCalledTimes(1)
        expect(salesOrders.createFromCrmOpportunity).toHaveBeenCalledWith(
            {
                crmOpportunityId: 'opp-1',
                customerId: 'cust-1',
                lines: [{ productId: 'p1', quantity: 2 }],
                notes: 'CRM opportunity "Big deal" (opp-1)\nEstimated amount (CRM): PHP 5000.00\nRush delivery',
                salesOwnerId: 'owner-1',
                createdBy: 'user-1',
            },
            { tx: prisma, attempt: 0 },
        )
        const { where, data } = linkCall(prisma)
        expect(where).toEqual({ id: 'opp-1', stage: 'NEGOTIATION', updatedAt, sdSalesOrderId: null })
        expect(data).toMatchObject({
            stage: 'CLOSED_WON',
            probability: 100,
            sdSalesOrderId: 'so-1',
            updatedBy: 'user-1',
        })
        expect(data.closedAt).toBeInstanceOf(Date)
        expect(result.created).toBe(true)
        expect(result.salesOrder).toMatchObject({
            id: 'so-1',
            orderNumber: 'SO-000010',
            channel: 'ECOMMERCE',
            source: 'CRM',
            totalAmount: '25.00',
        })
    })

    it('returns the linked order for an already won opportunity (double / missed-response retry)', async () => {
        const { prisma, salesOrders, service } = setup(
            opportunity({ stage: 'CLOSED_WON', sdSalesOrderId: 'so-1' }),
        )

        const result = await service.win('opp-1', dto, user)

        expect(result.created).toBe(false)
        expect(result.salesOrder.id).toBe('so-1')
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
    })

    it('writes a SYSTEM stage-change message in the same transaction as Closed Won', async () => {
        const { prisma, messages, service } = setup()

        await service.win('opp-1', dto, user)

        expect(messages.recordSystem).toHaveBeenCalledWith(
            prisma,
            'opp-1',
            [{ field: 'stage', from: 'NEGOTIATION', to: 'CLOSED_WON' }],
            'user-1',
        )
    })

    it('writes the stage message when re-winning a reopened opportunity', async () => {
        const { prisma, messages, service } = setup(opportunity({ sdSalesOrderId: 'so-1' }))

        await service.win('opp-1', {}, user)

        expect(messages.recordSystem).toHaveBeenCalledWith(
            prisma,
            'opp-1',
            [{ field: 'stage', from: 'NEGOTIATION', to: 'CLOSED_WON' }],
            'user-1',
        )
    })

    it('points Closed Won without an order to Retry ERP handoff', async () => {
        const { service } = setup(opportunity({ stage: 'CLOSED_WON' }))

        await expect(service.win('opp-1', dto, user)).rejects.toThrow(/Retry ERP handoff/)
    })

    it('re-wins a reopened opportunity with its existing order and no new SD call', async () => {
        const { prisma, salesOrders, permissions, service } = setup(
            opportunity({ sdSalesOrderId: 'so-1' }),
        )

        const result = await service.win('opp-1', {}, user)

        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
        expect(permissions.assertPermission).not.toHaveBeenCalled()
        const { where, data } = linkCall(prisma)
        expect(where).toEqual({ id: 'opp-1', stage: 'NEGOTIATION', updatedAt, sdSalesOrderId: 'so-1' })
        expect(data).toMatchObject({ stage: 'CLOSED_WON' })
        expect(data).not.toHaveProperty('sdSalesOrderId')
        expect(result.created).toBe(false)
    })

    it('keeps the stage when the stage gates fail (e.g. no active customer)', async () => {
        const { prisma, opportunities, salesOrders, service } = setup()
        opportunities.assertCanWin.mockRejectedValue(
            new BadRequestException('Moving to Closed Won requires an active SD customer'),
        )

        await expect(service.win('opp-1', dto, user)).rejects.toBeInstanceOf(BadRequestException)
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
    })

    it('rejects a win without SD product lines', async () => {
        const { prisma, salesOrders, service } = setup()

        await expect(service.win('opp-1', { lines: [] }, user)).rejects.toThrow(
            /At least one SD product line/,
        )
        await expect(service.win('opp-1', {}, user)).rejects.toBeInstanceOf(BadRequestException)
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
    })

    it.each([
        ['invalid SKU', 'Unknown product(s): p1'],
        ['currency', 'Customer CUST-1 is billed in USD, but SD catalog prices are in PHP'],
    ])('keeps the previous stage when SD rejects the order (%s)', async (_case, message) => {
        const { prisma, salesOrders, service } = setup()
        salesOrders.createFromCrmOpportunity.mockRejectedValue(new BadRequestException(message))

        await expect(service.win('opp-1', dto, user)).rejects.toThrow(message)
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
        expect(prisma.crmOpportunity.findUnique).toHaveBeenCalledTimes(1)
    })

    it('returns the winner when a concurrent handoff took the crmOpportunityId first', async () => {
        const { prisma, salesOrders, service } = setup()
        salesOrders.createFromCrmOpportunity.mockRejectedValueOnce(uniqueViolation('crmOpportunityId'))
        prisma.crmOpportunity.findUnique
            .mockResolvedValueOnce(opportunity())
            .mockResolvedValueOnce(opportunity({ stage: 'CLOSED_WON', sdSalesOrderId: 'so-winner' }))

        const result = await service.win('opp-1', dto, user)

        expect(result.created).toBe(false)
        expect(salesOrders.findOne).toHaveBeenCalledWith('so-winner')
        expect(salesOrders.createFromCrmOpportunity).toHaveBeenCalledTimes(1)
    })

    it('reruns the transaction after an order-number collision', async () => {
        const { prisma, salesOrders, service } = setup()
        salesOrders.createFromCrmOpportunity.mockRejectedValueOnce(uniqueViolation('orderNumber'))

        const result = await service.win('opp-1', dto, user)

        expect(prisma.$transaction).toHaveBeenCalledTimes(2)
        expect(salesOrders.createFromCrmOpportunity.mock.calls[1][1]).toEqual({ tx: prisma, attempt: 1 })
        expect(result.created).toBe(true)
    })

    it('treats a stale row that is now won with an order as the same handoff', async () => {
        const { prisma, service } = setup()
        prisma.crmOpportunity.updateMany.mockResolvedValue({ count: 0 })
        prisma.crmOpportunity.findUnique
            .mockResolvedValueOnce(opportunity())
            .mockResolvedValueOnce(opportunity({ stage: 'CLOSED_WON', sdSalesOrderId: 'so-1' }))

        const result = await service.win('opp-1', dto, user)

        expect(result.created).toBe(false)
    })

    it('rolls back and reports a conflict when the opportunity was edited meanwhile', async () => {
        const { prisma, service } = setup()
        prisma.crmOpportunity.updateMany.mockResolvedValue({ count: 0 })

        await expect(service.win('opp-1', dto, user)).rejects.toThrow(/changed concurrently/)
        expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('refuses to link an earlier order recorded for a different customer', async () => {
        const { prisma, salesOrders, service } = setup()
        salesOrders.createFromCrmOpportunity.mockResolvedValue(
            handoff({ customerId: 'cust-old', created: false }),
        )

        await expect(service.win('opp-1', dto, user)).rejects.toThrow(/different customer/)
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
    })

    it('requires sd:create to create the order', async () => {
        const { salesOrders, permissions, service } = setup()
        permissions.assertPermission.mockRejectedValue(new ForbiddenException())

        await expect(service.win('opp-1', dto, user)).rejects.toBeInstanceOf(ForbiddenException)
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
    })

    it('falls back to the acting user as sales owner and omits a missing amount', async () => {
        const { salesOrders, service } = setup(opportunity({ assignedTo: null, amount: null }))

        await service.win('opp-1', { lines: dto.lines }, user)

        expect(salesOrders.createFromCrmOpportunity).toHaveBeenCalledWith(
            expect.objectContaining({
                salesOwnerId: 'user-1',
                notes: 'CRM opportunity "Big deal" (opp-1)',
            }),
            expect.anything(),
        )
    })

    it('404s for unknown opportunities', async () => {
        const { prisma, service } = setup()
        prisma.crmOpportunity.findUnique.mockResolvedValue(null)

        await expect(service.win('nope', dto, user)).rejects.toBeInstanceOf(NotFoundException)
    })
})

describe('CrmOpportunityHandoffService.createSalesOrder (Retry ERP handoff)', () => {
    it('creates and links the order for Closed Won without changing the stage', async () => {
        const { prisma, salesOrders, service } = setup(opportunity({ stage: 'CLOSED_WON' }))

        const result = await service.createSalesOrder('opp-1', dto, user)

        expect(salesOrders.createFromCrmOpportunity).toHaveBeenCalledWith(
            expect.objectContaining({ crmOpportunityId: 'opp-1' }),
            { tx: prisma, attempt: 0 },
        )
        const { where, data } = linkCall(prisma)
        expect(where).toEqual({ id: 'opp-1', stage: 'CLOSED_WON', sdSalesOrderId: null })
        expect(data).toEqual({ sdSalesOrderId: 'so-1', updatedBy: 'user-1' })
        expect(result.created).toBe(true)
    })

    it('links an order SD already recorded (missed response) instead of creating another', async () => {
        const { prisma, salesOrders, service } = setup(opportunity({ stage: 'CLOSED_WON' }))
        salesOrders.createFromCrmOpportunity.mockResolvedValue(handoff({ created: false }))

        const result = await service.createSalesOrder('opp-1', dto, user)

        expect(linkCall(prisma).data).toEqual({ sdSalesOrderId: 'so-1', updatedBy: 'user-1' })
        expect(result.created).toBe(false)
    })

    it('returns the linked order without creating another', async () => {
        const { prisma, salesOrders, permissions, service } = setup(
            opportunity({ stage: 'CLOSED_WON', sdSalesOrderId: 'so-1' }),
        )

        const result = await service.createSalesOrder('opp-1', dto, user)

        expect(result.created).toBe(false)
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
        expect(permissions.assertPermission).not.toHaveBeenCalled()
    })

    it('still returns the linked order after the opportunity was reopened', async () => {
        const { salesOrders, service } = setup(opportunity({ sdSalesOrderId: 'so-1' }))

        const result = await service.createSalesOrder('opp-1', dto, user)

        expect(result.created).toBe(false)
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
    })

    it('rejects open opportunities (they must be won through POST :id/win)', async () => {
        const { salesOrders, service } = setup()

        await expect(service.createSalesOrder('opp-1', dto, user)).rejects.toBeInstanceOf(
            ConflictException,
        )
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
    })

    it('never overwrites a different linked order', async () => {
        const { prisma, service } = setup(opportunity({ stage: 'CLOSED_WON' }))
        prisma.crmOpportunity.updateMany.mockResolvedValue({ count: 0 })

        await expect(service.createSalesOrder('opp-1', dto, user)).rejects.toThrow(
            /changed concurrently/,
        )
    })
})

describe('CrmOpportunityHandoffService with SD quotations', () => {
    const quote = (overrides: Record<string, unknown> = {}) => ({
        id: 'q-1',
        quotationNumber: 'Q-000042',
        revision: 2,
        status: 'SENT',
        ...overrides,
    })

    it('converts the active SENT / ACCEPTED quotation when no lines are sent, under the opportunity lock', async () => {
        const { prisma, salesOrders, quotations, service } = setup()
        quotations.findActiveForOpportunity.mockResolvedValue(quote({ status: 'ACCEPTED' }))
        const order: string[] = []
        quotations.expireOverdue.mockImplementation(() => (order.push('expire'), Promise.resolve(0)))
        prisma.$queryRaw.mockImplementation(() => (order.push('lock'), Promise.resolve([{ id: 'opp-1' }])))

        const result = await service.win('opp-1', {}, user)

        expect(quotations.expireOverdue).toHaveBeenCalledWith(prisma, 'opp-1')
        expect(order).toEqual(['expire', 'lock'])
        expect(prisma.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE')
        const input = salesOrders.createFromCrmOpportunity.mock.calls[0][0]
        expect(input).toMatchObject({ crmOpportunityId: 'opp-1', customerId: 'cust-1', quotationId: 'q-1' })
        expect(input.lines).toBeUndefined()
        expect(linkCall(prisma).data).toMatchObject({ stage: 'CLOSED_WON', sdSalesOrderId: 'so-1' })
        expect(result.created).toBe(true)
    })

    it('converts an explicitly chosen quotation', async () => {
        const { salesOrders, quotations, service } = setup()
        quotations.findOne.mockResolvedValue(quote())

        await service.win('opp-1', { quotationId: 'q-1' }, user)

        expect(quotations.findOne).toHaveBeenCalledWith('q-1')
        expect(salesOrders.createFromCrmOpportunity.mock.calls[0][0]).toMatchObject({ quotationId: 'q-1' })
    })

    it('refuses an expired quotation after persisting the expiry', async () => {
        const { prisma, salesOrders, quotations, service } = setup()
        quotations.expireOverdue.mockResolvedValue(1)
        quotations.findOne.mockResolvedValue(quote({ status: 'EXPIRED' }))

        await expect(service.win('opp-1', { quotationId: 'q-1' }, user)).rejects.toMatchObject({
            response: { code: 'QUOTATION_EXPIRED', quotationId: 'q-1', message: expect.stringContaining('revise it') },
        })
        expect(quotations.expireOverdue).toHaveBeenCalled()
        expect(prisma.$transaction).not.toHaveBeenCalled()
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
    })

    it('blocks the win while a DRAFT quotation is open', async () => {
        const { salesOrders, quotations, service } = setup()
        quotations.findActiveForOpportunity.mockResolvedValue(quote({ status: 'DRAFT' }))

        for (const body of [{}, dto]) {
            await expect(service.win('opp-1', body, user)).rejects.toMatchObject({
                response: {
                    code: 'QUOTATION_DRAFT_PENDING',
                    message: expect.stringContaining('send or cancel the draft quotation first'),
                },
            })
        }
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
    })

    it('does not let product lines bypass a SENT / ACCEPTED quotation', async () => {
        const { salesOrders, quotations, service } = setup()
        quotations.findActiveForOpportunity.mockResolvedValue(quote())

        await expect(service.win('opp-1', dto, user)).rejects.toMatchObject({
            response: { code: 'QUOTATION_ACTIVE', quotationId: 'q-1' },
        })
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
    })

    it('re-checks inside the transaction for a quotation created after the first check', async () => {
        const { prisma, salesOrders, quotations, service } = setup()
        quotations.findActiveForOpportunity
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(quote({ status: 'DRAFT' }))

        await expect(service.win('opp-1', dto, user)).rejects.toMatchObject({
            response: { code: 'QUOTATION_ACTIVE', message: expect.stringContaining('send or cancel the draft') },
        })
        expect(quotations.findActiveForOpportunity.mock.calls[1][0]).toBe(prisma)
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
    })

    it('refuses a quotation and lines together before any SD call', async () => {
        const { permissions, quotations, service } = setup()

        await expect(service.win('opp-1', { ...dto, quotationId: 'q-1' }, user)).rejects.toThrow(
            'Send either a quotation or lines, not both',
        )
        expect(permissions.assertPermission).not.toHaveBeenCalled()
        expect(quotations.expireOverdue).not.toHaveBeenCalled()
    })

    it('surfaces SD conversion refusals without changing the stage', async () => {
        const { prisma, salesOrders, quotations, service } = setup()
        quotations.findActiveForOpportunity.mockResolvedValue(quote())
        salesOrders.createFromCrmOpportunity.mockRejectedValue(
            new ConflictException({ code: 'QUOTATION_CUSTOMER_MISMATCH' }),
        )

        await expect(service.win('opp-1', {}, user)).rejects.toMatchObject({
            response: { code: 'QUOTATION_CUSTOMER_MISMATCH' },
        })
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
    })

    it('returns the linked order when a concurrent win converted the quotation first', async () => {
        const { prisma, salesOrders, service } = setup()
        prisma.crmOpportunity.findUnique
            .mockResolvedValueOnce(opportunity())
            .mockResolvedValueOnce(opportunity({ stage: 'CLOSED_WON', sdSalesOrderId: 'so-winner' }))

        const result = await service.win('opp-1', {}, user)

        expect(result.created).toBe(false)
        expect(salesOrders.findOne).toHaveBeenCalledWith('so-winner')
        expect(salesOrders.createFromCrmOpportunity).not.toHaveBeenCalled()
    })

    it('Retry ERP handoff converts the active quotation the same way', async () => {
        const { prisma, salesOrders, quotations, service } = setup(opportunity({ stage: 'CLOSED_WON' }))
        quotations.findActiveForOpportunity.mockResolvedValue(quote())

        const result = await service.createSalesOrder('opp-1', {}, user)

        expect(salesOrders.createFromCrmOpportunity.mock.calls[0][0]).toMatchObject({ quotationId: 'q-1' })
        expect(linkCall(prisma).data).toEqual({ sdSalesOrderId: 'so-1', updatedBy: 'user-1' })
        expect(result.created).toBe(true)
    })

    it('Retry ERP handoff returns the order of an already converted quotation', async () => {
        const { salesOrders, quotations, service } = setup(opportunity({ stage: 'CLOSED_WON' }))
        quotations.findOne.mockResolvedValue(quote({ status: 'CONVERTED' }))
        salesOrders.createFromCrmOpportunity.mockResolvedValue(handoff({ created: false }))

        const result = await service.createSalesOrder('opp-1', { quotationId: 'q-1' }, user)

        expect(result.created).toBe(false)
    })
})

describe('CrmOpportunityHandoffService.salesOrder', () => {
    it('returns a read-only summary of the linked order', async () => {
        const { service } = setup(opportunity({ sdSalesOrderId: 'so-1' }))

        await expect(service.salesOrder('opp-1')).resolves.toMatchObject({
            id: 'so-1',
            orderNumber: 'SO-000010',
            status: 'DRAFT',
            lineCount: 1,
        })
    })

    it('404s when nothing is linked', async () => {
        const { service } = setup()

        await expect(service.salesOrder('opp-1')).rejects.toBeInstanceOf(NotFoundException)
    })
})

describe('Opportunity sales-order routes RBAC', () => {
    const proto = CrmOpportunitiesController.prototype

    it('reads with crm.opportunities:read; wins and retries with crm.opportunities:update', () => {
        expect(Reflect.getMetadata(PERMISSION_KEY, proto.salesOrder)).toEqual({
            resource: 'crm.opportunities',
            action: 'read',
        })
        expect(Reflect.getMetadata(PERMISSION_KEY, proto.quotations)).toEqual({ resource: 'crm.opportunities', action: 'read' })
        for (const handler of [proto.win, proto.createSalesOrder, proto.createQuotation]) {
            expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toEqual({
                resource: 'crm.opportunities',
                action: 'update',
            })
        }
    })
})
