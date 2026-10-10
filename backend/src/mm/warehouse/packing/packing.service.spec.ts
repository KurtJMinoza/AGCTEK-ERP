import type { PrismaService } from '../../../prisma/prisma.service'
import { PackingService } from './packing.service'
import type { CreatePackageDto } from './dto/create-package.dto'

function setup() {
    const prisma = {
        wmPackage: {
            count: jest.fn().mockResolvedValue(0),
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'pkg-1', ...args.data }),
            ),
        },
        wmPickingTask: {
            findUnique: jest.fn().mockResolvedValue(null),
        },
        mmInventoryReservation: {
            findUnique: jest.fn().mockResolvedValue(null),
        },
        sdSalesOrder: {
            findUnique: jest.fn().mockResolvedValue(null),
        },
    }
    const service = new PackingService(
        prisma as unknown as PrismaService,
        {} as never,
    )
    return { prisma, service }
}

const packageDto = (
    overrides: Partial<CreatePackageDto> = {},
): CreatePackageDto =>
    ({
        warehouseId: 'wh-1',
        items: [{ materialId: 'm-1', expectedQty: 1 }],
        ...overrides,
    }) as CreatePackageDto

describe('PackingService company inheritance', () => {
    it('inherits the Sales Order company from the picking task', async () => {
        const { prisma, service } = setup()
        prisma.wmPickingTask.findUnique.mockResolvedValue({
            companyId: 'company-1',
        })
        await service.create({ ...packageDto(), pickingTaskId: 'pick-1' })
        expect(prisma.wmPackage.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    pickingTaskId: 'pick-1',
                    companyId: 'company-1',
                }),
            }),
        )
    })

    it('falls back to the reservation company when no picking task is linked', async () => {
        const { prisma, service } = setup()
        prisma.mmInventoryReservation.findUnique.mockResolvedValue({
            companyId: 'company-2',
        })
        await service.create({ ...packageDto(), reservationId: 'res-1' })
        expect(prisma.wmPackage.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ companyId: 'company-2' }),
            }),
        )
    })

    it('falls back to the sales order company by order number', async () => {
        const { prisma, service } = setup()
        prisma.sdSalesOrder.findUnique.mockResolvedValue({
            companyId: 'company-3',
        })
        await service.create({ ...packageDto(), orderNumber: 'SO-000001' })
        expect(prisma.wmPackage.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ companyId: 'company-3' }),
            }),
        )
    })

    it('never invents a company when nothing is linked', async () => {
        const { prisma, service } = setup()
        await service.create(packageDto())
        expect(prisma.wmPackage.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ companyId: null }),
            }),
        )
    })
})