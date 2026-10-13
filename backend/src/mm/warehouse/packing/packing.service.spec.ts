import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../../../prisma/prisma.service'
import { PackingService } from './packing.service'
import type { CreatePackageDto } from './dto/create-package.dto'

function setup() {
    const prisma: any = {
        $transaction: jest.fn(async (operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
        wmPackage: {
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
        retailClientAddress: {
            findMany: jest.fn().mockResolvedValue([]),
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
            salesOrderId: null,
        })
        await service.create({ ...packageDto(), pickingTaskId: 'pick-1' })
        expect(prisma.wmPackage.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    pickingTaskId: 'pick-1',
                    companyId: 'company-1',
                    packageRole: 'MANUAL',
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

    it('links a manual package to the matching sales order by number', async () => {
        const { prisma, service } = setup()
        prisma.sdSalesOrder.findUnique.mockResolvedValue({
            id: 'so-1',
            companyId: 'company-3',
            orderNumber: 'SO-000001',
        })
        await service.create({ ...packageDto(), orderNumber: 'SO-000001' })
        expect(prisma.wmPackage.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    companyId: 'company-3',
                    salesOrderId: 'so-1',
                    orderNumber: 'SO-000001',
                }),
            }),
        )
    })
})

function autoPackingSetup(
    tasks: Array<{
        id: string
        materialId: string
        pickedQty: number
        batchId?: string | null
        serialId?: string | null
    }>,
) {
    const sessions: any[] = []
    const packages: any[] = []
    const packageItems: any[] = []
    const order = {
        id: 'so-1',
        orderNumber: 'SO-000008',
        companyId: 'company-1',
        customerName: 'Customer One',
    }
    const pickingTasks = tasks.map((task, index) => ({
        ...task,
        warehouseId: 'wh-1',
        companyId: 'company-1',
        warehouseTaskId: `task-${index + 1}`,
        salesOrderId: order.id,
        reservationId: 'reservation-1',
        sourceDocument: 'RSV-1',
        taskNumber: `PK-${index + 1}`,
        pickedQty: new Decimal(task.pickedQty),
        batchId: task.batchId ?? null,
        serialId: task.serialId ?? null,
        status: 'COMPLETED',
    }))

    const detail = (pkg: any) => ({
        ...pkg,
        items: packageItems
            .filter((item) => item.packageId === pkg.id)
            .map((item) => ({ ...item, material: null })),
        pickingTask: null,
        reservation: null,
        packingSession:
            sessions.find((session) => session.id === pkg.packingSessionId) ??
            null,
        salesOrder: order,
        shipment: null,
    })
    const prisma: any = {
        $transaction: jest.fn(async (operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
        wmPickingTask: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(
                    pickingTasks.find((task) => task.id === where.id) ?? null,
                ),
            ),
            findMany: jest.fn(() => Promise.resolve(pickingTasks)),
        },
        wmPackingSession: {
            findFirst: jest.fn(({ where }: any) => {
                if (where.salesOrderId) {
                    return Promise.resolve(
                        sessions.find(
                            (session) =>
                                session.salesOrderId === where.salesOrderId &&
                                session.warehouseId === where.warehouseId &&
                                session.status === where.status,
                        ) ?? null,
                    )
                }
                if (where.sessionNumber)
                    return Promise.resolve(sessions.at(-1) ?? null)
                return Promise.resolve(null)
            }),
            create: jest.fn(({ data }: any) => {
                const session = {
                    id: `session-${sessions.length + 1}`,
                    ...data,
                }
                sessions.push(session)
                return Promise.resolve(session)
            }),
        },
        wmPackage: {
            findMany: jest.fn(() => Promise.resolve(packages)),
            findFirst: jest.fn(({ where }: any) =>
                Promise.resolve(
                    packages.find(
                        (pkg) =>
                            pkg.packingSessionId === where.packingSessionId &&
                            pkg.packageRole === where.packageRole &&
                            pkg.status !== 'CANCELLED',
                    ) ?? null,
                ),
            ),
            create: jest.fn(({ data }: any) => {
                const pkg = { id: `package-${packages.length + 1}`, ...data }
                packages.push(pkg)
                for (const item of data.items?.create ?? []) {
                    packageItems.push({
                        id: `item-${packageItems.length + 1}`,
                        packageId: pkg.id,
                        scannedQty: new Decimal(0),
                        ...item,
                    })
                }
                return Promise.resolve(
                    data.select ? { id: pkg.id } : detail(pkg),
                )
            }),
            findUnique: jest.fn(({ where }: any) => {
                const pkg = packages.find(
                    (candidate) => candidate.id === where.id,
                )
                return Promise.resolve(pkg ? detail(pkg) : null)
            }),
            update: jest.fn(({ where, data }: any) => {
                const pkg = packages.find(
                    (candidate) => candidate.id === where.id,
                )
                Object.assign(pkg, data)
                return Promise.resolve(detail(pkg))
            }),
        },
        wmPackageItem: {
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    packageItems.filter(
                        (item) => item.packageId === where.packageId,
                    ),
                ),
            ),
            create: jest.fn(({ data }: any) => {
                const item = {
                    id: `item-${packageItems.length + 1}`,
                    scannedQty: new Decimal(0),
                    ...data,
                }
                packageItems.push(item)
                return Promise.resolve(item)
            }),
            update: jest.fn(({ where, data }: any) => {
                const item = packageItems.find(
                    (candidate) => candidate.id === where.id,
                )
                Object.assign(item, data)
                return Promise.resolve(item)
            }),
        },
        sdSalesOrder: {
            findUnique: jest.fn(() => Promise.resolve(order)),
        },
    }
    const service = new PackingService(prisma as PrismaService, {} as never)
    return { prisma, service, sessions, packages, packageItems }
}

describe('PackingService default order package', () => {
    it('creates one package with a quantity-ten line and returns it on retry', async () => {
        const { service, sessions, packages, packageItems } = autoPackingSetup([
            { id: 'pick-1', materialId: 'material-1', pickedQty: 10 },
        ])

        const first = await service.createFromPickingTask('pick-1')
        const second = await service.createFromPickingTask('pick-1')

        expect(sessions).toHaveLength(1)
        expect(packages).toHaveLength(1)
        expect(packages[0]).toMatchObject({
            salesOrderId: 'so-1',
            packageRole: 'DEFAULT',
            orderNumber: 'SO-000008',
        })
        expect(packageItems).toHaveLength(1)
        expect(Number(packageItems[0].expectedQty)).toBe(10)
        expect(first.totalItemQuantity).toBe(10)
        expect(second.id).toBe(first.id)
        expect(second.totalItemQuantity).toBe(10)
    })

    it('keeps serial-level traceability while still producing one default package', async () => {
        const { service, packages, packageItems } = autoPackingSetup([
            {
                id: 'pick-1',
                materialId: 'material-1',
                pickedQty: 1,
                serialId: 'serial-1',
            },
            {
                id: 'pick-2',
                materialId: 'material-1',
                pickedQty: 1,
                serialId: 'serial-2',
            },
        ])

        const pkg = await service.createFromPickingTask('pick-1')

        expect(packages).toHaveLength(1)
        expect(packageItems).toHaveLength(2)
        expect(pkg.totalItemQuantity).toBe(2)
    })

    it('returns shipment data and quantity total in the package list', async () => {
        const { prisma, service } = setup()
        prisma.wmPackage.findMany.mockResolvedValue([
            {
                id: 'pkg-1',
                items: [
                    {
                        expectedQty: new Decimal(10),
                        scannedQty: new Decimal(0),
                    },
                ],
                shipment: {
                    id: 'shipment-1',
                    reference: 'SHP-000001',
                    status: 'READY',
                },
            },
        ])
        prisma.wmPackage.count = jest.fn().mockResolvedValue(1)

        const result = await service.findAll({})

        expect(result.data[0]).toMatchObject({
            totalItemQuantity: 10,
            shipment: { reference: 'SHP-000001' },
        })
    })

    it('requires SCM release before a package can be marked dispatched', async () => {
        const { service } = setup()
        jest.spyOn(service, 'findOne').mockResolvedValue({
            id: 'pkg-1',
            status: 'SEALED',
            items: [
                { expectedQty: new Decimal(1), scannedQty: new Decimal(1) },
            ],
            shipment: null,
        } as any)

        await expect(service.dispatch('pkg-1')).rejects.toThrow(
            'READY_FOR_DISPATCH with an SCM shipment',
        )
    })
})

describe('PackingService delivery pin prefill', () => {
    const REGISTERED_ADDRESS = {
        id: 'addr-1',
        addressLine: 'A. Iñigo Street',
        barangayOrNeighborhood: 'Poblacion District',
        cityOrMunicipality: 'Davao City',
        provinceOrState: 'Davao Region',
        postalCode: '8000',
        country: 'Philippines',
        isDefault: true,
        latitude: 7.083861,
        longitude: 125.612704,
    }

    function prefillSetup() {
        const { prisma } = setup()
        const service = new PackingService(
            prisma as unknown as PrismaService,
            {} as never,
        )
        return { prisma, service }
    }

    it('suggests the registered-address pin in findOne detail', async () => {
        const { prisma, service } = prefillSetup()
        prisma.wmPackage.findUnique = jest.fn().mockResolvedValue({
            id: 'pkg-1',
            shipToLat: null,
            shipToLng: null,
            items: [],
            salesOrder: { customerId: 'client-1' },
            pickingTask: null,
        })
        prisma.retailClientAddress.findMany = jest
            .fn()
            .mockResolvedValue([REGISTERED_ADDRESS])

        const result = await service.findOne('pkg-1')

        expect(prisma.retailClientAddress.findMany).toHaveBeenCalledWith({
            where: { clientId: 'client-1' },
            select: {
                id: true,
                addressLine: true,
                barangayOrNeighborhood: true,
                cityOrMunicipality: true,
                provinceOrState: true,
                postalCode: true,
                country: true,
                isDefault: true,
                latitude: true,
                longitude: true,
            },
        })
        expect(result.suggestedShipTo).toEqual({
            lat: 7.083861,
            lng: 125.612704,
        })
    })

    it('prefers the registered address that matches the order ship-to', async () => {
        const { prisma, service } = prefillSetup()
        prisma.wmPackage.findUnique = jest.fn().mockResolvedValue({
            id: 'pkg-1',
            shipToLat: null,
            shipToLng: null,
            items: [],
            salesOrder: {
                customerId: 'client-1',
                shipToCity: 'Manila',
                shipToRegion: 'NCR',
                shipToPostalCode: '1000',
            },
            pickingTask: null,
        })
        prisma.retailClientAddress.findMany = jest.fn().mockResolvedValue([
            {
                ...REGISTERED_ADDRESS,
                cityOrMunicipality: 'Manila',
                provinceOrState: 'NCR',
                postalCode: '1000',
                isDefault: false,
                latitude: 14.5995,
                longitude: 120.9842,
            },
            REGISTERED_ADDRESS,
        ])

        const result = await service.findOne('pkg-1')

        expect(result.suggestedShipTo).toEqual({
            lat: 14.5995,
            lng: 120.9842,
        })
    })

    it('returns no suggestion when the customer has no registered address', async () => {
        const { prisma, service } = prefillSetup()
        prisma.wmPackage.findUnique = jest.fn().mockResolvedValue({
            id: 'pkg-1',
            shipToLat: null,
            shipToLng: null,
            items: [],
            salesOrder: { customerId: 'client-1' },
            pickingTask: null,
        })
        prisma.retailClientAddress.findMany = jest.fn().mockResolvedValue([])

        const result = await service.findOne('pkg-1')

        expect(result.suggestedShipTo).toBeNull()
    })

    it('skips the suggestion when the package already carries a pin', async () => {
        const { prisma, service } = prefillSetup()
        prisma.wmPackage.findUnique = jest.fn().mockResolvedValue({
            id: 'pkg-1',
            shipToLat: 7.0,
            shipToLng: 125.0,
            items: [],
            salesOrder: { customerId: 'client-1' },
            pickingTask: null,
        })

        const result = await service.findOne('pkg-1')

        expect(prisma.retailClientAddress.findMany).not.toHaveBeenCalled()
        expect(result.suggestedShipTo).toBeNull()
    })

    it('persists the customer pin on the package before SCM release', async () => {
        const { prisma, service } = prefillSetup()
        prisma.wmPackage.update = jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'pkg-1', ...args.data }),
            )
        prisma.retailClientAddress.findMany = jest
            .fn()
            .mockResolvedValue([REGISTERED_ADDRESS])
        // findOne → verify status → pin prefill path → re-read → release
        const states = [
            {
                id: 'pkg-1',
                status: 'SEALED',
                shipToLat: null,
                shipToLng: null,
                shipToAddress: 'A. Iñigo Street, Davao City',
                items: [
                    { scannedQty: new Decimal(1), expectedQty: new Decimal(1) },
                ],
                salesOrder: { customerId: 'client-1' },
                pickingTask: null,
                suggestedShipTo: { lat: 7.083861, lng: 125.612704 },
            },
            {
                id: 'pkg-1',
                status: 'SEALED',
                shipToLat: null,
                shipToLng: null,
                shipToAddress: 'A. Iñigo Street, Davao City',
                items: [
                    { scannedQty: new Decimal(1), expectedQty: new Decimal(1) },
                ],
                salesOrder: { customerId: 'client-1' },
                pickingTask: null,
                suggestedShipTo: { lat: 7.083861, lng: 125.612704 },
            },
            {
                id: 'pkg-1',
                status: 'SEALED',
                shipToLat: 7.083861,
                shipToLng: 125.612704,
                shipToAddress: 'A. Iñigo Street, Davao City',
                items: [
                    { scannedQty: new Decimal(1), expectedQty: new Decimal(1) },
                ],
                salesOrder: { customerId: 'client-1' },
                pickingTask: null,
                suggestedShipTo: null,
            },
        ]
        let reads = 0
        const findOne = jest.spyOn(service, 'findOne').mockImplementation(() => {
            const next = states[Math.min(reads, states.length - 1)]
            reads += 1
            return Promise.resolve(next as any)
        })

        await service.markReadyForDispatch('pkg-1')

        expect(findOne).toHaveBeenCalled()
        expect(prisma.wmPackage.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    shipToLat: 7.083861,
                    shipToLng: 125.612704,
                }),
            }),
        )
    })
})
