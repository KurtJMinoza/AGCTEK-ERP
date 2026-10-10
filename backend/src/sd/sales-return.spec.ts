import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PERMISSION_KEY } from '../permissions/permission.guard'
import { SalesReturnController } from './sales-return.controller'
import {
    RETURNABLE_ORDER_STATUSES,
    SALES_RETURN_STATUS,
    SalesReturnService,
} from './sales-return.service'

const ORDER = {
    id: 'so-1',
    orderNumber: 'SO-100',
    status: 'CONFIRMED',
    companyId: 'comp-1',
    customerId: 'cust-1',
    lines: [
        {
            id: 'ol-1',
            lineNumber: 1,
            materialId: 'm-1',
            sku: 'SKU-A',
            description: 'Thing',
            quantity: new Decimal('5'),
            salesUomId: 'uom-1',
        },
        {
            id: 'ol-2',
            lineNumber: 2,
            materialId: 'm-2',
            sku: 'SKU-B',
            description: 'Other',
            quantity: new Decimal('3'),
            salesUomId: 'uom-1',
        },
    ],
}

const actor = { id: 'user-1', role: 'sales' }

function setup(overrides: { orderStatus?: string | null } = {}) {
    const returns: Array<Record<string, any>> = []
    const audits: Array<Record<string, unknown>> = []
    const order = { ...ORDER, status: overrides.orderStatus ?? 'CONFIRMED' }

    const prisma = {
        sdSalesOrder: {
            findUnique: async () =>
                overrides.orderStatus === null ? null : order,
        },
        sdSalesOrderLine: {
            findUnique: async ({ where }: { where: { id: string } }) =>
                order.lines.find((l) => l.id === where.id) ?? null,
        },
        sdSalesReturn: {
            count: async () => returns.length,
            findUnique: async ({
                where,
            }: {
                where: { id?: string; damageReportId?: string }
            }) => {
                if (where.id)
                    return returns.find((r) => r.id === where.id) ?? null
                if (where.damageReportId)
                    return (
                        returns.find(
                            (r) => r.damageReportId === where.damageReportId,
                        ) ?? null
                    )
                return null
            },
            findMany: async () => [...returns],
            create: async ({
                data,
                include,
            }: {
                data: Record<string, any>
                include?: { lines: unknown }
            }) => {
                const lines = (data.lines?.create ?? []).map(
                    (l: Record<string, unknown>, i: number) => ({
                        id: `srl-${i + 1}`,
                        ...l,
                    }),
                )
                const row = {
                    id: `sr-${returns.length + 1}`,
                    returnNumber: data.returnNumber,
                    companyId: data.companyId,
                    salesOrderId: data.salesOrderId,
                    customerId: data.customerId,
                    damageReportId: data.damageReportId ?? null,
                    reason: data.reason ?? null,
                    notes: data.notes ?? null,
                    status: data.status,
                    requestedBy: data.requestedBy,
                    requestedAt: data.requestedAt,
                    createdBy: data.createdBy,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lines,
                    audits: [],
                    ...(include ? { salesOrder: order } : {}),
                }
                const nestedAudit = data.audits?.create as
                    | Record<string, unknown>
                    | undefined
                if (nestedAudit)
                    audits.push({ ...nestedAudit, salesReturnId: row.id })
                returns.push(row)
                return row
            },
            updateMany: async ({
                where,
                data,
            }: {
                where: { id: string; status?: string | { in: string[] } }
                data: Record<string, any>
            }) => {
                const statusMatch = (status: string) =>
                    where.status === undefined ||
                    (Array.isArray(
                        (where.status as { in: string[] } | undefined)?.in,
                    )
                        ? (where.status as { in: string[] }).in.includes(status)
                        : status === where.status)
                const row = returns.find(
                    (r) => r.id === where.id && statusMatch(r.status),
                )
                if (!row) return { count: 0 }
                Object.assign(row, data)
                return { count: 1 }
            },
        },
        sdSalesReturnLine: {
            aggregate: async ({
                where,
            }: {
                where: {
                    salesOrderLineId: string
                    salesReturn: { status: { notIn: string[] } }
                }
            }) => {
                const excluded = where.salesReturn.status.notIn
                const sum = returns
                    .filter((r) => !excluded.includes(r.status))
                    .flatMap((r) => r.lines)
                    .filter(
                        (l) => l.salesOrderLineId === where.salesOrderLineId,
                    )
                    .reduce((acc, l) => acc + Number(l.quantity), 0)
                return { _sum: { quantity: new Decimal(sum) } }
            },
        },
        sdSalesReturnAudit: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                audits.push(data)
                return data
            },
        },
        $queryRaw: async (
            _strings: TemplateStringsArray,
            ...values: unknown[]
        ) => {
            const line = order.lines.find((l) => l.id === values[0])
            return line ? [{ id: line.id, quantity: line.quantity }] : []
        },
        $transaction: async (arg: unknown) => {
            if (Array.isArray(arg)) return Promise.all(arg)
            return (arg as (tx: unknown) => Promise<unknown>)(prisma)
        },
    }
    const permissions = {
        assertPermission: jest.fn().mockResolvedValue(undefined),
    }
    const customerReturns = {
        createFromSalesReturn: jest.fn(),
    }
    const service = new SalesReturnService(
        prisma as never,
        permissions as never,
        customerReturns as never,
    )
    return { service, permissions, customerReturns, returns, audits }
}

const dto = {
    salesOrderId: 'so-1',
    companyId: 'comp-1',
    lines: [{ salesOrderLineId: 'ol-1', materialId: 'm-1', quantity: 2 }],
}

describe('SalesReturnService.create', () => {
    it('creates a REQUESTED return with lines, audit and a generated number', async () => {
        const { service, returns, audits } = setup()

        const created = await service.create(dto, actor)

        expect(created).toMatchObject({
            returnNumber: 'SR-000001',
            companyId: 'comp-1',
            salesOrderId: 'so-1',
            customerId: 'cust-1',
            status: SALES_RETURN_STATUS.REQUESTED,
            requestedBy: 'user-1',
        })
        expect(created.status).not.toBe(SALES_RETURN_STATUS.AUTHORIZED)
        expect(created.lines).toHaveLength(1)
        expect(created.lines[0]).toMatchObject({
            lineNumber: 1,
            salesOrderLineId: 'ol-1',
            materialId: 'm-1',
        })
        expect(String(created.lines[0].quantity)).toBe('2')
        expect(audits[0]).toEqual(
            expect.objectContaining({
                action: 'CREATED',
                performedBy: 'user-1',
            }),
        )
        expect(returns).toHaveLength(1)
    })

    it('rejects an order that was not confirmed or completed', async () => {
        const { service } = setup({ orderStatus: 'DRAFT' })
        await expect(service.create(dto, actor)).rejects.toBeInstanceOf(
            ConflictException,
        )
        await expect(
            setup({ orderStatus: 'CANCELLED' }).service.create(dto, actor),
        ).rejects.toThrow(/only CONFIRMED or COMPLETED/)
    })

    it('404s for a missing order', async () => {
        const { service } = setup({ orderStatus: null })
        await expect(service.create(dto, actor)).rejects.toBeInstanceOf(
            NotFoundException,
        )
    })

    it('rejects a line that does not belong to the order', async () => {
        const { service } = setup()
        await expect(
            service.create(
                {
                    ...dto,
                    lines: [{ salesOrderLineId: 'ol-other', quantity: 1 }],
                },
                actor,
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects a material mismatch instead of guessing the line', async () => {
        const { service } = setup()
        await expect(
            service.create(
                {
                    ...dto,
                    lines: [
                        {
                            salesOrderLineId: 'ol-1',
                            materialId: 'm-999',
                            quantity: 1,
                        },
                    ],
                },
                actor,
            ),
        ).rejects.toThrow(/is material m-1, not m-999/)
    })

    it('rejects an over-return against the original order quantity', async () => {
        const { service } = setup()
        await expect(
            service.create(
                { ...dto, lines: [{ salesOrderLineId: 'ol-1', quantity: 6 }] },
                actor,
            ),
        ).rejects.toThrow(/exceeds the returnable quantity/)
    })

    it('subtracts prior valid returns from the returnable quantity', async () => {
        const { service, returns } = setup()
        await service.create(
            { ...dto, lines: [{ salesOrderLineId: 'ol-1', quantity: 4 }] },
            actor,
        )
        expect(String(returns[0].lines[0].quantity)).toBe('4')

        // Only 1 remains returnable; 2 would over-return.
        await expect(
            service.create(
                { ...dto, lines: [{ salesOrderLineId: 'ol-1', quantity: 2 }] },
                actor,
            ),
        ).rejects.toThrow(/exceeds the returnable quantity/)
    })

    it('ignores cancelled/rejected prior returns when computing returnable quantity', async () => {
        const { service, returns } = setup()
        const first = await service.create(dto, actor)
        await service.cancel(first.id, { reason: 'Mistake' }, actor)
        returns[0].status = SALES_RETURN_STATUS.CANCELLED

        const second = await service.create(
            { ...dto, lines: [{ salesOrderLineId: 'ol-1', quantity: 4 }] },
            actor,
        )
        expect(second.status).toBe(SALES_RETURN_STATUS.REQUESTED)
    })

    it('derives companyId from the order and rejects a mismatched one', async () => {
        const { service } = setup()
        const noCompany = await service.create(
            { ...dto, companyId: undefined },
            actor,
        )
        expect(noCompany.companyId).toBe('comp-1')

        await expect(
            service.create({ ...dto, companyId: 'comp-other' }, actor),
        ).rejects.toThrow(/companyId does not match/)
    })

    it('requires the sd.sales-returns:create permission (enforced at the service for the handoff)', async () => {
        const { service, permissions } = setup()
        permissions.assertPermission.mockRejectedValue(new ForbiddenException())
        await expect(service.create(dto, actor)).rejects.toBeInstanceOf(
            ForbiddenException,
        )
        expect(permissions.assertPermission).toHaveBeenCalledWith(
            { role: 'sales' },
            'sd.sales-returns',
            'create',
        )
    })
})

describe('SalesReturnService lifecycle', () => {
    it('authorize moves REQUESTED → AUTHORIZED with an audit row (create never authorizes)', async () => {
        const { service, audits } = setup()
        const created = await service.create(dto, actor)

        const authorized = await service.authorize(created.id, actor)

        expect(authorized.status).toBe(SALES_RETURN_STATUS.AUTHORIZED)
        expect(audits.map((a) => a.action)).toEqual(['CREATED', 'AUTHORIZED'])
        expect(audits[1]).toEqual(
            expect.objectContaining({
                performedBy: 'user-1',
                details: { from: 'REQUESTED' },
            }),
        )
    })

    it('reject moves REQUESTED → REJECTED', async () => {
        const { service } = setup()
        const created = await service.create(dto, actor)
        await expect(
            service.reject(created.id, { reason: 'No damage evidence' }, actor),
        ).resolves.toMatchObject({
            status: SALES_RETURN_STATUS.REJECTED,
            rejectReason: 'No damage evidence',
        })
    })

    it('cancel works from REQUESTED or AUTHORIZED', async () => {
        const { service } = setup()
        const created = await service.create(dto, actor)
        await expect(
            service.cancel(
                created.id,
                { reason: 'Customer changed mind' },
                actor,
            ),
        ).resolves.toMatchObject({
            status: SALES_RETURN_STATUS.CANCELLED,
            cancelReason: 'Customer changed mind',
        })

        const authorized = await service.authorize(
            (await service.create(dto, actor)).id,
            actor,
        )
        await expect(
            service.cancel(authorized.id, {}, actor),
        ).resolves.toMatchObject({
            status: SALES_RETURN_STATUS.CANCELLED,
        })
    })

    it('rejects illegal transitions', async () => {
        const { service } = setup()
        const created = await service.create(dto, actor)
        await service.authorize(created.id, actor)
        await expect(service.authorize(created.id, actor)).rejects.toThrow(
            /already AUTHORIZED/,
        )
        await expect(service.reject(created.id, {}, actor)).rejects.toThrow(
            /cannot move from AUTHORIZED to REJECTED/,
        )

        const rejected = await service.create(dto, actor)
        await service.reject(rejected.id, {}, actor)
        await expect(service.cancel(rejected.id, {}, actor)).rejects.toThrow(
            /cannot move from REJECTED to CANCELLED/,
        )
    })

    it('404s transitions for unknown returns', async () => {
        const { service } = setup()
        await expect(service.authorize('nope', actor)).rejects.toBeInstanceOf(
            NotFoundException,
        )
        await expect(service.findOne('nope')).rejects.toBeInstanceOf(
            NotFoundException,
        )
    })
})

describe('SalesReturnService.initiateMmIntake', () => {
    async function authorized(
        service: SalesReturnService,
    ): Promise<Record<string, any>> {
        const created = await service.create(dto, actor)
        return service.authorize(created.id, actor)
    }

    it('opens an MM intake for an AUTHORIZED return, passing references and lines', async () => {
        const { service, customerReturns } = setup()
        const salesReturn = await authorized(service)
        customerReturns.createFromSalesReturn.mockResolvedValue({
            created: true,
            customerReturn: { id: 'cr-1', returnNumber: 'CRT-000001' },
        })

        const result = await service.initiateMmIntake(
            salesReturn.id,
            { warehouseId: 'wh-1' },
            actor,
        )

        expect(result).toMatchObject({
            created: true,
            salesReturnNumber: salesReturn.returnNumber,
            customerReturn: { id: 'cr-1' },
        })
        expect(customerReturns.createFromSalesReturn).toHaveBeenCalledWith(
            expect.objectContaining({
                salesReturnId: salesReturn.id,
                companyId: 'comp-1',
                warehouseId: 'wh-1',
                lines: [
                    expect.objectContaining({
                        materialId: 'm-1',
                        uomId: 'uom-1',
                        quantity: 2,
                    }),
                ],
            }),
            actor,
        )
    })

    it('rejects a return that is not AUTHORIZED', async () => {
        const { service } = setup()
        const created = await service.create(dto, actor)
        await expect(
            service.initiateMmIntake(
                created.id,
                { warehouseId: 'wh-1' },
                actor,
            ),
        ).rejects.toThrow(/Only an AUTHORIZED/)
    })

    it('requires a warehouse when the return has none', async () => {
        const { service } = setup()
        const salesReturn = await authorized(service)
        await expect(
            service.initiateMmIntake(salesReturn.id, {}, actor),
        ).rejects.toThrow(/warehouseId is required/)
    })

    it('surfaces an existing intake from the MM service as created:false (idempotent)', async () => {
        const { service, customerReturns } = setup()
        const salesReturn = await authorized(service)
        customerReturns.createFromSalesReturn.mockResolvedValue({
            created: false,
            customerReturn: { id: 'cr-existing', returnNumber: 'CRT-000009' },
        })

        const result = await service.initiateMmIntake(
            salesReturn.id,
            { warehouseId: 'wh-1' },
            actor,
        )
        expect(result.created).toBe(false)
        expect(result.customerReturn.id).toBe('cr-existing')
    })

    it('requires the sd.sales-returns:update permission', async () => {
        const { service, permissions } = setup()
        const salesReturn = await authorized(service)
        permissions.assertPermission.mockRejectedValue(new ForbiddenException())
        await expect(
            service.initiateMmIntake(
                salesReturn.id,
                { warehouseId: 'wh-1' },
                actor,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(permissions.assertPermission).toHaveBeenCalledWith(
            { role: 'sales' },
            'sd.sales-returns',
            'update',
        )
    })
})

describe('SalesReturnService.list', () => {
    it('paginates and filters by company/status/order', async () => {
        const { service } = setup()
        await service.create(dto, actor)
        const page = await service.list({
            companyId: 'comp-1',
            status: SALES_RETURN_STATUS.REQUESTED,
            salesOrderId: 'so-1',
        })
        expect(page).toEqual(
            expect.objectContaining({ total: 1, page: 1, pageSize: 20 }),
        )
        expect(page.data[0].salesOrderId).toBe('so-1')
    })
})

describe('SalesReturnService constants', () => {
    it('keeps the returnable order statuses explicit', () => {
        expect([...RETURNABLE_ORDER_STATUSES].sort()).toEqual([
            'COMPLETED',
            'CONFIRMED',
        ])
    })
})

describe('SalesReturnController RBAC metadata', () => {
    it.each([
        ['list', 'read'],
        ['findOne', 'read'],
        ['create', 'create'],
        ['authorize', 'update'],
        ['reject', 'update'],
        ['cancel', 'update'],
        ['initiateIntake', 'update'],
    ] as const)('%s requires sd.sales-returns:%s', (handler, action) => {
        const fn =
            SalesReturnController.prototype[
                handler as
                    | 'list'
                    | 'findOne'
                    | 'create'
                    | 'authorize'
                    | 'reject'
                    | 'cancel'
                    | 'initiateIntake'
            ]
        expect(Reflect.getMetadata(PERMISSION_KEY, fn)).toEqual({
            resource: 'sd.sales-returns',
            action,
        })
    })
})
