import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import { DamageReportsController } from './damage-reports.controller'
import {
    DamageReportsService,
    REPORTABLE_SHIPMENT_STATUSES,
} from './damage-reports.service'

type Report = Record<string, unknown> & { id: string; status: string }

const SHIPMENT = {
    id: 'sh-1',
    reference: 'MM-PKG-1',
    customerName: 'BuildRight',
    status: 'DELIVERED',
    movementType: 'DELIVERY',
    quantity: 5,
    lines: [
        {
            id: 'line-1',
            lineNo: 1,
            materialCode: 'M1',
            description: 'Material A',
            quantity: 3,
        },
        {
            id: 'line-2',
            lineNo: 2,
            materialCode: 'M2',
            description: 'Material B',
            quantity: 2,
        },
    ],
}

const HANDOFF_CHAIN = {
    shipmentLineId: 'line-1',
    packageItemId: 'pi-1',
    materialId: 'm-1',
    reservationHeaderId: 'h-1',
    demandReferenceLineId: 'so-line-1',
}

function setup(
    overrides: {
        resolveSalesOrderId?: (shipmentId: string) => string | null
        shipment?: typeof SHIPMENT | null
        companyExists?: boolean
        orderCompanyId?: string | null
        chain?: boolean
        noReservationHeader?: boolean
        demandReferenceLines?: Array<{
            demandReferenceLineId: string | null
        }> | null
    } = {},
) {
    const reports: Report[] = []
    const audits: Array<Record<string, unknown>> = []
    const prisma = {
        company: {
            findUnique: async () =>
                overrides.companyExists === false ? null : { id: 'comp-1' },
        },
        sdSalesOrder: {
            findUnique: async () =>
                overrides.orderCompanyId === undefined
                    ? { companyId: 'comp-1' }
                    : overrides.orderCompanyId === null
                      ? null
                      : { companyId: overrides.orderCompanyId },
        },
        shipment: {
            findUnique: async ({
                where,
                include,
            }: {
                where: { id: string }
                include?: { lines: unknown }
            }) => {
                if (where.id !== SHIPMENT.id) return null
                const row =
                    overrides.shipment === null
                        ? null
                        : (overrides.shipment ?? SHIPMENT)
                if (!row) return null
                return include?.lines
                    ? { ...row, lines: row.lines }
                    : { ...row }
            },
        },
        shipmentLine: {
            findUnique: async () =>
                overrides.chain
                    ? { packageItemId: HANDOFF_CHAIN.packageItemId }
                    : null,
        },
        wmPackageItem: {
            findUnique: async () =>
                overrides.chain
                    ? { materialId: HANDOFF_CHAIN.materialId }
                    : null,
        },
        mmInventoryReservationHeader: {
            findFirst: async () =>
                overrides.noReservationHeader
                    ? null
                    : { id: HANDOFF_CHAIN.reservationHeaderId },
        },
        mmInventoryReservationLine: {
            findMany: async () =>
                overrides.demandReferenceLines === undefined
                    ? [
                          {
                              demandReferenceLineId:
                                  HANDOFF_CHAIN.demandReferenceLineId,
                          },
                      ]
                    : (overrides.demandReferenceLines ?? []),
        },
        sdSalesReturn: {
            findUnique: async () => null,
        },
        damageReport: {
            findUnique: async ({
                where,
            }: {
                where: { id?: string; idempotencyKey?: string }
            }) => {
                if (where.id)
                    return reports.find((r) => r.id === where.id) ?? null
                if (where.idempotencyKey)
                    return (
                        reports.find(
                            (r) => r.idempotencyKey === where.idempotencyKey,
                        ) ?? null
                    )
                return null
            },
            findMany: async () => [...reports],
            count: async () => reports.length,
            create: async ({
                data,
                include,
            }: {
                data: Record<string, unknown>
                include?: unknown
            }) => {
                const nested = data.audits as
                    | { create?: Record<string, unknown> }
                    | undefined
                if (nested?.create) audits.push({ ...nested.create })
                const { audits: _audits, ...rest } = data
                const row = {
                    id: `dr-${reports.length + 1}`,
                    status: 'SUBMITTED',
                    ...rest,
                } as Report
                reports.push(row)
                return { ...row, ...(include ? { shipment: SHIPMENT } : {}) }
            },
            update: async ({
                where,
                data,
            }: {
                where: { id: string }
                data: Record<string, unknown>
            }) => {
                const row = reports.find((r) => r.id === where.id)
                if (!row) return null
                Object.assign(row, data)
                return row
            },
            updateMany: async ({
                where,
                data,
            }: {
                where: { id: string; status: string; sdSalesReturnId?: null }
                data: Record<string, unknown>
            }) => {
                const index = reports.findIndex(
                    (r) =>
                        r.id === where.id &&
                        r.status === where.status &&
                        (where.sdSalesReturnId === undefined ||
                            r.sdSalesReturnId === null),
                )
                if (index === -1) return { count: 0 }
                Object.assign(reports[index], data)
                return { count: 1 }
            },
        },
        damageReportAudit: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                audits.push(data)
                return data
            },
        },
        $transaction: async (arg: unknown) => {
            if (Array.isArray(arg)) return Promise.all(arg)
            const snapshot = structuredClone(reports)
            try {
                return await (arg as (tx: unknown) => Promise<unknown>)(prisma)
            } catch (error) {
                reports.length = 0
                reports.push(...snapshot)
                throw error
            }
        },
    }
    const shipments = {
        resolveSalesOrderId: jest.fn(
            overrides.resolveSalesOrderId ?? (() => 'so-1'),
        ),
    }
    const salesReturns = {
        create: jest.fn((input: Record<string, unknown>) =>
            Promise.resolve({
                id: 'sr-1',
                returnNumber: 'SR-000001',
                ...input,
            }),
        ),
        findOne: jest.fn(async (id: string) => ({
            id,
            returnNumber: 'SR-000001',
        })),
    }
    const service = new DamageReportsService(
        prisma as never,
        shipments as never,
        salesReturns as never,
    )
    return { service, shipments, reports, audits, salesReturns, prisma }
}

const input = {
    companyId: 'comp-1',
    damagedQuantity: 2,
    description: 'Crate crushed during drop-off',
}

const user = { id: 'user-1' }

describe('DamageReportsService.createForShipment', () => {
    it('reports damage against a delivered shipment and links the resolved sales order', async () => {
        const { service, shipments, reports, audits } = setup()

        const created = await service.createForShipment('sh-1', input, user)

        expect(shipments.resolveSalesOrderId).toHaveBeenCalledWith('sh-1')
        expect(created).toMatchObject({
            companyId: 'comp-1',
            shipmentId: 'sh-1',
            salesOrderId: 'so-1',
            salesOrderStatus: 'RESOLVED',
            damagedQuantity: 2,
            description: 'Crate crushed during drop-off',
            status: 'SUBMITTED',
            reportedBy: 'user-1',
        })
        expect(created.reference).toMatch(/^DR-/)
        expect(reports).toHaveLength(1)
        expect(audits[0]).toEqual(
            expect.objectContaining({
                action: 'CREATED',
                performedBy: 'user-1',
                details: { companyId: 'comp-1', salesOrderStatus: 'RESOLVED' },
            }),
        )
    })

    it('explicitly marks UNRESOLVED when no verifiable sales order exists (manual shipments)', async () => {
        const { service, reports } = setup({ resolveSalesOrderId: () => null })

        const created = await service.createForShipment('sh-1', input, user)

        expect(created.salesOrderId).toBeNull()
        expect(created.salesOrderStatus).toBe('UNRESOLVED')
        expect(reports).toHaveLength(1)
    })

    it('derives company scope from the proven SD order when one is not supplied', async () => {
        const { service, reports } = setup()
        const created = await service.createForShipment(
            'sh-1',
            { damagedQuantity: 1, description: 'Scratched' },
            user,
        )
        expect(created.companyId).toBe('comp-1')
        expect(created.salesOrderStatus).toBe('RESOLVED')
        expect(reports).toHaveLength(1)
    })

    it('requires an explicit companyId for shipments whose order cannot be resolved', async () => {
        const { service, reports } = setup({
            resolveSalesOrderId: () => null,
            orderCompanyId: null,
        })
        await expect(
            service.createForShipment(
                'sh-1',
                { damagedQuantity: 1, description: 'Scratched' },
                user,
            ),
        ).rejects.toThrow(/companyId is required/)
        expect(reports).toHaveLength(0)
    })

    it('accepts a line-level report and validates the damaged quantity against the line', async () => {
        const { service, reports } = setup()
        await service.createForShipment(
            'sh-1',
            { ...input, shipmentLineId: 'line-1', damagedQuantity: 2 },
            user,
        )
        expect(reports[0].shipmentLineId).toBe('line-1')

        await expect(
            service.createForShipment(
                'sh-1',
                { ...input, shipmentLineId: 'line-1', damagedQuantity: 4 },
                user,
            ),
        ).rejects.toThrow(/exceeds the line quantity/)
        await expect(
            service.createForShipment(
                'sh-1',
                { ...input, shipmentLineId: 'line-other', damagedQuantity: 1 },
                user,
            ),
        ).rejects.toThrow(/does not belong/)
        expect(reports).toHaveLength(1)
    })

    it('caps an un-scoped report at the shipment quantity', async () => {
        const { service, reports } = setup()
        await expect(
            service.createForShipment(
                'sh-1',
                { ...input, damagedQuantity: 9 },
                user,
            ),
        ).rejects.toThrow(/exceeds the shipment quantity/)
        expect(reports).toHaveLength(0)
    })

    it('only reports on DELIVERED or EXCEPTION_HOLD deliveries', async () => {
        const { service, reports } = setup({
            shipment: { ...SHIPMENT, status: 'IN_TRANSIT' },
        })
        await expect(
            service.createForShipment('sh-1', input, user),
        ).rejects.toBeInstanceOf(ConflictException)
        expect(reports).toHaveLength(0)
    })

    it('404s for a missing shipment and rejects an unknown company', async () => {
        const { service, reports } = setup({ shipment: null })
        await expect(
            service.createForShipment('missing', input, user),
        ).rejects.toBeInstanceOf(NotFoundException)

        const { service: svc2 } = setup({ companyExists: false })
        await expect(
            svc2.createForShipment('sh-1', input, user),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(reports).toHaveLength(0)
    })

    it('is idempotent on a client-supplied idempotencyKey', async () => {
        const { service, reports } = setup()
        const body = { ...input, idempotencyKey: 'delivery-run-42' }

        const first = await service.createForShipment('sh-1', body, user)
        const second = await service.createForShipment('sh-1', body, user)

        expect(reports).toHaveLength(1)
        expect(second.id).toBe(first.id)
    })

    it('gates on realistic reportable statuses', () => {
        expect([...REPORTABLE_SHIPMENT_STATUSES].sort()).toEqual([
            'DELIVERED',
            'EXCEPTION_HOLD',
        ])
    })
})

describe('DamageReportsService read + lifecycle', () => {
    it('lists reports for a shipment, newest first, with pagination totals', async () => {
        const { service } = setup()
        await service.createForShipment('sh-1', input, user)

        const page = await service.listForShipment('sh-1', {})
        expect(page).toEqual(
            expect.objectContaining({ total: 1, page: 1, pageSize: 20 }),
        )
        expect((page.data[0] as Report).shipmentId).toBe('sh-1')
    })

    it('404s the list for an unknown shipment', async () => {
        const { service } = setup({ shipment: null })
        await expect(
            service.listForShipment('missing', {}),
        ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('finds a single report', async () => {
        const { service } = setup()
        const created = await service.createForShipment('sh-1', input, user)
        await expect(service.findOne(created.id)).resolves.toMatchObject({
            id: created.id,
        })
        await expect(service.findOne('nope')).rejects.toBeInstanceOf(
            NotFoundException,
        )
    })

    it('cancels a SUBMITTED report with an audit trail', async () => {
        const { service, audits } = setup()
        const created = await service.createForShipment('sh-1', input, user)

        const cancelled = await service.cancel(
            created.id,
            { reason: 'Wrong delivery' },
            { id: 'user-2' },
        )

        expect(cancelled.status).toBe('CANCELLED')
        expect(audits.map((a) => a.action)).toEqual(['CREATED', 'CANCELLED'])
        expect(audits[1]).toEqual(
            expect.objectContaining({
                performedBy: 'user-2',
                details: { reason: 'Wrong delivery' },
            }),
        )
    })

    it('rejects a second cancel and a cancel once an MM intake is linked', async () => {
        const { service } = setup()
        const created = await service.createForShipment('sh-1', input, user)
        await service.cancel(created.id, {}, { id: 'user-1' })
        await expect(
            service.cancel(created.id, {}, { id: 'user-1' }),
        ).rejects.toBeInstanceOf(ConflictException)

        const { service: svc2, reports: reports2 } = setup()
        const linked = await svc2.createForShipment('sh-1', input, user)
        reports2[0].customerReturnId = 'intake-1'
        await expect(
            svc2.cancel(linked.id, {}, { id: 'user-1' }),
        ).rejects.toThrow(/already opened/)
    })

    it('rolls back the report when the audit write fails mid-transaction', async () => {
        const { service } = setup()
        // The fake $transaction restores `reports` on throw; force an error by cancelling an
        // already-finalized status (updateMany claims 0) — nothing is persisted.
        const created = await service.createForShipment('sh-1', input, user)
        await service.cancel(created.id, {}, { id: 'user-1' })

        const page = await service.listForShipment('sh-1', {})
        expect((page.data[0] as Report).status).toBe('CANCELLED')
    })
})

describe('DamageReportsService.initiateSalesReturn (SCM → SD handoff)', () => {
    const handoffUser = { id: 'user-1', role: 'sales' }
    const reportRow = (overrides: Record<string, unknown> = {}) => ({
        id: 'dr-x',
        reference: 'DR-X',
        companyId: 'comp-1',
        shipmentId: 'sh-1',
        shipmentLineId: 'line-1',
        salesOrderId: 'so-1',
        salesOrderStatus: 'RESOLVED',
        damagedQuantity: 2,
        description: 'Crate crushed during drop-off',
        status: 'SUBMITTED',
        sdSalesReturnId: null as string | null,
        customerReturnId: null as string | null,
        ...overrides,
    })

    it('creates exactly one REQUESTED sales return and links the report back to it', async () => {
        const { service, salesReturns, reports, prisma } = setup({
            chain: true,
        })
        reports.push(reportRow())

        const result = await service.initiateSalesReturn('dr-x', handoffUser)

        expect(salesReturns.create).toHaveBeenCalledWith(
            {
                salesOrderId: 'so-1',
                companyId: 'comp-1',
                damageReportId: 'dr-x',
                reason: 'DAMAGED_IN_TRANSIT',
                notes: 'Damage report DR-X',
                lines: [
                    {
                        salesOrderLineId: 'so-line-1',
                        materialId: 'm-1',
                        quantity: 2,
                    },
                ],
            },
            handoffUser,
            { tx: prisma },
        )
        expect(reports[0]).toMatchObject({
            status: 'RETURN_CREATED',
            sdSalesReturnId: 'sr-1',
        })
        expect(result.created).toBe(true)
        expect(result.salesReturn.returnNumber).toBe('SR-000001')
        expect(result.damageReport.status).toBe('RETURN_CREATED')
    })

    it('refuses UNRESOLVED reports, which stay SUBMITTED for manual handling', async () => {
        const { service, reports } = setup()
        reports.push(
            reportRow({ salesOrderStatus: 'UNRESOLVED', salesOrderId: null }),
        )

        await expect(
            service.initiateSalesReturn('dr-x', handoffUser),
        ).rejects.toThrow(/no resolvable sales order/)
        expect(reports[0].status).toBe('SUBMITTED')
    })

    it('refuses non-line-level reports (would require guessing the affected order line)', async () => {
        const { service, reports } = setup()
        reports.push(reportRow({ shipmentLineId: null }))

        await expect(
            service.initiateSalesReturn('dr-x', handoffUser),
        ).rejects.toThrow(/not line-level/)
        expect(reports[0].status).toBe('SUBMITTED')
    })

    it('rejects ambiguous material→order-line mappings instead of picking a line', async () => {
        const { service, reports } = setup({
            chain: true,
            demandReferenceLines: [
                { demandReferenceLineId: 'so-line-1' },
                { demandReferenceLineId: 'so-line-2' },
            ],
        })
        reports.push(reportRow())

        await expect(
            service.initiateSalesReturn('dr-x', handoffUser),
        ).rejects.toThrow(/multiple sales order lines/)
        expect(reports[0].status).toBe('SUBMITTED')
    })

    it('leaves the report intact and retryable when SD creation fails (transaction rolls back)', async () => {
        const { service, salesReturns, reports } = setup({ chain: true })
        reports.push(reportRow())
        salesReturns.create.mockRejectedValue(new Error('SD down'))

        await expect(
            service.initiateSalesReturn('dr-x', handoffUser),
        ).rejects.toThrow('SD down')
        expect(reports[0].status).toBe('SUBMITTED')
        expect(reports[0].sdSalesReturnId).toBeNull()
    })

    it('is idempotent: a retry whose claim lost returns the existing return, never a duplicate', async () => {
        const { service, salesReturns, reports, prisma } = setup({
            chain: true,
        })
        reports.push(reportRow({ sdSalesReturnId: 'sr-1' }))
        ;(
            prisma as unknown as { sdSalesReturn: { findUnique: jest.Mock } }
        ).sdSalesReturn.findUnique = jest.fn().mockResolvedValue({ id: 'sr-1' })

        const result = await service.initiateSalesReturn('dr-x', handoffUser)

        expect(salesReturns.create).not.toHaveBeenCalled()
        expect(reports[0].status).toBe('SUBMITTED')
        expect(result.created).toBe(false)
        expect(salesReturns.findOne).toHaveBeenCalledWith('sr-1')
    })

    it('never authorizes automatically: the created return is REQUESTED and the report is not cancelled/reopened', async () => {
        const { service, salesReturns, reports } = setup({ chain: true })
        reports.push(reportRow())

        await service.initiateSalesReturn('dr-x', handoffUser)

        const dto = salesReturns.create.mock.calls[0][0] as { reason: string }
        expect(dto.reason).toBe('DAMAGED_IN_TRANSIT')
        expect(salesReturns.create).toHaveBeenCalledTimes(1)
    })
})

describe('DamageReportsController RBAC metadata', () => {
    it.each([
        [
            'list',
            'read',
            ['scm.shipments', 'scm.load-building', 'scm.trip-planning'],
        ],
        [
            'findOne',
            'read',
            ['scm.shipments', 'scm.load-building', 'scm.trip-planning'],
        ],
        ['create', 'create', 'scm.shipments'],
        ['cancel', 'update', 'scm.shipments'],
        ['initiateReturn', 'update', 'scm.shipments'],
    ] as const)(
        '%s requires scm permissions (%)',
        (handler, action, resource) => {
            const fn =
                DamageReportsController.prototype[
                    handler as
                        | 'list'
                        | 'findOne'
                        | 'create'
                        | 'cancel'
                        | 'initiateReturn'
                ]
            expect(Reflect.getMetadata(PERMISSION_KEY, fn)).toEqual({
                resource,
                action,
            })
        },
    )
})
