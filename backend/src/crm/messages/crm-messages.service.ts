import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { CrmMessage, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { SalesOrderService } from '../../sd/sales-order.service'
import { QuotationService } from '../../sd/quotation.service'
import { CrmActivitiesService } from '../activities/activities.service'
import { type CrmPrismaClient } from '../crm-references'

/** Notes may only be edited inside this window after posting (Odoo-style chatter rule). */
export const NOTE_EDIT_WINDOW_MS = 15 * 60 * 1000

/** Per-source window when loading the merged feed (each source is bounded, not all history). */
const FEED_WINDOW = 200

const DEFAULT_FEED_LIMIT = 50

export type SystemChange = {
    field: string
    from: unknown
    to: unknown
    /** Optional override; otherwise a human-readable summary is derived from `field`. */
    summary?: string
}

export const FEED_ITEM_TYPES = ['NOTE', 'SYSTEM', 'ACTIVITY', 'QUOTATION', 'SALES_ORDER'] as const
export type FeedItemType = (typeof FEED_ITEM_TYPES)[number]

export type FeedItem = {
    id: string
    type: FeedItemType
    at: string
    actor: { id: string; userName: string; firstName: string; lastName: string } | null
    summary: string
    metadata: Prisma.JsonValue | null
}

export type FeedPage = { data: FeedItem[]; nextCursor: string | null }

const USER_SUMMARY = {
    id: true,
    userName: true,
    firstName: true,
    lastName: true,
} as const

type UserRef = { id: string; userName: string; firstName: string; lastName: string }

export function formatSystemLabel(value: string) {
    return value
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

/** Human-readable summary for a tracked change; `metadata` always stays `{ field, from, to }`. */
export function systemSummary(change: SystemChange): string {
    const from = change.from === null || change.from === undefined ? 'none' : String(change.from)
    const to = change.to === null || change.to === undefined ? 'none' : String(change.to)
    switch (change.field) {
        case 'stage':
            return change.summary ?? `Stage changed from ${formatSystemLabel(from)} to ${formatSystemLabel(to)}`
        case 'assignedTo':
            if (to === 'none') return 'Owner was removed'
            return from === 'none'
                ? `Assigned to ${to}`
                : `Owner changed from ${from} to ${to}`
        case 'amount':
            return `Amount changed from ${from} to ${to}`
        case 'expectedCloseDate':
            return `Expected close changed from ${from} to ${to}`
        case 'lostReason':
            if (to === 'none') return 'Lost reason cleared'
            return from === 'none'
                ? `Lost reason set to ${formatSystemLabel(to)}`
                : `Lost reason changed from ${formatSystemLabel(from)} to ${formatSystemLabel(to)}`
        default:
            return `${change.field} changed from ${from} to ${to}`
    }
}

/** Anything stored in the JSON `metadata` column must be JSON-safe (Decimals → strings). */
function jsonSafe(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) return null
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'object' && 'toFixed' in value) {
        return (value as { toFixed(dp?: number): string }).toFixed(2)
    }
    return String(value)
}

/**
 * Chatter feed for an opportunity: NOTE / SYSTEM messages owned by CRM, plus scheduled /
 * completed activities, SD quotation status moves and the SD sales order link — SD data is
 * merged at read time, never copied into CRM tables.
 */
@Injectable()
export class CrmMessagesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly activities: CrmActivitiesService,
        private readonly quotations: QuotationService,
        private readonly salesOrders: SalesOrderService,
    ) {}

    /** Append-only audit: writes one SYSTEM row per change inside the caller's transaction. */
    async recordSystem(
        client: CrmPrismaClient,
        opportunityId: string,
        changes: SystemChange[],
        authorId: string,
    ) {
        if (changes.length === 0) return { count: 0 }
        const createdAt = new Date()
        return client.crmMessage.createMany({
            data: changes.map((change) => ({
                opportunityId,
                kind: 'SYSTEM',
                body: systemSummary(change),
                metadata: {
                    field: change.field,
                    from: jsonSafe(change.from),
                    to: jsonSafe(change.to),
                },
                authorId,
                createdAt,
            })),
        })
    }

    async addNote(opportunityId: string, body: string, userId: string) {
        await this.assertOpportunity(opportunityId)
        const row = await this.prisma.crmMessage.create({
            data: { opportunityId, kind: 'NOTE', body, authorId: userId },
        })
        return (await this.present([row]))[0]
    }

    /** Soft delete: the row keeps its history with `deletedAt`; only its author can hide it. */
    async softDeleteNote(opportunityId: string, noteId: string, userId: string) {
        const note = await this.findNote(opportunityId, noteId)
        if (note.kind !== 'NOTE') throw new ConflictException('System entries cannot be deleted')
        if (note.authorId !== userId) {
            throw new ForbiddenException('Only the author can delete this note')
        }
        const deletedAt = new Date()
        const result = await this.prisma.crmMessage.updateMany({
            where: { id: noteId, opportunityId, kind: 'NOTE', authorId: userId, deletedAt: null },
            data: { deletedAt },
        })
        if (result.count === 0) throw new ConflictException('Note is already deleted')
        return { id: noteId, deletedAt }
    }

    /** Author-only edit inside the 15-minute window; SYSTEM entries are never editable. */
    async editNote(opportunityId: string, noteId: string, body: string, userId: string) {
        const note = await this.findNote(opportunityId, noteId)
        if (note.kind !== 'NOTE') throw new ConflictException('System entries cannot be edited')
        if (note.authorId !== userId) {
            throw new ForbiddenException('Only the author can edit this note')
        }
        if (note.deletedAt) throw new NotFoundException('Note not found')
        if (Date.now() > new Date(note.createdAt).getTime() + NOTE_EDIT_WINDOW_MS) {
            throw new ForbiddenException('Notes can only be edited within 15 minutes of posting')
        }
        const row = await this.prisma.crmMessage.update({
            where: { id: noteId },
            data: { body, updatedAt: new Date() },
        })
        return (await this.present([row]))[0]
    }

    /**
     * Merged, time-descending feed with cursor pagination. Each source is bounded per page;
     * a cursor advances with strictly older instants, so ties on the page boundary can be
     * revisited rather than duplicated.
     */
    async listFeed(opportunityId: string, query: { cursor?: string; limit?: number } = {}): Promise<FeedPage> {
        const limit = query.limit ?? DEFAULT_FEED_LIMIT
        const cursorAt = query.cursor ? new Date(query.cursor) : null
        if (cursorAt !== null && Number.isNaN(cursorAt.getTime())) {
            throw new BadRequestException('Invalid feed cursor')
        }
        const opportunity = await this.assertOpportunity(opportunityId)
        const cursorWhere = cursorAt ? { createdAt: { lt: cursorAt } } : {}

        const [messages, activities, quotations, order] = await Promise.all([
            this.prisma.crmMessage.findMany({
                where: { opportunityId, deletedAt: null, ...cursorWhere },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: FEED_WINDOW,
            }),
            this.activities.listForOpportunity(opportunityId),
            this.quotations.listForOpportunity(opportunityId),
            opportunity.sdSalesOrderId
                ? this.salesOrders.findOne(opportunity.sdSalesOrderId)
                : (Promise.resolve(null) as Promise<null>),
        ])

        const byUser = await this.resolveUsers([
            ...messages.map((m) => m.authorId),
            ...activities.flatMap((a) => [a.assignedTo, a.assignee?.id]),
            ...quotations.flatMap((q) => [q.sentBy, q.decidedBy]),
        ])

        const items: FeedItem[] = []
        for (const message of messages) {
            items.push({
                id: `message:${message.id}`,
                type: message.kind as FeedItemType,
                at: message.createdAt.toISOString(),
                actor: message.authorId ? (byUser.get(message.authorId) ?? null) : null,
                summary: message.body ?? '',
                metadata: message.metadata,
            })
        }
        for (const activity of activities) {
            const actor = activity.assignedTo ? (byUser.get(activity.assignedTo) ?? null) : null
            const what = `${formatSystemLabel(activity.type)}: ${activity.summary}`
            items.push({
                id: `activity:${activity.id}:scheduled`,
                type: 'ACTIVITY',
                at: activity.createdAt.toISOString(),
                actor,
                summary: `Scheduled ${what}`,
                metadata: { activityId: activity.id, status: 'scheduled', dueAt: activity.dueAt.toISOString() },
            })
            if (activity.doneAt) {
                items.push({
                    id: `activity:${activity.id}:done`,
                    type: 'ACTIVITY',
                    at: activity.doneAt.toISOString(),
                    actor,
                    summary: `Completed ${what}`,
                    metadata: { activityId: activity.id, status: 'done', dueAt: activity.dueAt.toISOString() },
                })
            }
        }
        for (const quotation of quotations) {
            const base = {
                quotationId: quotation.id,
                quotationNumber: quotation.quotationNumber,
                revision: quotation.revision,
            }
            if (quotation.status === 'SENT' && quotation.sentAt) {
                items.push({
                    id: `quotation:${quotation.id}:sent`,
                    type: 'QUOTATION',
                    at: quotation.sentAt.toISOString(),
                    actor: quotation.sentBy ? (byUser.get(quotation.sentBy) ?? null) : null,
                    summary: `Quotation ${quotation.quotationNumber} rev ${quotation.revision} sent`,
                    metadata: { ...base, status: 'SENT' },
                })
            }
            if ((quotation.status === 'ACCEPTED' || quotation.status === 'REJECTED') && quotation.decidedAt) {
                const lost = quotation.status === 'REJECTED'
                items.push({
                    id: `quotation:${quotation.id}:${lost ? 'rejected' : 'accepted'}`,
                    type: 'QUOTATION',
                    at: quotation.decidedAt.toISOString(),
                    actor: quotation.decidedBy ? (byUser.get(quotation.decidedBy) ?? null) : null,
                    summary:
                        `Customer ${lost ? 'rejected' : 'accepted'} quotation ` +
                        `${quotation.quotationNumber} rev ${quotation.revision}` +
                        (lost && quotation.decisionReason ? ` (${quotation.decisionReason})` : ''),
                    metadata: { ...base, status: quotation.status, reason: quotation.decisionReason ?? null },
                })
            }
            if (quotation.status === 'EXPIRED' || quotation.effectiveStatus === 'EXPIRED') {
                items.push({
                    id: `quotation:${quotation.id}:expired`,
                    type: 'QUOTATION',
                    at: (quotation.validUntil ?? quotation.createdAt).toISOString(),
                    actor: null,
                    summary: `Quotation ${quotation.quotationNumber} rev ${quotation.revision} expired`,
                    metadata: { ...base, status: 'EXPIRED', validUntil: quotation.validUntil?.toISOString() ?? null },
                })
            }
        }
        if (order) {
            items.push({
                id: `sales-order:${order.id}`,
                type: 'SALES_ORDER',
                at: order.createdAt.toISOString(),
                actor: null,
                summary: `SD sales order ${order.orderNumber} created (${formatSystemLabel(order.status)})`,
                metadata: { salesOrderId: order.id, orderNumber: order.orderNumber, status: order.status },
            })
        }

        items.sort((a, b) => {
            const time = new Date(b.at).getTime() - new Date(a.at).getTime()
            return time !== 0 ? time : b.id.localeCompare(a.id)
        })

        if (items.length <= limit) return { data: items, nextCursor: null }
        const page = items.slice(0, limit)
        return { data: page, nextCursor: page[page.length - 1].at }
    }

    private async findNote(opportunityId: string, noteId: string) {
        const note = await this.prisma.crmMessage.findFirst({
            where: { id: noteId, opportunityId },
            select: { id: true, kind: true, body: true, authorId: true, createdAt: true, deletedAt: true },
        })
        if (!note) throw new NotFoundException('Note not found')
        return note
    }

    private async assertOpportunity(opportunityId: string) {
        const row = await this.prisma.crmOpportunity.findUnique({
            where: { id: opportunityId },
            select: { id: true, sdSalesOrderId: true },
        })
        if (!row) throw new NotFoundException('Opportunity not found')
        return row
    }

    private async resolveUsers(ids: (string | null | undefined)[]) {
        const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
        const users = unique.length
            ? await this.prisma.user.findMany({ where: { id: { in: unique } }, select: USER_SUMMARY })
            : []
        return new Map<string, UserRef>(users.map((user) => [user.id, user]))
    }

    private async present(rows: CrmMessage[]) {
        const users = await this.resolveUsers(rows.map((r) => r.authorId))
        return rows.map((row) => ({
            ...row,
            author: row.authorId ? (users.get(row.authorId) ?? null) : null,
        }))
    }
}