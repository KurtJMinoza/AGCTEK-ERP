import { BadRequestException } from '@nestjs/common'

/**
 * Rules of a POS charge sale ("get now, pay later").
 *
 * A charge sale releases the goods at the register but takes no payment: the
 * whole total becomes a POS receivable that the existing collection flow
 * settles later, in one or several payments (that is also how a customer
 * "pays a down payment tomorrow"). The helpers here are pure so the rules are
 * unit tested without a database.
 */

export const POS_CHARGE_PAYMENT_METHOD = 'CHARGE'

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

/** Start (UTC instant) of the calendar day of `now` in Manila. */
const startOfManilaDay = (now: Date) =>
    new Date(
        Math.floor((now.getTime() + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS -
            MANILA_OFFSET_MS,
    )

/**
 * The due date of a charge sale: required, a valid date, and not before today
 * (a customer cannot be charged with a payment date that already passed).
 */
export function resolveChargeDueDate(
    raw: string | null | undefined,
    now: Date = new Date(),
): Date {
    const text = raw?.trim()
    if (!text) {
        throw new BadRequestException(
            'A charge sale needs a due date: choose when the customer will pay.',
        )
    }
    const due = new Date(text)
    if (Number.isNaN(due.getTime())) {
        throw new BadRequestException('The due date is not a valid date.')
    }
    // A plain date (2026-11-25) is read as UTC midnight; compare it to the
    // Manila day it falls in so "today" is always accepted.
    const dueDay = startOfManilaDay(
        /^\d{4}-\d{2}-\d{2}$/.test(text)
            ? new Date(due.getTime() + 12 * 60 * 60 * 1000)
            : due,
    )
    if (dueDay.getTime() < startOfManilaDay(now).getTime()) {
        throw new BadRequestException(
            'The due date cannot be in the past.',
        )
    }
    return due
}

export type ChargeCustomer = {
    id: string
    customerAccountType?: string | null
    creditLimit?: { toString(): string } | number | null
}

/**
 * Who may be charged: an identified customer of the Customer Master.
 * A CREDIT account is held to its credit limit: what the customer already
 * owes on open POS receivables plus this sale may not exceed the limit.
 * A NON_CREDIT customer carries no limit (the cashier vouches for them).
 */
export function assertChargeAllowed(args: {
    customer: ChargeCustomer | null
    total: number
    /** Open POS receivable balance the customer already owes. */
    openExposure: number
}): void {
    const { customer, total, openExposure } = args
    if (!customer || customer.id === 'WALK-IN') {
        throw new BadRequestException(
            'A charge sale requires an identified customer. Select or create a customer before charging.',
        )
    }
    if (customer.customerAccountType !== 'CREDIT') return

    const limit = Number(customer.creditLimit ?? 0)
    const available = round2(limit - openExposure)
    if (round2(total) > available + 0.005) {
        throw new BadRequestException(
            `Credit limit exceeded: ₱${Math.max(0, available).toFixed(2)} available, ₱${round2(total).toFixed(2)} required.`,
        )
    }
}
