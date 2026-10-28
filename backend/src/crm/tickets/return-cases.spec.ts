import 'reflect-metadata'
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import { CrmReturnCaseListener } from './return-case.listener'
import { CrmReturnCasesService } from './return-cases.service'
import { CrmTicketsController } from './tickets.controller'

const sdReturn = (overrides: Record<string, unknown> = {}) => ({
    id: 'rr-1',
    requestNumber: 'RET-20261021-0001',
    companyId: 'comp-1',
    salesOrderId: 'so-1',
    customerId: 'shop-1',
    status: 'REQUESTED',
    preferredResolution: 'REPLACEMENT',
    refundStatus: 'NONE',
    reason: 'DAMAGED_ITEM',
    conditionNote: 'Box crushed',
    createdAt: new Date('2026-10-21T02:00:00Z'),
    approvedAt: null,
    rejectedAt: null,
    rejectReason: null,
    salesOrder: { orderNumber: 'SO-100', status: 'DELIVERED' },
    lines: [
        {
            id: 'rrl-1',
            quantity: new Decimal('2'),
            reason: 'DAMAGED_ITEM',
            disposition: 'QUALITY_HOLD',
            salesOrderLine: { productSkuSnapshot: 'LPG-11', productNameSnapshot: 'LPG 11kg', sku: 'LPG-11' },
        },
    ],
    refunds: [] as unknown[],
    mmCustomerReturn: null,
    replacementOrder: null,
    ...overrides,
})

const approvedReturn = () =>
    sdReturn({
        status: 'AWAITING_RETURN',
        approvedAt: new Date('2026-10-21T03:00:00Z'),
        mmCustomerReturn: { id: 'cr-1', returnNumber: 'CR-RET-20261021-0001', status: 'DRAFT' },
        replacementOrder: { id: 'so-2', orderNumber: 'SO-101', status: 'CONFIRMED' },
    })

const uniqueViolation = (field: string) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: [field] },
    })

function setup() {
    const prisma = {
        sdCustomer: { findFirst: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
        crmTicket: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 't-1', ...data })),
        },
        crmTicketComment: { create: jest.fn().mockResolvedValue({ id: 'c-1' }) },
        $queryRaw: jest.fn().mockResolvedValue([{ id: 't-1' }]),
        $transaction: jest.fn(),
    }
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
    const returnRequests = {
        findForCase: jest.fn().mockResolvedValue(sdReturn()),
        approve: jest.fn().mockResolvedValue({}),
        reject: jest.fn().mockResolvedValue({}),
    }
    const service = new CrmReturnCasesService(prisma as never, returnRequests as never)
    return { prisma, returnRequests, service }
}

const agent = { id: 'u-1', role: 'sales_agent' }
const linkedTicket = (overrides: Record<string, unknown> = {}) => ({
    id: 't-1',
    status: 'OPEN',
    sdReturnRequestId: 'rr-1',
    ...overrides,
})

describe('CrmReturnCasesService.openForReturn', () => {
    it('opens one RETURN ticket for the Customer Master customer, linked to the return and order', async () => {
        const { prisma, service } = setup()

        const { ticket, created } = await service.openForReturn('rr-1', null)

        expect(created).toBe(true)
        expect(prisma.sdCustomer.findFirst).toHaveBeenCalledWith({
            where: { OR: [{ id: 'shop-1' }, { retailClientId: 'shop-1' }] },
            select: { id: true },
        })
        const data = prisma.crmTicket.create.mock.calls[0][0].data
        expect(data).toMatchObject({
            customerId: 'cust-1',
            subject: 'Return RET-20261021-0001 · SO-100',
            category: 'RETURN',
            priority: 'MEDIUM',
            sdReturnRequestId: 'rr-1',
            salesOrderId: 'so-1',
            returnRequestNumber: 'RET-20261021-0001',
            createdBy: null,
        })
        expect(data.description).toBe(
            [
                'Customer requested: Replacement',
                'Reason: Damaged item',
                'Items (1): LPG-11 × 2',
                'Customer note: Box crushed',
            ].join('\n'),
        )
        expect(ticket).toMatchObject({ id: 't-1' })
    })

    it('notes that a refund waits on finance', async () => {
        const { prisma, returnRequests, service } = setup()
        returnRequests.findForCase.mockResolvedValue(sdReturn({ preferredResolution: 'REFUND' }))

        await service.openForReturn('rr-1', 'u-1')

        const data = prisma.crmTicket.create.mock.calls[0][0].data
        expect(data.description).toContain('Customer requested: Refund')
        expect(data.description).toContain('paid by finance')
        expect(data.createdBy).toBe('u-1')
    })

    it('returns the existing case without reading SD again (retries, duplicate events)', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue({ id: 't-9', sdReturnRequestId: 'rr-1' })

        await expect(service.openForReturn('rr-1', null)).resolves.toEqual({
            ticket: { id: 't-9', sdReturnRequestId: 'rr-1' },
            created: false,
        })
        expect(returnRequests.findForCase).not.toHaveBeenCalled()
        expect(prisma.crmTicket.create).not.toHaveBeenCalled()
    })

    it('returns the winner when a concurrent hand-off created the case first', async () => {
        const { prisma, service } = setup()
        prisma.crmTicket.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 't-first', sdReturnRequestId: 'rr-1' })
        prisma.crmTicket.create.mockRejectedValue(uniqueViolation('sdReturnRequestId'))

        await expect(service.openForReturn('rr-1', null)).resolves.toEqual({
            ticket: { id: 't-first', sdReturnRequestId: 'rr-1' },
            created: false,
        })
    })

    it('does not swallow other unique violations', async () => {
        const { prisma, service } = setup()
        prisma.crmTicket.create.mockRejectedValue(uniqueViolation('id'))

        await expect(service.openForReturn('rr-1', null)).rejects.toBeInstanceOf(
            Prisma.PrismaClientKnownRequestError,
        )
    })

    it('refuses when the shop account has no Customer Master record', async () => {
        const { prisma, service } = setup()
        prisma.sdCustomer.findFirst.mockResolvedValue(null)

        await expect(service.openForReturn('rr-1', null)).rejects.toThrow(/link it in Customer Master/)
        expect(prisma.crmTicket.create).not.toHaveBeenCalled()
    })

    it('surfaces an unknown return as 404 from SD', async () => {
        const { returnRequests, service } = setup()
        returnRequests.findForCase.mockRejectedValue(new NotFoundException('Return request not found'))

        await expect(service.openForReturn('missing', null)).rejects.toThrow(NotFoundException)
    })
})

describe('CrmReturnCasesService.returnForTicket', () => {
    it('reads the linked return live from SD as a compact view', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket())
        returnRequests.findForCase.mockResolvedValue(approvedReturn())

        await expect(service.returnForTicket('t-1')).resolves.toEqual({
            id: 'rr-1',
            requestNumber: 'RET-20261021-0001',
            status: 'AWAITING_RETURN',
            preferredResolution: 'REPLACEMENT',
            refundStatus: 'NONE',
            reason: 'DAMAGED_ITEM',
            conditionNote: 'Box crushed',
            createdAt: new Date('2026-10-21T02:00:00Z'),
            approvedAt: new Date('2026-10-21T03:00:00Z'),
            rejectedAt: null,
            rejectReason: null,
            salesOrder: { id: 'so-1', orderNumber: 'SO-100', status: 'DELIVERED' },
            lines: [
                {
                    id: 'rrl-1',
                    sku: 'LPG-11',
                    name: 'LPG 11kg',
                    quantity: '2',
                    reason: 'DAMAGED_ITEM',
                    disposition: 'QUALITY_HOLD',
                },
            ],
            mmCustomerReturn: { id: 'cr-1', returnNumber: 'CR-RET-20261021-0001', status: 'DRAFT' },
            replacementOrder: { id: 'so-2', orderNumber: 'SO-101', status: 'CONFIRMED' },
            refund: null,
            settlement: { settled: false, blocker: 'the returned goods have not been received yet' },
        })
        expect(returnRequests.findForCase).toHaveBeenCalledWith('rr-1')
    })

    it('shows the SD refund and credit memo and flags a refund awaiting finance', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket())
        returnRequests.findForCase.mockResolvedValue(
            sdReturn({
                status: 'RESTOCKED',
                preferredResolution: 'REFUND',
                refundStatus: 'APPROVED',
                refunds: [
                    {
                        refundNumber: 'RF-0001',
                        status: 'APPROVED',
                        amount: new Decimal('1250'),
                        currency: 'PHP',
                        refundMethod: 'BANK_TRANSFER',
                        isDemo: false,
                        approvedAt: new Date('2026-10-22T01:00:00Z'),
                        paidAt: null,
                        failReason: null,
                        creditMemo: { creditMemoNumber: 'CM-0001', amount: new Decimal('1250'), status: 'ISSUED' },
                    },
                ],
            }),
        )

        const view = await service.returnForTicket('t-1')

        expect(view.refund).toEqual(
            expect.objectContaining({
                refundNumber: 'RF-0001',
                status: 'APPROVED',
                amount: '1250',
                creditMemo: { creditMemoNumber: 'CM-0001', amount: '1250', status: 'ISSUED' },
            }),
        )
        expect(view.settlement).toEqual({
            settled: false,
            blocker: 'the refund is approved and waiting for payment by finance',
        })
    })

    it('404s for unknown tickets and 400s for tickets without a return', async () => {
        const { prisma, service } = setup()
        await expect(service.returnForTicket('t-x')).rejects.toThrow(NotFoundException)

        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket({ sdReturnRequestId: null }))
        await expect(service.returnForTicket('t-1')).rejects.toThrow(BadRequestException)
    })
})

describe('CrmReturnCasesService.approveReturn', () => {
    it('approves a replacement through SD as a case decision and records what SD started', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket())
        returnRequests.findForCase
            .mockResolvedValueOnce(sdReturn())
            .mockResolvedValueOnce(approvedReturn())

        const view = await service.approveReturn('t-1', agent)

        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
        expect(returnRequests.approve).toHaveBeenCalledWith('rr-1', 'comp-1', 'u-1', {
            preferredResolution: 'REPLACEMENT',
            fromCase: true,
        })
        expect(prisma.crmTicketComment.create).toHaveBeenCalledWith({
            data: {
                ticketId: 't-1',
                authorId: 'u-1',
                body: 'Return RET-20261021-0001 approved for replacement. MM customer return CR-RET-20261021-0001 is expecting the inbound package. Replacement order SO-101 (no charge) goes to picking.',
            },
        })
        expect(view).toMatchObject({
            status: 'AWAITING_RETURN',
            replacementOrder: { orderNumber: 'SO-101' },
            mmCustomerReturn: { returnNumber: 'CR-RET-20261021-0001' },
        })
    })

    it('approves a refund return: MM expects the package, the refund waits on SD and finance', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket())
        returnRequests.findForCase
            .mockResolvedValueOnce(sdReturn({ preferredResolution: 'REFUND' }))
            .mockResolvedValueOnce({ ...approvedReturn(), preferredResolution: 'REFUND', replacementOrder: null })

        await service.approveReturn('t-1', agent)

        expect(returnRequests.approve).toHaveBeenCalledWith('rr-1', 'comp-1', 'u-1', {
            preferredResolution: 'REFUND',
            fromCase: true,
        })
        expect(prisma.crmTicketComment.create.mock.calls[0][0].data.body).toBe(
            'Return RET-20261021-0001 approved for refund. MM customer return CR-RET-20261021-0001 is expecting the inbound package. The refund is recorded in SD after inspection and paid by finance.',
        )
    })

    it('returns the approved return on a repeat without a second comment', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket())
        returnRequests.findForCase.mockResolvedValue(approvedReturn())

        await expect(service.approveReturn('t-1', agent)).resolves.toMatchObject({ status: 'AWAITING_RETURN' })
        expect(returnRequests.approve).toHaveBeenCalledTimes(1)
        expect(prisma.crmTicketComment.create).not.toHaveBeenCalled()
    })

    it('treats a concurrent approval that finished first as success', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket())
        returnRequests.findForCase.mockResolvedValueOnce(sdReturn()).mockResolvedValue(approvedReturn())
        returnRequests.approve.mockRejectedValue(uniqueViolation('returnNumber'))

        await expect(service.approveReturn('t-1', agent)).resolves.toMatchObject({ status: 'AWAITING_RETURN' })
    })

    it('rethrows SD refusals when the return was not approved', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket())
        const refusal = new BadRequestException('Return lines need an MM material mapping before approval')
        returnRequests.approve.mockRejectedValue(refusal)

        await expect(service.approveReturn('t-1', agent)).rejects.toBe(refusal)
        expect(prisma.crmTicketComment.create).not.toHaveBeenCalled()
    })

    it.each(['CLOSED', 'CANCELLED'])('refuses %s tickets', async (status) => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket({ status }))

        await expect(service.approveReturn('t-1', agent)).rejects.toThrow(ConflictException)
        expect(returnRequests.approve).not.toHaveBeenCalled()
    })

    it('refuses tickets without a linked return', async () => {
        const { prisma, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket({ sdReturnRequestId: null }))

        await expect(service.approveReturn('t-1', agent)).rejects.toThrow(BadRequestException)
    })
})

describe('CrmReturnCasesService.rejectReturn', () => {
    it('rejects through SD as a case decision and notes the reason on the ticket', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket())
        returnRequests.findForCase
            .mockResolvedValueOnce(sdReturn())
            .mockResolvedValueOnce(sdReturn({ status: 'REJECTED', rejectReason: 'Outside the return window' }))

        const view = await service.rejectReturn('t-1', '  Outside the return window ', agent)

        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
        expect(returnRequests.reject).toHaveBeenCalledWith('rr-1', 'comp-1', {
            reason: 'Outside the return window',
            performedBy: 'u-1',
            fromCase: true,
        })
        expect(prisma.crmTicketComment.create).toHaveBeenCalledWith({
            data: { ticketId: 't-1', authorId: 'u-1', body: 'Return RET-20261021-0001 rejected: Outside the return window' },
        })
        expect(view).toMatchObject({ status: 'REJECTED', rejectReason: 'Outside the return window' })
    })

    it('requires a reason before touching the ticket', async () => {
        const { prisma, service } = setup()

        await expect(service.rejectReturn('t-1', '   ', agent)).rejects.toThrow(BadRequestException)
        expect(prisma.crmTicket.findUnique).not.toHaveBeenCalled()
    })

    it('returns an already rejected return without rejecting or commenting again', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket())
        returnRequests.findForCase.mockResolvedValue(sdReturn({ status: 'REJECTED', rejectReason: 'x' }))

        await expect(service.rejectReturn('t-1', 'again', agent)).resolves.toMatchObject({ status: 'REJECTED' })
        expect(returnRequests.reject).not.toHaveBeenCalled()
        expect(prisma.crmTicketComment.create).not.toHaveBeenCalled()
    })

    it('refuses to reject an approved return', async () => {
        const { prisma, returnRequests, service } = setup()
        prisma.crmTicket.findUnique.mockResolvedValue(linkedTicket())
        returnRequests.findForCase.mockResolvedValue(approvedReturn())

        await expect(service.rejectReturn('t-1', 'late', agent)).rejects.toThrow(/Only a requested return can be rejected/)
        expect(returnRequests.reject).not.toHaveBeenCalled()
    })
})

describe('CrmReturnCaseListener', () => {
    it('opens the case for a storefront return as the system (no actor)', async () => {
        const cases = { openForReturn: jest.fn().mockResolvedValue({ created: true }) }
        await new CrmReturnCaseListener(cases as never).onReturnRequested({
            payload: {
                returnRequestId: 'rr-1',
                requestNumber: 'RET-20261021-0001',
                salesOrderId: 'so-1',
                orderNumber: 'SO-100',
                preferredResolution: 'REPLACEMENT',
                idempotencyKey: 'rr-1',
            },
        })
        expect(cases.openForReturn).toHaveBeenCalledWith('rr-1', null)
    })
})

describe('Ticket return-case routes RBAC', () => {
    const meta = (handler: keyof CrmTicketsController) =>
        Reflect.getMetadata(PERMISSION_KEY, CrmTicketsController.prototype[handler])

    it('opens cases with crm.tickets create, reads with read, approves with update', () => {
        expect(meta('openForReturn')).toEqual({ resource: 'crm.tickets', action: 'create' })
        expect(meta('linkedReturn')).toEqual({ resource: 'crm.tickets', action: 'read' })
        expect(meta('approveReturn')).toEqual({ resource: 'crm.tickets', action: 'update' })
        expect(meta('rejectReturn')).toEqual({ resource: 'crm.tickets', action: 'update' })
    })
})
