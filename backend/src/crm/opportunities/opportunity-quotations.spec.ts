import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { PermissionsService } from '../../permissions/permissions.service'
import type { PrismaService } from '../../prisma/prisma.service'
import type { QuotationService } from '../../sd/quotation.service'
import { CrmOpportunityQuotationsService } from './opportunity-quotations.service'

const user = { id: 'user-1', role: 'sales' }
const dto = { lines: [{ productId: 'p1', quantity: 2.5 }], notes: 'Rush' }

function setup(opp: Record<string, unknown> | null = { id: 'opp-1', stage: 'PROPOSAL', customerId: 'cust-1', sdSalesOrderId: null }) {
    const order: string[] = []
    const prisma = {
        $transaction: jest.fn((fn: (tx: unknown) => unknown): unknown => fn(prisma)),
        $queryRaw: jest.fn(() => (order.push('lock'), Promise.resolve(opp ? [{ id: 'opp-1' }] : []))),
        crmOpportunity: {
            findUnique: jest.fn().mockResolvedValue(opp && { id: opp.id }),
            findUniqueOrThrow: jest.fn(() => (order.push('read'), Promise.resolve(opp))),
        },
    }
    const quotations = {
        create: jest.fn(() => (order.push('create'), Promise.resolve({ id: 'q-1', status: 'DRAFT' }))),
        listForOpportunity: jest.fn().mockResolvedValue([{ id: 'q-1' }]),
    }
    const permissions = { assertPermission: jest.fn().mockResolvedValue(undefined) }
    const service = new CrmOpportunityQuotationsService(
        prisma as unknown as PrismaService,
        quotations as unknown as QuotationService,
        permissions as unknown as PermissionsService,
    )
    return { prisma, quotations, permissions, service, order }
}

describe('CrmOpportunityQuotationsService.create', () => {
    it.each(['PROPOSAL', 'NEGOTIATION'])(
        'creates the SD quotation for the opportunity customer in %s, under the row lock',
        async (stage) => {
            const { prisma, quotations, permissions, service, order } = setup({
                id: 'opp-1',
                stage,
                customerId: 'cust-1',
                sdSalesOrderId: null,
            })

            await expect(service.create('opp-1', dto, user)).resolves.toEqual({ id: 'q-1', status: 'DRAFT' })

            expect(permissions.assertPermission).toHaveBeenCalledWith({ role: 'sales' }, 'sd.quotations', 'create')
            expect(order).toEqual(['lock', 'read', 'create'])
            expect(quotations.create).toHaveBeenCalledWith(
                {
                    crmOpportunityId: 'opp-1',
                    customerId: 'cust-1',
                    lines: [{ productId: 'p1', quantity: 2.5 }],
                    notes: 'Rush',
                    createdBy: 'user-1',
                },
                { tx: prisma },
            )
        },
    )

    it.each(['PROSPECTING', 'QUALIFICATION', 'CLOSED_WON', 'CLOSED_LOST'])('refuses %s', async (stage) => {
        const { quotations, service } = setup({ id: 'opp-1', stage, customerId: 'cust-1', sdSalesOrderId: null })

        await expect(service.create('opp-1', dto, user)).rejects.toThrow(
            `Quotations are created in the Proposal or Negotiation stage (this opportunity is ${stage})`,
        )
        expect(quotations.create).not.toHaveBeenCalled()
    })

    it('refuses an opportunity that already has its SD sales order (reopened)', async () => {
        const { quotations, service } = setup({
            id: 'opp-1',
            stage: 'NEGOTIATION',
            customerId: 'cust-1',
            sdSalesOrderId: 'so-1',
        })

        await expect(service.create('opp-1', dto, user)).rejects.toBeInstanceOf(ConflictException)
        expect(quotations.create).not.toHaveBeenCalled()
    })

    it('requires sd:create before touching the opportunity', async () => {
        const { prisma, permissions, service } = setup()
        permissions.assertPermission.mockRejectedValue(new ForbiddenException())

        await expect(service.create('opp-1', dto, user)).rejects.toBeInstanceOf(ForbiddenException)
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('404s for unknown opportunities', async () => {
        const { service } = setup(null)
        await expect(service.create('nope', dto, user)).rejects.toBeInstanceOf(NotFoundException)
    })
})

describe('CrmOpportunityQuotationsService.list', () => {
    it("lists the opportunity's quotations from SD", async () => {
        const { quotations, service } = setup()
        await expect(service.list('opp-1')).resolves.toEqual([{ id: 'q-1' }])
        expect(quotations.listForOpportunity).toHaveBeenCalledWith('opp-1')
    })

    it('404s for unknown opportunities', async () => {
        const { quotations, service } = setup(null)
        await expect(service.list('nope')).rejects.toBeInstanceOf(NotFoundException)
        expect(quotations.listForOpportunity).not.toHaveBeenCalled()
    })
})
