import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import type { PermissionsService } from '../../permissions/permissions.service'
import type { PrismaService } from '../../prisma/prisma.service'
import type { CustomerService } from '../../sd/customer.service'
import type { CrmActivitiesService } from '../activities/activities.service'
import type { CrmOpportunitiesService } from '../opportunities/opportunities.service'
import { CrmLeadsController } from './leads.controller'
import { CrmLeadsService, LEAD_TRANSITIONS } from './leads.service'

const updatedAt = new Date('2026-10-01T00:00:00Z')

function lead(overrides: Record<string, unknown> = {}) {
    return {
        id: 'lead-1',
        customerId: null,
        name: 'Acme Prospect',
        status: 'NEW',
        updatedAt,
        customer: null,
        ...overrides,
    }
}

function mockPrisma(opts: { lead?: ReturnType<typeof lead> | null; customer?: boolean; user?: boolean } = {}) {
    const prisma = {
        sdCustomer: {
            findUnique: jest.fn().mockResolvedValue(opts.customer === false ? null : { id: 'cust-1' }),
        },
        user: {
            findUnique: jest.fn().mockResolvedValue(opts.user === false ? null : { id: 'user-2' }),
        },
        crmLead: {
            findUnique: jest.fn().mockResolvedValue(opts.lead === undefined ? lead() : opts.lead),
            create: jest.fn((args: { data: unknown }) => Promise.resolve({ id: 'lead-new', ...(args.data as object) })),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
        $transaction: jest.fn(),
    }
    // Array form for list queries; callback form (interactive transaction) for convert.
    prisma.$transaction.mockImplementation((arg: unknown) =>
        typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
    )
    return prisma
}

function mockDeps() {
    return {
        opportunities: {
            create: jest.fn().mockResolvedValue({ id: 'opp-1' }),
            findOne: jest.fn().mockResolvedValue({ id: 'opp-1', nextActivityStatus: 'UPCOMING' }),
        },
        activities: { reparentLeadActivities: jest.fn().mockResolvedValue(2) },
        customers: { create: jest.fn().mockResolvedValue({ id: 'cust-new' }) },
        permissions: { assertPermission: jest.fn().mockResolvedValue(undefined) },
    }
}

const service = (prisma: ReturnType<typeof mockPrisma>, deps = mockDeps()) =>
    new CrmLeadsService(
        prisma as unknown as PrismaService,
        deps.opportunities as unknown as CrmOpportunitiesService,
        deps.activities as unknown as CrmActivitiesService,
        deps.customers as unknown as CustomerService,
        deps.permissions as unknown as PermissionsService,
    )

const admin = { id: 'user-1', role: 'admin' }

describe('CrmLeadsService', () => {
    it('creates a lead without a customer and stamps the acting user', async () => {
        const prisma = mockPrisma()
        await service(prisma).create({ name: 'Walk-in' }, 'user-1')

        expect(prisma.sdCustomer.findUnique).not.toHaveBeenCalled()
        expect(prisma.crmLead.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    name: 'Walk-in',
                    source: 'OTHER',
                    customerId: null,
                    createdBy: 'user-1',
                    updatedBy: 'user-1',
                }),
            }),
        )
    })

    it('rejects a lead that references a missing SdCustomer and never creates one', async () => {
        const prisma = mockPrisma({ customer: false })
        await expect(
            service(prisma).create({ name: 'X', customerId: 'missing' }, 'user-1'),
        ).rejects.toBeInstanceOf(NotFoundException)
        expect(prisma.crmLead.create).not.toHaveBeenCalled()
    })

    it('rejects an unknown assigned user', async () => {
        const prisma = mockPrisma({ user: false })
        await expect(
            service(prisma).create({ name: 'X', assignedTo: 'ghost' }, 'user-1'),
        ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('returns 404 for a missing lead', async () => {
        const prisma = mockPrisma({ lead: null })
        await expect(service(prisma).findOne('nope')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('rejects invalid status transitions', async () => {
        const prisma = mockPrisma()
        await expect(
            service(prisma).update('lead-1', { status: 'CONVERTED' }, 'user-1'),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(prisma.crmLead.updateMany).not.toHaveBeenCalled()
    })

    it('refuses CONVERTED via PATCH and points to the convert endpoint', async () => {
        const prisma = mockPrisma({ lead: lead({ status: 'QUALIFIED', customerId: 'cust-1' }) })
        await expect(
            service(prisma).update('lead-1', { status: 'CONVERTED' }, 'user-1'),
        ).rejects.toThrow('Use POST /crm/leads/:id/convert')
        expect(prisma.crmLead.updateMany).not.toHaveBeenCalled()
    })

    it('treats converted leads as read-only', async () => {
        const prisma = mockPrisma({ lead: lead({ status: 'CONVERTED', customerId: 'cust-1' }) })
        await expect(
            service(prisma).update('lead-1', { name: 'Renamed' }, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('rejects empty updates', async () => {
        const prisma = mockPrisma()
        await expect(service(prisma).update('lead-1', {}, 'user-1')).rejects.toThrow(
            'No changes supplied',
        )
    })

    it('reports a concurrent modification as a conflict', async () => {
        const prisma = mockPrisma()
        prisma.crmLead.updateMany.mockResolvedValue({ count: 0 })
        await expect(
            service(prisma).update('lead-1', { name: 'Renamed' }, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('paginates lists with the SCM response shape', async () => {
        const prisma = mockPrisma()
        const result = await service(prisma).list({ page: 2, pageSize: 5, status: 'NEW' })
        expect(prisma.crmLead.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { status: 'NEW' }, skip: 5, take: 5 }),
        )
        expect(result).toEqual({ data: [], total: 0, page: 2, pageSize: 5 })
    })

    it('keeps CONVERTED terminal and out of reach of PATCH transitions', () => {
        expect(LEAD_TRANSITIONS.CONVERTED).toEqual([])
        for (const targets of Object.values(LEAD_TRANSITIONS)) {
            expect(targets).not.toContain('CONVERTED')
        }
    })
})

describe('CrmLeadsService.convert', () => {
    it('converts a linked lead in one transaction: lead, opportunity, activities', async () => {
        const prisma = mockPrisma({ lead: lead({ status: 'QUALIFIED', customerId: 'cust-1', assignedTo: 'user-2' }) })
        const deps = mockDeps()
        const result = await service(prisma, deps).convert(
            'lead-1',
            { opportunity: { amount: 900, stage: 'QUALIFICATION' } },
            admin,
        )

        expect(prisma.$transaction).toHaveBeenCalledTimes(1)
        expect(prisma.crmLead.updateMany).toHaveBeenCalledWith({
            where: { id: 'lead-1', status: 'QUALIFIED', updatedAt },
            data: { status: 'CONVERTED', customerId: 'cust-1', updatedBy: 'user-1' },
        })
        expect(deps.opportunities.create).toHaveBeenCalledWith(
            expect.objectContaining({
                customerId: 'cust-1',
                leadId: 'lead-1',
                name: 'Acme Prospect',
                amount: 900,
                stage: 'QUALIFICATION',
                assignedTo: 'user-2',
            }),
            'user-1',
            prisma,
        )
        expect(deps.activities.reparentLeadActivities).toHaveBeenCalledWith('lead-1', 'opp-1', prisma)
        expect(deps.customers.create).not.toHaveBeenCalled()
        expect(deps.permissions.assertPermission).not.toHaveBeenCalled()
        expect(result).toEqual(
            expect.objectContaining({
                customer: { id: 'cust-1', created: false },
                activitiesMoved: 2,
                opportunity: expect.objectContaining({ id: 'opp-1', nextActivityStatus: 'UPCOMING' }),
            }),
        )
    })

    it('links an existing SD customer supplied at conversion', async () => {
        const prisma = mockPrisma()
        const deps = mockDeps()
        await service(prisma, deps).convert('lead-1', { customerId: 'cust-1' }, admin)
        expect(prisma.sdCustomer.findUnique).toHaveBeenCalled()
        expect(prisma.crmLead.updateMany.mock.calls[0][0].data.customerId).toBe('cust-1')
    })

    it('rejects a missing SD customer and rolls back', async () => {
        const prisma = mockPrisma({ customer: false })
        const deps = mockDeps()
        await expect(
            service(prisma, deps).convert('lead-1', { customerId: 'missing' }, admin),
        ).rejects.toBeInstanceOf(NotFoundException)
        expect(prisma.crmLead.updateMany).not.toHaveBeenCalled()
        expect(deps.opportunities.create).not.toHaveBeenCalled()
    })

    it('creates the customer through SD inside the transaction, defaulting contact data from the lead', async () => {
        const prisma = mockPrisma({
            lead: lead({ email: 'buyer@acme.test', phone: '0917', status: 'CONTACTED' }),
        })
        const deps = mockDeps()
        const result = await service(prisma, deps).convert(
            'lead-1',
            { newCustomer: { companyName: 'Acme Corp' } },
            admin,
        )
        expect(deps.permissions.assertPermission).toHaveBeenCalledWith({ role: 'admin' }, 'sd', 'create')
        expect(deps.customers.create).toHaveBeenCalledWith(
            {
                companyName: 'Acme Corp',
                contactName: 'Acme Prospect',
                email: 'buyer@acme.test',
                phone: '0917',
                creditLimit: 0,
                createdBy: 'user-1',
            },
            prisma,
        )
        expect(prisma.crmLead.updateMany.mock.calls[0][0].data.customerId).toBe('cust-new')
        expect(result.customer).toEqual({ id: 'cust-new', created: true })
    })

    it('needs sd:create to create a customer', async () => {
        const prisma = mockPrisma({ lead: lead({ email: 'a@b.test' }) })
        const deps = mockDeps()
        deps.permissions.assertPermission.mockRejectedValue(new ForbiddenException())
        await expect(
            service(prisma, deps).convert('lead-1', { newCustomer: { companyName: 'X' } }, admin),
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('needs an email to create a customer', async () => {
        const prisma = mockPrisma()
        await expect(
            service(prisma).convert('lead-1', { newCustomer: { companyName: 'X' } }, admin),
        ).rejects.toThrow('An email is required to create the SD customer')
    })

    it.each(['LOST', 'UNQUALIFIED'])('blocks converting a %s lead', async (status) => {
        const prisma = mockPrisma({ lead: lead({ status, customerId: 'cust-1' }) })
        await expect(service(prisma).convert('lead-1', {}, admin)).rejects.toThrow(
            `A ${status} lead cannot be converted`,
        )
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('rejects converting twice', async () => {
        const prisma = mockPrisma({ lead: lead({ status: 'CONVERTED', customerId: 'cust-1' }) })
        await expect(service(prisma).convert('lead-1', {}, admin)).rejects.toThrow(
            'Lead is already converted',
        )
    })

    it.each([
        ['no customer at all', lead(), {}, 'Link an existing SD customer or provide newCustomer'],
        ['both customer options', lead(), { customerId: 'cust-1', newCustomer: { companyName: 'X' } }, 'either customerId or newCustomer'],
        ['new customer for a linked lead', lead({ customerId: 'cust-1' }), { newCustomer: { companyName: 'X' } }, 'already linked'],
        ['a different customer than the linked one', lead({ customerId: 'cust-1' }), { customerId: 'cust-2' }, 'different SD customer'],
    ])('rejects %s', async (_label, row, dto, message) => {
        const prisma = mockPrisma({ lead: row })
        await expect(service(prisma).convert('lead-1', dto, admin)).rejects.toThrow(message)
    })

    it('reports a concurrent change and creates nothing', async () => {
        const prisma = mockPrisma({ lead: lead({ customerId: 'cust-1' }) })
        prisma.crmLead.updateMany.mockResolvedValue({ count: 0 })
        const deps = mockDeps()
        await expect(service(prisma, deps).convert('lead-1', {}, admin)).rejects.toBeInstanceOf(
            ConflictException,
        )
        expect(deps.opportunities.create).not.toHaveBeenCalled()
        expect(deps.activities.reparentLeadActivities).not.toHaveBeenCalled()
    })

    it('fails the whole conversion when the opportunity stage gate fails', async () => {
        const prisma = mockPrisma({ lead: lead({ customerId: 'cust-1' }) })
        const deps = mockDeps()
        deps.opportunities.create.mockRejectedValue(
            new BadRequestException('Moving to Proposal requires an amount'),
        )
        await expect(
            service(prisma, deps).convert('lead-1', { opportunity: { stage: 'PROPOSAL' } }, admin),
        ).rejects.toThrow('Moving to Proposal requires an amount')
        expect(deps.activities.reparentLeadActivities).not.toHaveBeenCalled()
    })
})

describe('CrmLeadsController RBAC metadata', () => {
    const expected: Record<string, string> = {
        list: 'read',
        findOne: 'read',
        create: 'create',
        update: 'update',
        convert: 'create',
    }

    it.each(Object.entries(expected))('%s requires crm:%s', (handler, action) => {
        const fn = CrmLeadsController.prototype[handler as keyof CrmLeadsController]
        expect(Reflect.getMetadata(PERMISSION_KEY, fn)).toEqual({ module: 'crm', action })
    })
})
