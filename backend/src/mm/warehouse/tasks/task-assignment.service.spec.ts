import { BadRequestException } from '@nestjs/common'
import type { PrismaService } from '../../../prisma/prisma.service'
import { TaskAssignmentService } from './task-assignment.service'

const task = {
    id: 'task-1',
    companyId: 'company-1',
    status: 'PENDING',
    putawayBridge: null,
    pickingBridge: null,
}

function setup(user: unknown) {
    const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(user) },
        wmWarehouseTask: {
            findUnique: jest.fn().mockResolvedValue(task),
            update: jest.fn().mockResolvedValue({
                ...task,
                assignedUserId: 'user-1',
                status: 'ASSIGNED',
            }),
        },
        wmPutawayTask: { update: jest.fn() },
        wmPickingTask: { update: jest.fn() },
    }
    return {
        prisma,
        service: new TaskAssignmentService(prisma as unknown as PrismaService),
    }
}

describe('TaskAssignmentService worker validation', () => {
    it('assigns an active user from the task company', async () => {
        const { service } = setup({
            id: 'user-1',
            isActive: true,
            companies: [{ companyId: 'company-1' }],
        })

        await expect(service.assign('task-1', 'user-1')).resolves.toMatchObject({
            assignedUserId: 'user-1',
            status: 'ASSIGNED',
        })
    })

    it('rejects inactive users', async () => {
        const { service } = setup({
            id: 'user-1',
            isActive: false,
            companies: [{ companyId: 'company-1' }],
        })

        await expect(service.assign('task-1', 'user-1')).rejects.toBeInstanceOf(
            BadRequestException,
        )
    })

    it('rejects users assigned to another company', async () => {
        const { service } = setup({
            id: 'user-1',
            isActive: true,
            companies: [{ companyId: 'company-2' }],
        })

        await expect(service.assign('task-1', 'user-1')).rejects.toBeInstanceOf(
            BadRequestException,
        )
    })
})
