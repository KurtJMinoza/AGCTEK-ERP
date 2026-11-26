import { Prisma } from '@prisma/client'
import { CRM_BUSINESS_TIME_ZONE } from '../activities/activity-status'
import { OPPORTUNITY_OPEN_STAGES } from '../opportunities/dto/opportunity.dto'

export const CADENCE_LIST_LIMIT = 20

/** Asia/Manila has no DST; midnight local = UTC−8h from that calendar date. */
export function businessDayBounds(now: Date, timeZone = CRM_BUSINESS_TIME_ZONE) {
    const day = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now)
    const [y, m, d] = day.split('-').map(Number)
    if (timeZone !== 'Asia/Manila') {
        const start = new Date(Date.UTC(y, m - 1, d))
        return { start, nextStart: new Date(start.getTime() + 24 * 60 * 60 * 1000), day }
    }
    const start = new Date(Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000)
    return { start, nextStart: new Date(start.getTime() + 24 * 60 * 60 * 1000), day }
}

/** Open activities due later today (not overdue), matching classifyDueAt → DUE_TODAY. */
export function dueTodayActivityWhere(now: Date): Prisma.CrmActivityWhereInput {
    const { nextStart } = businessDayBounds(now)
    return {
        doneAt: null,
        dueAt: { gte: now, lt: nextStart },
    }
}

function cadenceActivityParentGuard(): Prisma.CrmActivityWhereInput {
    return {
        OR: [
            { opportunity: { stage: { in: [...OPPORTUNITY_OPEN_STAGES] } } },
            { ticket: { status: { notIn: ['CLOSED', 'CANCELLED'] } } },
            { lead: { status: { notIn: ['CONVERTED'] } } },
        ],
    }
}

export function cadenceOverdueWhere(
    now: Date,
    assignedTo?: string,
): Prisma.CrmActivityWhereInput {
    return {
        doneAt: null,
        dueAt: { lt: now },
        ...(assignedTo ? { assignedTo } : {}),
        AND: [cadenceActivityParentGuard()],
    }
}

export function cadenceDueTodayWhere(
    now: Date,
    assignedTo?: string,
): Prisma.CrmActivityWhereInput {
    return {
        ...dueTodayActivityWhere(now),
        ...(assignedTo ? { assignedTo } : {}),
        AND: [cadenceActivityParentGuard()],
    }
}
