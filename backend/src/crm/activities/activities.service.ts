import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { CrmActivity, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { assertUserExists, CRM_USER_SUMMARY_SELECT } from '../crm-references'
import { OPPORTUNITY_OPEN_STAGES } from '../opportunities/dto/opportunity.dto'
import {
    activityDueStatus,
    NextActivitySummary,
    NO_NEXT_ACTIVITY,
    summarizeNextActivity,
} from './activity-status'
import { CompleteActivityDto, CreateActivityDto } from './dto/activity.dto'

const OPEN_STAGES: ReadonlySet<string> = new Set(OPPORTUNITY_OPEN_STAGES)
/** Matches the ticket rule: CLOSED / CANCELLED are read-only; RESOLVED may still get follow-ups. */
const TICKET_TERMINAL_STATUSES: ReadonlySet<string> = new Set(['CLOSED', 'CANCELLED'])

type PrismaClientLike = PrismaService | Prisma.TransactionClient

export type ActivityParentKind = 'opportunity' | 'ticket'
type ActivityParent = { kind: ActivityParentKind; id: string }

const PARENT_COLUMN = {
    opportunity: 'opportunityId',
    ticket: 'ticketId',
} as const satisfies Record<ActivityParentKind, keyof CrmActivity>

const parentWhere = (parent: ActivityParent) => ({ [PARENT_COLUMN[parent.kind]]: parent.id })

const overdueActivity = (now: Date) => ({ doneAt: null, dueAt: { lt: now } })

/**
 * "Overdue" for lists and the dashboard: the record still accepts activities (open stage /
 * non-terminal ticket) and has an open activity past due — the same records whose badge is OVERDUE.
 */
export const overdueOpportunityWhere = (now: Date): Prisma.CrmOpportunityWhereInput => ({
    stage: { in: [...OPPORTUNITY_OPEN_STAGES] },
    activities: { some: overdueActivity(now) },
})

export const overdueTicketWhere = (now: Date): Prisma.CrmTicketWhereInput => ({
    status: { notIn: [...TICKET_TERMINAL_STATUSES] },
    activities: { some: overdueActivity(now) },
})

/** Overdue activities themselves (not their parents), on records that still accept activities. */
export const overdueActivitiesWhere = (
    kind: ActivityParentKind,
    now: Date,
): Prisma.CrmActivityWhereInput =>
    kind === 'opportunity'
        ? { ...overdueActivity(now), opportunity: { stage: { in: [...OPPORTUNITY_OPEN_STAGES] } } }
        : { ...overdueActivity(now), ticket: { status: { notIn: [...TICKET_TERMINAL_STATUSES] } } }

@Injectable()
export class CrmActivitiesService {
    constructor(private readonly prisma: PrismaService) {}

    listForOpportunity(opportunityId: string, now = new Date()) {
        return this.list({ kind: 'opportunity', id: opportunityId }, now)
    }

    createForOpportunity(opportunityId: string, dto: CreateActivityDto, userId: string) {
        return this.create({ kind: 'opportunity', id: opportunityId }, dto, userId)
    }

    complete(opportunityId: string, activityId: string, dto: CompleteActivityDto, userId: string) {
        return this.completeFor({ kind: 'opportunity', id: opportunityId }, activityId, dto, userId)
    }

    listForTicket(ticketId: string, now = new Date()) {
        return this.list({ kind: 'ticket', id: ticketId }, now)
    }

    createForTicket(ticketId: string, dto: CreateActivityDto, userId: string) {
        return this.create({ kind: 'ticket', id: ticketId }, dto, userId)
    }

    completeForTicket(ticketId: string, activityId: string, dto: CompleteActivityDto, userId: string) {
        return this.completeFor({ kind: 'ticket', id: ticketId }, activityId, dto, userId)
    }

    /** Open activities first (earliest due first), then completed ones. */
    private async list(parent: ActivityParent, now: Date) {
        await this.findParent(parent)
        const rows = await this.prisma.crmActivity.findMany({
            where: parentWhere(parent),
            orderBy: [{ doneAt: { sort: 'desc', nulls: 'first' } }, { dueAt: 'asc' }],
        })
        return this.present(rows, now)
    }

    private async create(parent: ActivityParent, dto: CreateActivityDto, userId: string) {
        await this.assertParentOpen(parent)
        const assignedTo = await this.resolveAssignee(dto, userId)
        const row = await this.prisma.crmActivity.create({
            data: this.createData(parent, dto, assignedTo, userId),
        })
        return (await this.present([row]))[0]
    }

    /** Only an open activity can be completed (conditional update); a repeat returns 409. */
    private async completeFor(
        parent: ActivityParent,
        activityId: string,
        dto: CompleteActivityDto,
        userId: string,
    ) {
        let nextAssignee: string | null = null
        if (dto.next) {
            await this.assertParentOpen(parent)
            nextAssignee = await this.resolveAssignee(dto.next, userId)
        }

        const [completed, next] = await this.prisma.$transaction(async (tx) => {
            const result = await tx.crmActivity.updateMany({
                where: { id: activityId, ...parentWhere(parent), doneAt: null },
                data: { doneAt: new Date(), updatedBy: userId },
            })
            if (result.count === 0) {
                const existing = await tx.crmActivity.findFirst({
                    where: { id: activityId, ...parentWhere(parent) },
                    select: { id: true },
                })
                if (!existing) throw new NotFoundException('Activity not found')
                throw new ConflictException('Activity is already completed')
            }
            const done = await tx.crmActivity.findUniqueOrThrow({ where: { id: activityId } })
            const created =
                dto.next && nextAssignee
                    ? await tx.crmActivity.create({
                          data: this.createData(parent, dto.next, nextAssignee, userId),
                      })
                    : null
            return [done, created] as const
        })

        const presented = await this.present(next ? [completed, next] : [completed])
        return { completed: presented[0], next: presented[1] ?? null }
    }

    /** Badge summary for many parents in one query (no N+1). */
    async nextActivityByParent(
        kind: ActivityParentKind,
        parentIds: string[],
        now = new Date(),
    ): Promise<Map<string, NextActivitySummary>> {
        const summaries = new Map<string, NextActivitySummary>()
        if (parentIds.length === 0) return summaries
        const column = PARENT_COLUMN[kind]
        const groups = await this.prisma.crmActivity.groupBy({
            by: [column],
            where: { [column]: { in: parentIds }, doneAt: null },
            _min: { dueAt: true },
        })
        for (const group of groups) {
            const parentId = group[column]
            if (parentId && group._min?.dueAt) {
                summaries.set(parentId, summarizeNextActivity([group._min.dueAt], now))
            }
        }
        return summaries
    }

    nextActivityByOpportunity(opportunityIds: string[], now = new Date()) {
        return this.nextActivityByParent('opportunity', opportunityIds, now)
    }

    withNextActivity<T extends { id: string }>(rows: T[], now = new Date()) {
        return this.withNextActivityFor('opportunity', rows, now)
    }

    async withNextActivityFor<T extends { id: string }>(
        kind: ActivityParentKind,
        rows: T[],
        now = new Date(),
    ) {
        const summaries = await this.nextActivityByParent(
            kind,
            rows.map((r) => r.id),
            now,
        )
        return rows.map((row) => ({ ...row, ...(summaries.get(row.id) ?? NO_NEXT_ACTIVITY) }))
    }

    /**
     * Lead → opportunity conversion: relink the lead's activities (open and done) to the opportunity.
     * `leadId` is kept so the lead's history stays intact; activities already on another
     * opportunity are left alone, which also makes repeated calls harmless.
     */
    async reparentLeadActivities(
        leadId: string,
        opportunityId: string,
        client: PrismaClientLike = this.prisma,
    ) {
        const result = await client.crmActivity.updateMany({
            where: { leadId, opportunityId: null },
            data: { opportunityId },
        })
        return result.count
    }

    private createData(
        parent: ActivityParent,
        dto: CreateActivityDto,
        assignedTo: string,
        userId: string,
    ): Prisma.CrmActivityUncheckedCreateInput {
        return {
            ...parentWhere(parent),
            type: dto.type,
            summary: dto.summary,
            dueAt: dto.dueAt,
            assignedTo,
            createdBy: userId,
            updatedBy: userId,
        }
    }

    private async resolveAssignee(dto: CreateActivityDto, userId: string) {
        if (dto.assignedTo && dto.assignedTo !== userId) {
            await assertUserExists(this.prisma, dto.assignedTo)
            return dto.assignedTo
        }
        return userId
    }

    private async findParent(parent: ActivityParent) {
        if (parent.kind === 'opportunity') {
            const opportunity = await this.prisma.crmOpportunity.findUnique({
                where: { id: parent.id },
                select: { id: true, stage: true },
            })
            if (!opportunity) throw new NotFoundException('Opportunity not found')
            return { open: OPEN_STAGES.has(opportunity.stage), state: opportunity.stage }
        }
        const ticket = await this.prisma.crmTicket.findUnique({
            where: { id: parent.id },
            select: { id: true, status: true },
        })
        if (!ticket) throw new NotFoundException('Ticket not found')
        return { open: !TICKET_TERMINAL_STATUSES.has(ticket.status), state: ticket.status }
    }

    private async assertParentOpen(parent: ActivityParent) {
        const { open, state } = await this.findParent(parent)
        if (!open) {
            throw new ConflictException(`Cannot schedule activities on a ${state} ${parent.kind}`)
        }
    }

    private async present(rows: CrmActivity[], now = new Date()) {
        const ids = [...new Set(rows.map((r) => r.assignedTo))]
        const users = ids.length
            ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: CRM_USER_SUMMARY_SELECT })
            : []
        const byId = new Map(users.map((u) => [u.id, u]))
        return rows.map((row) => ({
            ...row,
            dueStatus: activityDueStatus(row, now),
            assignee: byId.get(row.assignedTo) ?? null,
        }))
    }
}
