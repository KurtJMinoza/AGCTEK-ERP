import { NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ShipmentsService } from '../../scm/shipments/shipments.service'
import type { SalesOrderService } from '../../sd/sales-order.service'
import { CrmLoyaltyService } from '../loyalty/loyalty.service'
import { CrmCustomer360Controller } from './customer-360.controller'
import { CrmCustomer360Service } from './customer-360.service'

const customer = { id: 'cust-1', customerNumber: 'CUST-000001', companyName: 'Acme', status: 'ACTIVE' }

const sdOrder = {
    id: 'so-1',
    orderNumber: 'SO-000001',
    status: 'CONFIRMED',
    channel: 'STANDARD',
    currency: 'PHP',
    totalAmount: new Decimal('150'),
    lines: [{}, {}],
    createdAt: new Date('2026-10-01T00:00:00Z'),
}

const shipment = { id: 'shp-1', reference: 'SHP-1', status: 'IN_TRANSIT', salesOrderId: 'so-1' }

function mockPrisma(opts: { customer?: boolean; withChildren?: boolean } = {}) {
    const withChildren = opts.withChildren ?? false
    return {
        sdCustomer: {
            findUnique: jest.fn().mockResolvedValue(opts.customer === false ? null : customer),
            update: jest.fn(),
        },
        crmProfile: {
            findUnique: jest.fn().mockResolvedValue(withChildren ? { id: 'prof-1', tier: 'GOLD' } : null),
        },
        crmOpportunity: {
            findMany: jest.fn().mockResolvedValue(
                withChildren
                    ? [
                          {
                              id: 'opp-1',
                              name: 'Big deal',
                              amount: new Decimal('2500'),
                              stage: 'CLOSED_WON',
                              sdSalesOrderId: 'so-1',
                          },
                      ]
                    : [],
            ),
            count: jest.fn().mockResolvedValue(withChildren ? 1 : 0),
        },
        crmTicket: {
            findMany: jest.fn().mockResolvedValue(withChildren ? [{ id: 'tkt-1', status: 'OPEN' }] : []),
            count: jest.fn().mockResolvedValue(withChildren ? 1 : 0),
        },
        crmLoyaltyAccount: { findUnique: jest.fn().mockResolvedValue(null) },
    }
}

function setup(prisma = mockPrisma(), orders: unknown[] = [], shipments: unknown[] = []) {
    const p = prisma as unknown as PrismaService
    const salesOrders = { list: jest.fn().mockResolvedValue(orders) }
    const scm = { findBySalesOrderIds: jest.fn().mockResolvedValue(shipments) }
    const service = new CrmCustomer360Service(
        p,
        new CrmLoyaltyService(p),
        salesOrders as unknown as SalesOrderService,
        scm as unknown as ShipmentsService,
    )
    return { prisma, salesOrders, scm, service }
}

const allOk = {
    profile: { status: 'ok' },
    opportunities: { status: 'ok' },
    tickets: { status: 'ok' },
    loyalty: { status: 'ok' },
    orders: { status: 'ok' },
    shipments: { status: 'ok' },
    invoices: { status: 'not_connected', message: expect.any(String) },
}

describe('CrmCustomer360Service', () => {
    it('returns 404 only when the SdCustomer is missing, and reads nothing else', async () => {
        const { prisma, salesOrders, service } = setup(mockPrisma({ customer: false }))
        await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException)
        expect(prisma.crmProfile.findUnique).not.toHaveBeenCalled()
        expect(prisma.crmOpportunity.findMany).not.toHaveBeenCalled()
        expect(salesOrders.list).not.toHaveBeenCalled()
    })

    it('returns empty sections, all ok, when the customer has no records', async () => {
        const { service, scm } = setup()
        await expect(service.get('cust-1')).resolves.toEqual({
            customer,
            profile: null,
            summary: { openOpportunities: 0, wonOpportunities: 0, openTickets: 0 },
            opportunities: [],
            tickets: [],
            loyalty: {
                accountId: null,
                customerId: 'cust-1',
                pointsBalance: 0,
                tier: null,
                transactions: [],
            },
            orders: [],
            shipments: [],
            invoices: [],
            sections: allOk,
        })
        expect(scm.findBySalesOrderIds).toHaveBeenCalledWith([])
    })

    it('reads SD orders and SCM shipments live and links orders to their opportunity', async () => {
        const { service, salesOrders, scm } = setup(
            mockPrisma({ withChildren: true }),
            [sdOrder],
            [shipment],
        )
        const result = await service.get('cust-1')

        expect(salesOrders.list).toHaveBeenCalledWith({ customerId: 'cust-1', limit: 20 })
        expect(scm.findBySalesOrderIds).toHaveBeenCalledWith(['so-1'])
        expect(result.orders).toEqual([
            expect.objectContaining({
                id: 'so-1',
                orderNumber: 'SO-000001',
                totalAmount: '150.00',
                lineCount: 2,
                opportunity: { id: 'opp-1', name: 'Big deal' },
            }),
        ])
        expect(result.shipments).toEqual([shipment])
        expect(result.opportunities[0].amount).toBe('2500.00')
        expect(result.summary).toEqual({ openOpportunities: 1, wonOpportunities: 1, openTickets: 1 })
        expect(result.sections).toEqual(allOk)
    })

    it('degrades the SD orders section (and dependent shipments) without failing the payload', async () => {
        const { service, salesOrders, scm } = setup(mockPrisma({ withChildren: true }))
        salesOrders.list.mockRejectedValue(new Error('SD down'))

        const result = await service.get('cust-1')

        expect(result.orders).toEqual([])
        expect(result.shipments).toEqual([])
        expect(result.sections.orders).toEqual({
            status: 'unavailable',
            message: 'SD sales orders could not be loaded right now',
        })
        expect(result.sections.shipments.status).toBe('unavailable')
        expect(scm.findBySalesOrderIds).not.toHaveBeenCalled()
        expect(result.opportunities).toHaveLength(1)
        expect(result.sections.opportunities).toEqual({ status: 'ok' })
    })

    it('degrades only the SCM section when shipments fail', async () => {
        const { service, scm } = setup(mockPrisma(), [sdOrder])
        scm.findBySalesOrderIds.mockRejectedValue(new Error('SCM down'))

        const result = await service.get('cust-1')

        expect(result.orders).toHaveLength(1)
        expect(result.sections.orders).toEqual({ status: 'ok' })
        expect(result.shipments).toEqual([])
        expect(result.sections.shipments.status).toBe('unavailable')
    })

    it('degrades each CRM section independently', async () => {
        const prisma = mockPrisma({ withChildren: true })
        prisma.crmProfile.findUnique.mockRejectedValue(new Error('boom'))
        prisma.crmTicket.count.mockRejectedValue(new Error('boom'))
        prisma.crmLoyaltyAccount.findUnique.mockRejectedValue(new Error('boom'))
        const { service } = setup(prisma, [sdOrder])

        const result = await service.get('cust-1')

        expect(result.profile).toBeNull()
        expect(result.tickets).toEqual([])
        expect(result.loyalty).toBeNull()
        expect(result.summary).toEqual({ openOpportunities: 1, wonOpportunities: 1, openTickets: null })
        expect(result.sections).toMatchObject({
            profile: { status: 'unavailable' },
            tickets: { status: 'unavailable' },
            loyalty: { status: 'unavailable' },
            opportunities: { status: 'ok' },
            orders: { status: 'ok' },
        })
    })

    it('scopes every child read to the customer and never writes', async () => {
        const { prisma, service } = setup(mockPrisma({ withChildren: true }))
        await service.get('cust-1')
        expect(prisma.crmOpportunity.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { customerId: 'cust-1' }, take: 50 }),
        )
        expect(prisma.crmTicket.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { customerId: 'cust-1' }, take: 50 }),
        )
        expect(prisma.sdCustomer.update).not.toHaveBeenCalled()
    })
})

describe('CrmCustomer360Controller RBAC metadata', () => {
    it('get requires crm:read', () => {
        expect(Reflect.getMetadata(PERMISSION_KEY, CrmCustomer360Controller.prototype.get)).toEqual({
            module: 'crm',
            action: 'read',
        })
    })
})
