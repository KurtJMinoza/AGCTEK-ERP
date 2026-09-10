import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { resolveEntityDetailPath } from '../../notifications/notification.routes'
import { Decimal } from '@prisma/client/runtime/library'

const DEFAULT_APPROVER_ROLE = 'MANAGER'

export type WorkflowMatchContext = {
    companyId?: string
    departmentId?: string
    costCenterId?: string
    supplierId?: string
    materialCategoryIds?: string[]
}

@Injectable()
export class WorkflowService {
    constructor(
        private prisma: PrismaService,
        private events: EventEmitter2,
        private notificationsService: NotificationsService,
    ) {}

    async start(entityType: string, entityId: string, opts: {
        amount?: number | Decimal
        initiatedBy?: string
        approverRole?: string
        notifyTarget?: string
        context?: WorkflowMatchContext
    } = {}) {
        const existing = await this.prisma.mmWorkflowInstance.findFirst({
            where: { entityType, entityId, status: 'PENDING' },
        })
        if (existing) {
            throw new BadRequestException(`Workflow already active for ${entityType}:${entityId}`)
        }

        const workflow = await this.resolveWorkflow(entityType, opts.amount, opts.context)

        const instance = await this.prisma.mmWorkflowInstance.create({
            data: {
                entityType,
                entityId,
                workflowId: workflow.id,
                initiatedBy: opts.initiatedBy ?? null,
            },
        })

        const task = await this.prisma.mmApprovalTask.create({
            data: {
                instanceId: instance.id,
                stepNumber: 1,
                approverRole: workflow.approverRole,
            },
        })

        this.events.emit('workflow.started', {
            entityType,
            entityId,
            instanceId: instance.id,
            taskId: task.id,
            approverRole: workflow.approverRole,
        })

        await this.notifyApprovers(workflow.approverRole, {
            entityType,
            entityId,
            taskId: task.id,
            notifyTarget: opts.notifyTarget,
        })

        return { instance, task }
    }

    async approveTask(taskId: string, opts: { userId?: string; comment?: string } = {}) {
        const task = await this.findTaskOrFail(taskId)
        if (task.status !== 'PENDING') {
            throw new BadRequestException(`Task ${taskId} is ${task.status}, not PENDING`)
        }

        const updated = await this.prisma.mmApprovalTask.update({
            where: { id: taskId },
            data: {
                status: 'APPROVED',
                approverId: opts.userId ?? null,
                comment: opts.comment ?? null,
                decidedBy: opts.userId ?? null,
                decidedAt: new Date(),
            },
        })

        const instance = await this.refreshInstance(task.instanceId)
        if (instance.status === 'APPROVED') {
            this.events.emit('workflow.approved', {
                entityType: instance.entityType,
                entityId: instance.entityId,
                instanceId: instance.id,
                decidedBy: opts.userId,
            })
        }

        return updated
    }

    async rejectTask(taskId: string, opts: { userId?: string; comment?: string } = {}) {
        const task = await this.findTaskOrFail(taskId)
        if (task.status !== 'PENDING') {
            throw new BadRequestException(`Task ${taskId} is ${task.status}, not PENDING`)
        }

        await this.prisma.mmApprovalTask.update({
            where: { id: taskId },
            data: {
                status: 'REJECTED',
                approverId: opts.userId ?? null,
                comment: opts.comment ?? null,
                decidedBy: opts.userId ?? null,
                decidedAt: new Date(),
            },
        })

        const instance = await this.prisma.mmWorkflowInstance.update({
            where: { id: task.instanceId },
            data: { status: 'REJECTED', decidedAt: new Date() },
        })

        this.events.emit('workflow.rejected', {
            entityType: instance.entityType,
            entityId: instance.entityId,
            instanceId: instance.id,
            comment: opts.comment,
            decidedBy: opts.userId,
        })

        return { task: { ...task, status: 'REJECTED' }, instance }
    }

    async returnTask(taskId: string, opts: { userId?: string; comment?: string } = {}) {
        const task = await this.findTaskOrFail(taskId)
        if (task.status !== 'PENDING') {
            throw new BadRequestException(`Task ${taskId} is ${task.status}, not PENDING`)
        }

        await this.prisma.mmApprovalTask.update({
            where: { id: taskId },
            data: {
                status: 'RETURNED',
                approverId: opts.userId ?? null,
                comment: opts.comment ?? null,
                decidedBy: opts.userId ?? null,
                decidedAt: new Date(),
            },
        })

        const instance = await this.prisma.mmWorkflowInstance.update({
            where: { id: task.instanceId },
            data: { status: 'RETURNED', decidedAt: new Date() },
        })

        this.events.emit('workflow.returned', {
            entityType: instance.entityType,
            entityId: instance.entityId,
            instanceId: instance.id,
            comment: opts.comment,
            decidedBy: opts.userId,
        })

        return { task: { ...task, status: 'RETURNED' }, instance }
    }

    async cancel(entityType: string, entityId: string) {
        const instance = await this.prisma.mmWorkflowInstance.findFirst({
            where: { entityType, entityId, status: 'PENDING' },
        })
        if (!instance) return null

        await this.prisma.mmApprovalTask.updateMany({
            where: { instanceId: instance.id, status: 'PENDING' },
            data: { status: 'CANCELLED', decidedAt: new Date() },
        })

        const cancelled = await this.prisma.mmWorkflowInstance.update({
            where: { id: instance.id },
            data: { status: 'CANCELLED', decidedAt: new Date() },
        })
        return cancelled
    }

    async findByEntity(entityType: string, entityId: string) {
        const instance = await this.prisma.mmWorkflowInstance.findFirst({
            where: { entityType, entityId },
            orderBy: { createdAt: 'desc' },
            include: { workflow: true, tasks: { orderBy: { stepNumber: 'asc' } } },
        })
        return instance
    }

    async findDefinitions() {
        return this.prisma.mmApprovalWorkflow.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
        })
    }

    private async resolveWorkflow(
        entityType: string,
        amount?: number | Decimal,
        context: WorkflowMatchContext = {},
    ) {
        const amountNum = amount != null ? Number(amount) : null
        let workflows = await this.prisma.mmApprovalWorkflow.findMany({
            where: { entityType, isActive: true },
            orderBy: { sortOrder: 'asc' },
        })

        if (workflows.length === 0) {
            const created = await this.prisma.mmApprovalWorkflow.create({
                data: {
                    code: `${entityType}_DEFAULT`,
                    name: `${entityType.replace(/_/g, ' ')} Default`,
                    entityType,
                    approverRole: DEFAULT_APPROVER_ROLE,
                    minAmount: 0,
                    sortOrder: 0,
                },
            })
            workflows = [created]
        }

        const matchesFilter = (wf: (typeof workflows)[0]) => {
            if (wf.companyId && wf.companyId !== context.companyId) return false
            if (wf.departmentId && wf.departmentId !== context.departmentId) return false
            if (wf.costCenterId && wf.costCenterId !== context.costCenterId) return false
            if (wf.supplierId && wf.supplierId !== context.supplierId) return false
            if (wf.materialCategoryId) {
                const cats = context.materialCategoryIds ?? []
                if (!cats.includes(wf.materialCategoryId)) return false
            }
            return true
        }

        const inAmountBand = (wf: (typeof workflows)[0]) => {
            if (amountNum == null) return true
            return amountNum >= Number(wf.minAmount) && (wf.maxAmount == null || amountNum <= Number(wf.maxAmount))
        }

        const specificity = (wf: (typeof workflows)[0]) =>
            [wf.companyId, wf.departmentId, wf.costCenterId, wf.supplierId, wf.materialCategoryId]
                .filter(Boolean).length

        const candidates = workflows
            .filter((wf) => matchesFilter(wf) && inAmountBand(wf))
            .sort((a, b) => specificity(b) - specificity(a) || a.sortOrder - b.sortOrder)

        if (candidates.length > 0) return candidates[0]

        const fallbackCode = `${entityType}_DEFAULT`
        const byCode = workflows.find((w) => w.code === fallbackCode)
        if (byCode) return byCode

        const fallback = workflows.find((w) => Number(w.minAmount) === 0 && w.maxAmount == null)
        if (fallback) return fallback

        return workflows[0]
    }

    private async findTaskOrFail(taskId: string) {
        const task = await this.prisma.mmApprovalTask.findUnique({ where: { id: taskId } })
        if (!task) throw new NotFoundException('Approval task not found')
        return task
    }

    private async refreshInstance(instanceId: string) {
        const tasks = await this.prisma.mmApprovalTask.findMany({ where: { instanceId } })
        const pending = tasks.filter((t) => t.status === 'PENDING')
        const rejected = tasks.some((t) => t.status === 'REJECTED' || t.status === 'RETURNED')

        if (pending.length === 0 && !rejected) {
            return this.prisma.mmWorkflowInstance.update({
                where: { id: instanceId },
                data: { status: 'APPROVED', decidedAt: new Date() },
            })
        }
        if (rejected) {
            return this.prisma.mmWorkflowInstance.update({
                where: { id: instanceId },
                data: { status: 'REJECTED', decidedAt: new Date() },
            })
        }
        const instance = await this.prisma.mmWorkflowInstance.findUnique({ where: { id: instanceId } })
        if (!instance) throw new NotFoundException('Workflow instance not found')
        return instance
    }

    private async notifyApprovers(approverRole: string, info: { entityType: string; entityId: string; taskId: string; notifyTarget?: string }) {
        await this.notificationsService.create({
            target: `${info.entityType}_APPROVAL`,
            description: `A ${info.entityType.replace(/_/g, ' ').toLowerCase()} requires ${approverRole} approval.`,
            location: resolveEntityDetailPath(info.entityType, info.entityId),
            locationLabel: info.entityId,
            status: 'UNREAD',
        })
    }
}