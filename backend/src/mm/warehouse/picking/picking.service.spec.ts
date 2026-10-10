import { BadRequestException } from '@nestjs/common'
import type { PrismaService } from '../../../prisma/prisma.service'
import { PickingService } from './picking.service'

function setup() {
    const users: Array<Record<string, unknown>> = [
        {
            id: 'u-1',
            email: 'worker@agc.test',
            userName: 'worker1',
            firstName: 'Juan',
            lastName: 'Dela Cruz',
            jobPosition: 'Warehouse Staff',
            role: 'employee',
            isActive: true,
            companies: [{ companyId: 'co-1' }],
        },
        {
            id: 'u-2',
            email: 'inactive@agc.test',
            userName: 'inactive1',
            firstName: 'Inactive',
            lastName: 'Worker',
            jobPosition: null,
            role: 'employee',
            isActive: false,
            companies: [{ companyId: 'co-1' }],
        },
        {
            id: 'u-3',
            email: 'other@agc.test',
            userName: 'other1',
            firstName: 'Other',
            lastName: 'Company',
            jobPosition: null,
            role: 'employee',
            isActive: true,
            companies: [{ companyId: 'co-2' }],
        },
        {
            id: 'u-4',
            email: 'unlinked@agc.test',
            userName: 'unlinked1',
            firstName: 'No',
            lastName: 'Links',
            jobPosition: null,
            role: 'employee',
            isActive: true,
            companies: [],
        },
    ]
    const prisma = {
        user: {
            findMany: jest.fn((args: { where: Record<string, unknown> }) => {
                let rows = users
                if (args.where.isActive === true) {
                    rows = rows.filter((u) => u.isActive === true)
                }
                const idFilter = args.where.id as
                    | { in: string[] }
                    | undefined
                if (idFilter?.in) {
                    rows = rows.filter((u) => idFilter.in.includes(u.id as string))
                }
                return Promise.resolve(rows)
            }),
            findUnique: jest.fn((args: { where: { id: string } }) =>
                Promise.resolve(
                    users.find((u) => u.id === args.where.id) ?? null,
                ),
            ),
        },
        userCompany: {
            findMany: jest.fn((args: { where?: { companyId?: string } }) => {
                const where = args.where ?? {}
                return Promise.resolve(
                    users
                        .flatMap((u) =>
                            (u.companies as Array<{ companyId: string }>).map(
                                (c) => ({ userId: u.id, companyId: c.companyId }),
                            ),
                        )
                        .filter((row) =>
                            where.companyId
                                ? row.companyId === where.companyId
                                : true,
                        )
                        .slice(0, 1),
                )
            }),
        },
        wmPickingTask: {
            findFirst: jest.fn().mockResolvedValue(null),
            findUnique: jest.fn((args) => {
                if (args.where.id === 'task-1') {
                    return Promise.resolve({
                        id: 'task-1',
                        status: 'OPEN',
                        companyId: 'co-1',
                        warehouseTaskId: null,
                        taskNumber: 'PK-000001',
                    })
                }
                return Promise.resolve(null)
            }),
            update: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'task-1', ...args.data }),
            ),
        },
    }
    const warehouseTasks = { assign: jest.fn().mockResolvedValue({}) }
    const service = new PickingService(
        prisma as unknown as PrismaService,
        warehouseTasks as never,
    )
    return { prisma, service }
}

describe('PickingService assignable workers', () => {
    it('returns active users only', async () => {
        const { service } = setup()
        const rows = await service.assignableUsers()
        expect(rows.every((u) => u.isActive)).toBe(true)
        expect(rows.map((u) => u.userId)).not.toContain('u-2')
    })

    it('is company-scoped when Organization user-company links exist', async () => {
        const { service } = setup()
        const rows = await service.assignableUsers('co-1')
        expect(rows.map((u) => u.userId)).toContain('u-1')
        expect(rows.map((u) => u.userId)).not.toContain('u-3')
    })

    it('returns every active user when no company links exist (single company)', async () => {
        const { prisma, service } = setup()
        prisma.userCompany.findMany.mockResolvedValue([])
        const rows = await service.assignableUsers('co-1')
        expect(rows.length).toBeGreaterThanOrEqual(3)
        expect(rows.map((u) => u.userId)).toContain('u-4')
    })

    it('blocks assigning an inactive worker', async () => {
        const { service } = setup()
        await expect(service.assign('task-1', 'u-2')).rejects.toBeInstanceOf(
            BadRequestException,
        )
    })

    it('blocks cross-company assignment when links exist', async () => {
        const { service } = setup()
        await expect(service.assign('task-1', 'u-3')).rejects.toBeInstanceOf(
            BadRequestException,
        )
    })

    it('assigns an active worker of the same company', async () => {
        const { service } = setup()
        const task = await service.assign('task-1', 'u-1')
        expect(task.assignedUser).toBe('u-1')
        expect(task.status).toBe('ASSIGNED')
    })
})