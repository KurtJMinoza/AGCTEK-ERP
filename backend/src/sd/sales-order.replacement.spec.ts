import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { SalesOrderService } from './sales-order.service'

const uniqueViolation = (field: string) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: [field] },
    })

const returnRequest = {
    id: 'rr-1',
    requestNumber: 'RET-1',
    replacementSalesOrderId: null,
    lines: [{ materialId: 'm-1', quantity: new Decimal(2), disposition: 'QUALITY_HOLD' }],
    salesOrder: {
        id: 'so-1',
        orderNumber: 'SO-1',
        companyId: 'comp-1',
        warehouseId: 'wh-1',
        customerId: 'cust-1',
        currency: 'PHP',
    },
}

function setup(existing: { id: string; status: string } | null = null) {
    const prisma = {
        sdReturnRequest: { findFirst: jest.fn().mockResolvedValue(returnRequest) },
        sdSalesOrder: {
            findUnique: jest.fn().mockResolvedValue(existing ? { id: existing.id } : null),
            findUniqueOrThrow: jest.fn(async ({ where }: { where: Record<string, string> }) =>
                where.idempotencyKey ? { id: 'so-winner' } : { status: existing?.status ?? 'DRAFT' },
            ),
            create: jest.fn().mockResolvedValue({ id: 'so-new' }),
        },
    }
    const service = new SalesOrderService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
    const confirm = jest.spyOn(service, 'confirm').mockResolvedValue({} as never)
    const startPicking = jest
        .spyOn(service, 'createReservationAndPickingForSalesOrder')
        .mockResolvedValue({} as never)
    const findOne = jest.spyOn(service, 'findOne').mockImplementation(async (id: string) => ({ id }) as never)
    jest.spyOn(service as never, 'nextOrderNumber').mockResolvedValue('SO-2' as never)
    return { prisma, service, confirm, startPicking, findOne }
}

const input = { returnRequestId: 'rr-1', companyId: 'comp-1', createdBy: 'u-1' }

describe('SalesOrderService.createReplacementForReturnRequest', () => {
    it('creates the $0 replacement, confirms it and starts picking', async () => {
        const { prisma, service, confirm, startPicking } = setup()

        await expect(service.createReplacementForReturnRequest(input)).resolves.toEqual({ id: 'so-new' })

        const data = prisma.sdSalesOrder.create.mock.calls[0][0].data
        expect(data).toMatchObject({ idempotencyKey: 'replacement:rr-1', totalAmount: 0, paymentMethod: 'STORE_CREDIT' })
        expect(confirm).toHaveBeenCalledWith('so-new')
        expect(startPicking).toHaveBeenCalledWith('so-new', { throwOnIneligible: true })
    })

    it('finishes an earlier replacement whose start failed (still DRAFT) when approval is retried', async () => {
        const { prisma, service, confirm, startPicking } = setup({ id: 'so-old', status: 'DRAFT' })

        await expect(service.createReplacementForReturnRequest(input)).resolves.toEqual({ id: 'so-old' })

        expect(prisma.sdSalesOrder.create).not.toHaveBeenCalled()
        expect(confirm).toHaveBeenCalledWith('so-old')
        expect(startPicking).toHaveBeenCalledWith('so-old', { throwOnIneligible: true })
    })

    it('re-runs the idempotent picking start for a confirmed replacement without confirming again', async () => {
        const { service, confirm, startPicking } = setup({ id: 'so-old', status: 'CONFIRMED' })

        await service.createReplacementForReturnRequest(input)

        expect(confirm).not.toHaveBeenCalled()
        expect(startPicking).toHaveBeenCalledWith('so-old', { throwOnIneligible: true })
    })

    it('returns the order a concurrent approval created first and leaves starting it to that caller', async () => {
        const { prisma, service, confirm, startPicking } = setup()
        prisma.sdSalesOrder.create.mockRejectedValue(uniqueViolation('idempotencyKey'))

        await expect(service.createReplacementForReturnRequest(input)).resolves.toEqual({ id: 'so-winner' })

        expect(confirm).not.toHaveBeenCalled()
        expect(startPicking).not.toHaveBeenCalled()
    })

    it('does not swallow other unique violations', async () => {
        const { prisma, service } = setup()
        prisma.sdSalesOrder.create.mockRejectedValue(uniqueViolation('orderNumber'))

        await expect(service.createReplacementForReturnRequest(input)).rejects.toMatchObject({ code: 'P2002' })
    })
})
