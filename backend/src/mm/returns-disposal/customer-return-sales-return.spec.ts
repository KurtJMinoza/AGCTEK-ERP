import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CustomerReturnService } from './customer-return.service'

function setup() {
    const returns: Array<Record<string, any>> = []
    const audits: Array<Record<string, any>> = []
    const prisma = {
        mmMaterial: {
            findMany: jest.fn().mockResolvedValue([
                {
                    id: 'mat-1',
                    baseUomId: 'uom-1',
                    batchManaged: false,
                    serialManaged: false,
                },
            ]),
        },
        mmCustomerReturn: {
            count: jest.fn().mockResolvedValue(0),
            findUnique: jest.fn(
                async ({
                    where,
                }: {
                    where: { id?: string; sdSalesReturnId?: string }
                }) =>
                    returns.find((r) =>
                        where.id
                            ? r.id === where.id
                            : r.sdSalesReturnId === where.sdSalesReturnId,
                    ) ?? null,
            ),
            create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
                if (
                    returns.some(
                        (r) => r.sdSalesReturnId === data.sdSalesReturnId,
                    )
                ) {
                    throw new Prisma.PrismaClientKnownRequestError(
                        'duplicate',
                        {
                            code: 'P2002',
                            clientVersion: 'test',
                        },
                    )
                }
                const doc = {
                    id: `cr-${returns.length + 1}`,
                    ...data,
                    lines: (data.lines?.create ?? []).map(
                        (l: Record<string, unknown>, i: number) => ({
                            id: `crl-${i + 1}`,
                            ...l,
                        }),
                    ),
                }
                returns.push(doc)
                return doc
            }),
        },
        mmCustomerReturnAudit: {
            create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
                audits.push(data)
                return data
            }),
        },
    }
    const permissions = {
        assertPermission: jest.fn().mockResolvedValue(undefined),
    }
    const service = new CustomerReturnService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        permissions as never,
    )
    return { service, prisma, permissions, returns, audits }
}

const baseInput = {
    salesReturnId: 'sr-1',
    companyId: 'comp-1',
    warehouseId: 'wh-1',
    damageReportId: 'dr-1',
    customerRef: 'SR-000001',
    customerName: 'Acme Corp',
    reason: 'DAMAGED_IN_TRANSIT',
    lines: [{ materialId: 'mat-1', quantity: 2 }],
}

describe('CustomerReturnService.createFromSalesReturn (Phase 4)', () => {
    it('creates a DRAFT intake carrying the SD return + damage report references', async () => {
        const { service, returns, audits } = setup()

        const result = await service.createFromSalesReturn(baseInput, {
            id: 'u-1',
            role: 'warehouse',
        })

        expect(result.created).toBe(true)
        expect(result.customerReturn).toMatchObject({
            companyId: 'comp-1',
            warehouseId: 'wh-1',
            sdSalesReturnId: 'sr-1',
            damageReportId: 'dr-1',
            customerRef: 'SR-000001',
            status: 'DRAFT',
        })
        expect(result.customerReturn.lines[0]).toMatchObject({
            materialId: 'mat-1',
            uomId: 'uom-1',
        })
        expect(String(result.customerReturn.totalQuantity)).toBe('2')
        expect(returns).toHaveLength(1)
        expect(audits[0]).toMatchObject({ action: 'CREATED' })
        expect(audits[0].details).toMatchObject({
            salesReturnId: 'sr-1',
            damageReportId: 'dr-1',
        })
    })

    it('is idempotent: a second handoff returns the existing intake', async () => {
        const { service, returns } = setup()
        await service.createFromSalesReturn(baseInput, {
            id: 'u-1',
            role: 'warehouse',
        })
        const second = await service.createFromSalesReturn(baseInput, {
            id: 'u-1',
            role: 'warehouse',
        })

        expect(second.created).toBe(false)
        expect(second.customerReturn.id).toBe(returns[0].id)
        expect(returns).toHaveLength(1)
    })

    it('returns the winner when a concurrent insert hits the unique constraint (P2002)', async () => {
        const { service, prisma, returns } = setup()
        await service.createFromSalesReturn(baseInput, {
            id: 'u-1',
            role: 'warehouse',
        })
        // Simulate the race: the pre-check misses, the insert collides, the lookup finds the winner.
        prisma.mmCustomerReturn.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(returns[0])

        const raced = await service.createFromSalesReturn(baseInput, {
            id: 'u-1',
            role: 'warehouse',
        })
        expect(raced.created).toBe(false)
        expect(raced.customerReturn.id).toBe(returns[0].id)
    })

    it('requires the mm customer-return-intake create permission', async () => {
        const { service, permissions } = setup()
        permissions.assertPermission.mockRejectedValue(new ForbiddenException())

        await expect(
            service.createFromSalesReturn(baseInput, {
                id: 'u-1',
                role: 'warehouse',
            }),
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(permissions.assertPermission).toHaveBeenCalledWith(
            { role: 'warehouse' },
            'mm.returns-disposal.customer-return-intake',
            'create',
        )
    })

    it('rejects an empty line set', async () => {
        const { service } = setup()
        await expect(
            service.createFromSalesReturn(
                { ...baseInput, lines: [] },
                { id: 'u-1', role: 'warehouse' },
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})
