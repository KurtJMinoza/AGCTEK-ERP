import { BadRequestException } from '@nestjs/common'
import {
    POS_TENDER_METHODS,
    POS_TENDER_SETTLEMENT_STATUS,
    type PosTenderMethod,
    type PosTenderVerificationStatus,
} from './pos.constants'

export type PosTenderInput = {
    method: string
    /** Amount applied to the sale. */
    amount: number
    /** Amount handed over (cash may exceed `amount` — the difference is change). */
    tenderAmount?: number
    referenceNumber?: string | null
    provider?: string | null
    bankName?: string | null
    transactionDate?: string | null
    employeeUserId?: string | null
    employeeNumber?: string | null
    employeeName?: string | null
    payrollReference?: string | null
    /** Cashier that confirmed the tender (required to mark a reference verified). */
    verifiedBy?: string | null
}

export type PosTender = {
    method: PosTenderMethod
    amount: number
    tenderAmount: number
    changeAmount: number
    referenceNumber: string | null
    provider: string | null
    bankName: string | null
    transactionDate: Date | null
    employeeNumber: string | null
    employeeName: string | null
    payrollReference: string | null
    verificationStatus: PosTenderVerificationStatus
    status: string
    paidAt: Date | null
}

const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

/** Accept any code that exists in the payment methods table OR the built-in list. */
let _dynamicCodes: Set<string> | null = null
export function setDynamicMethodCodes(codes: string[]) {
    _dynamicCodes = new Set(codes)
}
const isMethod = (value: string): value is PosTenderMethod =>
    (_dynamicCodes?.has(value) ?? false) ||
    (POS_TENDER_METHODS as readonly string[]).includes(value)

const text = (value?: string | null) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

/**
 * Validate and allocate the tenders of one sale.
 *
 * The tenders must cover the amount due. Only cash may hand over more than the
 * allocated amount — the surplus is the change given back to the customer.
 */
export function allocateTenders(
    amountDue: number,
    inputs: PosTenderInput[],
): {
    tenders: PosTender[]
    totalApplied: number
    totalTendered: number
    change: number
} {
    if (!Number.isFinite(amountDue) || amountDue <= 0) {
        throw new BadRequestException('The sale has no payable amount.')
    }
    if (!inputs.length) {
        throw new BadRequestException('Add at least one payment method.')
    }

    const now = new Date()
    let remaining = round2(amountDue)
    const tenders: PosTender[] = []

    inputs.forEach((input, index) => {
        const label = `Payment ${index + 1}`
        if (!isMethod(input.method)) {
            throw new BadRequestException(
                `${label}: ${input.method} is not a supported payment method.`,
            )
        }
        const amount = round2(Number(input.amount))
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new BadRequestException(`${label}: amount must be positive.`)
        }
        if (amount > remaining + 0.005) {
            throw new BadRequestException(
                `${label}: covers ${amount} but only ${remaining} is still due.`,
            )
        }

        const method = input.method
        const referenceNumber = text(input.referenceNumber)
        let verificationStatus: PosTenderVerificationStatus = 'VERIFIED'
        let status: string = POS_TENDER_SETTLEMENT_STATUS.PAID
        let paidAt: Date | null = now
        let tenderAmount = amount
        let changeAmount = 0

        if (method === 'CASH') {
            tenderAmount = round2(
                Number(input.tenderAmount ?? input.amount),
            )
            if (!Number.isFinite(tenderAmount) || tenderAmount < amount) {
                throw new BadRequestException(
                    `${label}: cash received is less than the amount it covers.`,
                )
            }
            changeAmount = round2(tenderAmount - amount)
        } else if (method === 'GCASH') {
            if (!referenceNumber) {
                throw new BadRequestException(
                    `${label}: a GCash reference number is required.`,
                )
            }
            if (!text(input.verifiedBy)) {
                verificationStatus = 'PENDING'
                status = POS_TENDER_SETTLEMENT_STATUS.PENDING_VERIFICATION
                paidAt = null
            }
        } else if (method === 'BANK_TRANSFER') {
            if (!referenceNumber) {
                throw new BadRequestException(
                    `${label}: a bank transaction reference is required.`,
                )
            }
            if (!text(input.bankName)) {
                throw new BadRequestException(`${label}: a bank name is required.`)
            }
            if (!text(input.transactionDate)) {
                throw new BadRequestException(
                    `${label}: the transaction date is required.`,
                )
            }
            if (!text(input.verifiedBy)) {
                verificationStatus = 'PENDING'
                status = POS_TENDER_SETTLEMENT_STATUS.PENDING_VERIFICATION
                paidAt = null
            }
        } else if (method === 'CARD') {
            if (!referenceNumber) {
                throw new BadRequestException(
                    `${label}: the card transaction reference is required.`,
                )
            }
        } else if (method === 'CHEQUE') {
            if (!referenceNumber) {
                throw new BadRequestException(
                    `${label}: the cheque number is required.`,
                )
            }
            verificationStatus = 'PENDING'
            status = POS_TENDER_SETTLEMENT_STATUS.PENDING_VERIFICATION
            paidAt = null
        } else if (method === 'SALARY_LOAN') {
            if (!text(input.employeeName)) {
                throw new BadRequestException(
                    `${label}: the employee full name is required for a salary deduction.`,
                )
            }
            verificationStatus = 'RECEIVABLE'
            status = POS_TENDER_SETTLEMENT_STATUS.UNPAID
            paidAt = null
        }

        remaining = round2(remaining - amount)
        tenders.push({
            method,
            amount,
            tenderAmount,
            changeAmount,
            referenceNumber,
            provider: text(input.provider),
            bankName: text(input.bankName),
            transactionDate: text(input.transactionDate)
                ? new Date(input.transactionDate as string)
                : null,
            employeeNumber: text(input.employeeNumber),
            employeeName: text(input.employeeName),
            payrollReference: text(input.payrollReference),
            verificationStatus,
            status,
            paidAt,
        })
    })

    if (remaining > 0.005) {
        throw new BadRequestException(
            `The tenders cover ${round2(amountDue - remaining)} of ${round2(amountDue)}.`,
        )
    }

    const totalApplied = round2(tenders.reduce((sum, t) => sum + t.amount, 0))
    const totalTendered = round2(
        tenders.reduce((sum, t) => sum + t.tenderAmount, 0),
    )
    const change = round2(tenders.reduce((sum, t) => sum + t.changeAmount, 0))

    return { tenders, totalApplied, totalTendered, change }
}

const tenderMethod = (row: {
    method?: string
    paymentMethod?: string
}) => row.method ?? row.paymentMethod ?? ''

/** Header payment status from captured tenders. */
export function resolvePosOrderPaymentStatus(
    tenders: Array<{
        method?: string
        paymentMethod?: string
        status: string
    }>,
): string {
    if (!tenders.length) return POS_TENDER_SETTLEMENT_STATUS.PENDING_VERIFICATION
    if (tenders.every((t) => t.status === POS_TENDER_SETTLEMENT_STATUS.PAID)) {
        return POS_TENDER_SETTLEMENT_STATUS.PAID
    }
    if (
        tenders.some(
            (t) =>
                tenderMethod(t) === 'SALARY_LOAN' &&
                t.status === POS_TENDER_SETTLEMENT_STATUS.UNPAID,
        )
    ) {
        return POS_TENDER_SETTLEMENT_STATUS.UNPAID
    }
    if (
        tenders.some((t) => t.status !== POS_TENDER_SETTLEMENT_STATUS.PAID)
    ) {
        return POS_TENDER_SETTLEMENT_STATUS.PENDING_VERIFICATION
    }
    return POS_TENDER_SETTLEMENT_STATUS.PAID
}

/**
 * Validate and allocate tenders for a down-payment checkout.
 *
 * Identical logic to `allocateTenders` except the tenders must cover
 * `downPaymentAmount` (not the full order total). The outstanding balance
 * is tracked as a receivable, not fabricated as a tender.
 */
export function allocatePartialTenders(
    orderTotal: number,
    downPaymentAmount: number,
    inputs: PosTenderInput[],
): {
    tenders: PosTender[]
    totalApplied: number
    totalTendered: number
    change: number
    outstandingBalance: number
} {
    if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
        throw new BadRequestException('The sale has no payable amount.')
    }
    const dp = round2(downPaymentAmount)
    if (!Number.isFinite(dp) || dp <= 0) {
        throw new BadRequestException(
            'The down payment must be greater than zero.',
        )
    }
    if (dp > round2(orderTotal) + 0.005) {
        throw new BadRequestException(
            'The down payment cannot exceed the order total.',
        )
    }
    // If the down payment equals the full total, delegate to full-pay path
    if (Math.abs(dp - round2(orderTotal)) <= 0.005) {
        const result = allocateTenders(orderTotal, inputs)
        return { ...result, outstandingBalance: 0 }
    }

    // Validate tenders against the down-payment amount
    const result = allocateTenders(dp, inputs)
    return {
        ...result,
        outstandingBalance: round2(orderTotal - dp),
    }
}
