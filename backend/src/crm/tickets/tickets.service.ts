import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertCustomerExists,
    assertUserExists,
    CRM_CUSTOMER_SUMMARY_SELECT,
} from '../crm-references'
import {
    CreateTicketCommentDto,
    CreateTicketDto,
    ListTicketsQueryDto,
    TICKET_DEFAULT_QUEUE_STATUSES,
    TICKET_PRIORITY_ORDER,
    TicketStatus,
    UpdateTicketDto,
} from './dto/ticket.dto'
import { CrmActivitiesService, overdueTicketWhere } from '../activities/activities.service'

const DEFAULT_PAGE_SIZE = 20

/** CLOSED and CANCELLED are terminal; RESOLVED may be reopened. */
export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
    OPEN: ['IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CANCELLED'],
    IN_PROGRESS: ['OPEN', 'WAITING_CUSTOMER', 'RESOLVED', 'CANCELLED'],
    WAITING_CUSTOMER: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
    RESOLVED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: [],
    CANCELLED: [],
}

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['CLOSED', 'CANCELLED'])

export const ticketInclude = {
    customer: { select: CRM_CUSTOMER_SUMMARY_SELECT },
    _count: { select: { comments: true } },
} satisfies Prisma.CrmTicketInclude

const AUTHOR_SELECT = {
    id: true,
    userName: true,
    firstName: true,
    lastName: true,
} as const

type TicketRow = Prisma.CrmTicketGetPayload<{ include: typeof ticketInclude }>

@Injectable()
export class CrmTicketsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly activities: CrmActivitiesService,
    ) {}

    async list(query: ListTicketsQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE
        const search = query.search?.trim()
        const where: Prisma.CrmTicketWhereInput = {
            ...(query.status
                ? { status: query.status }
                : query.queue === 'ALL'
                  ? {}
                  : { status: { in: [...TICKET_DEFAULT_QUEUE_STATUSES] } }),
            ...(query.priority ? { priority: query.priority } : {}),
            ...(query.category ? { category: query.category } : {}),
            ...(query.customerId ? { customerId: query.customerId } : {}),
            ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
            ...(search
                ? {
                      OR: [
                          { subject: { contains: search, mode: 'insensitive' } },
                          { rmaReference: { contains: search, mode: 'insensitive' } },
                      ],
                  }
                : {}),
            ...(query.activity === 'OVERDUE' ? { AND: [overdueTicketWhere(new Date())] } : {}),
        }

        const { data, total } =
            query.sort === 'newest'
                ? await this.newestPage(where, page, pageSize)
                : await this.priorityPage(where, page, pageSize)
        return {
            data: await this.activities.withNextActivityFor('ticket', data),
            total,
            page,
            pageSize,
        }
    }

    private async newestPage(where: Prisma.CrmTicketWhereInput, page: number, pageSize: number) {
        const [data, total] = await this.prisma.$transaction([
            this.prisma.crmTicket.findMany({
                where,
                include: ticketInclude,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.crmTicket.count({ where }),
        ])
        return { data, total }
    }

    /**
     * Priority is a string column, so URGENT → LOW ordering is done by walking the priority
     * buckets in rank order (one count query + at most one page read per bucket).
     */
    private async priorityPage(where: Prisma.CrmTicketWhereInput, page: number, pageSize: number) {
        const groups = await this.prisma.crmTicket.groupBy({
            by: ['priority'],
            where,
            _count: { _all: true },
        })
        const counts = new Map(groups.map((g) => [g.priority, g._count._all]))
        const total = groups.reduce((sum, g) => sum + g._count._all, 0)

        const data: TicketRow[] = []
        let skip = (page - 1) * pageSize
        for (const priority of TICKET_PRIORITY_ORDER) {
            const remaining = pageSize - data.length
            if (remaining === 0) break
            const count = counts.get(priority) ?? 0
            if (skip >= count) {
                skip -= count
                continue
            }
            data.push(
                ...(await this.prisma.crmTicket.findMany({
                    where: { ...where, priority },
                    include: ticketInclude,
                    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                    skip,
                    take: remaining,
                })),
            )
            skip = 0
        }
        return { data, total }
    }

    async findOne(id: string) {
        const ticket = await this.prisma.crmTicket.findUnique({
            where: { id },
            include: ticketInclude,
        })
        if (!ticket) throw new NotFoundException('Ticket not found')
        return ticket
    }

    async create(dto: CreateTicketDto, userId: string) {
        await assertCustomerExists(this.prisma, dto.customerId)
        if (dto.assignedTo) await assertUserExists(this.prisma, dto.assignedTo)

        return this.prisma.crmTicket.create({
            data: {
                customerId: dto.customerId,
                subject: dto.subject,
                description: dto.description ?? null,
                priority: dto.priority ?? 'MEDIUM',
                category: dto.category ?? 'GENERAL',
                assignedTo: dto.assignedTo ?? null,
                rmaReference: dto.rmaReference || null,
                createdBy: userId,
                updatedBy: userId,
            },
            include: ticketInclude,
        })
    }

    async update(id: string, dto: UpdateTicketDto, userId: string) {
        const current = await this.findOne(id)
        if (TERMINAL_STATUSES.has(current.status)) {
            throw new ConflictException(`${current.status} tickets are read-only`)
        }

        const data: Prisma.CrmTicketUncheckedUpdateManyInput = { updatedBy: userId }
        if (dto.subject !== undefined) data.subject = dto.subject
        if (dto.description !== undefined) data.description = dto.description
        if (dto.priority !== undefined) data.priority = dto.priority
        if (dto.category !== undefined) data.category = dto.category
        // TODO(crm-integration): RMA references are informational; SD Return Authorization owns RMA execution.
        if (dto.rmaReference !== undefined) data.rmaReference = dto.rmaReference || null
        if (dto.assignedTo !== undefined) {
            if (dto.assignedTo) await assertUserExists(this.prisma, dto.assignedTo)
            data.assignedTo = dto.assignedTo
        }
        if (dto.status !== undefined && dto.status !== current.status) {
            const from = current.status as TicketStatus
            if (!TICKET_TRANSITIONS[from]?.includes(dto.status)) {
                throw new BadRequestException(
                    `Cannot move ticket from ${current.status} to ${dto.status}`,
                )
            }
            data.status = dto.status
        }

        if (Object.keys(data).length === 1) {
            throw new BadRequestException('No changes supplied')
        }

        const result = await this.prisma.crmTicket.updateMany({
            where: { id, status: current.status, updatedAt: current.updatedAt },
            data,
        })
        if (result.count === 0) {
            throw new ConflictException('Ticket changed concurrently, reload and retry')
        }
        return this.findOne(id)
    }

    async listComments(ticketId: string) {
        await this.findOne(ticketId)
        const comments = await this.prisma.crmTicketComment.findMany({
            where: { ticketId },
            orderBy: { createdAt: 'asc' },
        })
        return this.withAuthors(comments)
    }

    async addComment(ticketId: string, dto: CreateTicketCommentDto, userId: string) {
        const ticket = await this.findOne(ticketId)
        if (TERMINAL_STATUSES.has(ticket.status)) {
            throw new ConflictException(`Cannot comment on a ${ticket.status} ticket`)
        }
        const comment = await this.prisma.crmTicketComment.create({
            data: { ticketId, body: dto.body, authorId: userId },
        })
        const [withAuthor] = await this.withAuthors([comment])
        return withAuthor
    }

    /** authorId is a plain reference (no FK); resolve display names in one batched read. */
    private async withAuthors<T extends { authorId: string | null }>(comments: T[]) {
        const ids = [...new Set(comments.map((c) => c.authorId).filter((id): id is string => !!id))]
        const users = ids.length
            ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: AUTHOR_SELECT })
            : []
        const byId = new Map(users.map((u) => [u.id, u]))
        return comments.map((c) => ({
            ...c,
            author: c.authorId ? (byId.get(c.authorId) ?? null) : null,
        }))
    }
}
