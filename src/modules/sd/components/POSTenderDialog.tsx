'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
    HiOutlineCash,
    HiOutlineCheckCircle,
    HiOutlineCreditCard,
    HiOutlineDeviceMobile,
    HiOutlineDocumentText,
    HiOutlineGlobeAlt,
    HiOutlineOfficeBuilding,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineUser,
} from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import NumericInput from '@/components/shared/NumericInput'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import Tag from '@/components/ui/Tag'
import toast from '@/components/ui/toast'
import classNames from '@/utils/classNames'
import type {
    PosTenderInput,
    PosTenderMethod,
    PosPaymentMode,
} from '../types/pos.schema'
import { POS_TENDER_METHODS } from '../types/pos.schema'
import {
    listPaymentMethods,
    type PaymentMethod,
} from '../services/posPaymentMethodService'

export type TenderResult = {
    tenders: PosTenderInput[]
    paymentMode?: PosPaymentMode
    downPaymentType?: 'PERCENTAGE' | 'FIXED'
    downPaymentPct?: number
    downPaymentAmount?: number
    /** Charge (pay later) only: the day the customer will pay, YYYY-MM-DD. */
    dueDate?: string
    /** Free-text remarks shown on the complete sales report. */
    remarks?: string
}

type POSTenderDialogProps = {
    isOpen: boolean
    /** Preview of the amount due. The server owns the final total. */
    amountDue: number
    /** Signed-in cashier — confirms e-wallet / bank tenders. */
    cashierUserId?: string | null
    /** Customer of the sale; a salary deduction needs a CREDIT account. */
    customerName?: string | null
    customerAccountType?: string | null
    customerId?: string | null
    completing?: boolean
    onClose: () => void
    /** Called when the dialog closes (the terminal refocuses the scanner). */
    onAfterClose?: () => void
    onComplete: (result: TenderResult) => void
    formatPrice: (value: number) => string
}

type MethodOption = {
    method: PosTenderMethod
    label: string
    hint: string
    icon: ReactNode
}

/** Icon by the icon key stored in the DB; falls back to a globe. */
const ICON_MAP: Record<string, ReactNode> = {
    HiOutlineCash: <HiOutlineCash />,
    HiOutlineCreditCard: <HiOutlineCreditCard />,
    HiOutlineDeviceMobile: <HiOutlineDeviceMobile />,
    HiOutlineDocumentText: <HiOutlineDocumentText />,
    HiOutlineOfficeBuilding: <HiOutlineOfficeBuilding />,
    HiOutlineUser: <HiOutlineUser />,
    HiOutlineGlobeAlt: <HiOutlineGlobeAlt />,
}

/** Hardcoded fallback when the API is unreachable. */
const FALLBACK_METHODS: MethodOption[] = POS_TENDER_METHODS.map((method) => ({
    method,
    ...({
        CASH: { label: 'Cash', hint: 'Cash handed over; change is returned', icon: <HiOutlineCash /> },
        GCASH: { label: 'GCash', hint: 'Reference number required', icon: <HiOutlineDeviceMobile /> },
        BANK_TRANSFER: { label: 'Bank transfer', hint: 'Reference, bank and date required', icon: <HiOutlineOfficeBuilding /> },
        CARD: { label: 'Card', hint: 'Card transaction reference required', icon: <HiOutlineCreditCard /> },
        CHEQUE: { label: 'Cheque', hint: 'Cheque number required', icon: <HiOutlineDocumentText /> },
        SALARY_LOAN: { label: 'Salary deduction', hint: 'Employee full name', icon: <HiOutlineUser /> },
    })[method],
}))

function toMethodOptions(records: PaymentMethod[]): MethodOption[] {
    return records.map((pm) => ({
        method: pm.code as PosTenderMethod,
        label: pm.name,
        hint: pm.description ?? '',
        icon: ICON_MAP[pm.icon ?? ''] ?? <HiOutlineGlobeAlt />,
    }))
}

/** Quick cash denominations offered at the register (PHP). */
const CASH_DENOMINATIONS = [500, 1000, 2000, 5000]

const MODE_OPTIONS: Array<{
    mode: PosPaymentMode
    label: string
    hint: string
}> = [
    {
        mode: 'FULL',
        label: 'Full',
        hint: 'One method covers the total',
    },
    {
        mode: 'SPLIT',
        label: 'Split',
        hint: 'Combine cash, GCash, card…',
    },
    {
        mode: 'DOWN_PAYMENT',
        label: 'Down payment',
        hint: 'Pay part now, balance later',
    },
    {
        mode: 'CHARGE',
        label: 'Charge',
        hint: 'Take the items now, pay later',
    },
]

/** Calendar day in Manila (UTC+8) as YYYY-MM-DD, `daysAhead` days from today. */
const manilaDateIso = (daysAhead = 0) =>
    new Date(Date.now() + 8 * 3_600_000 + daysAhead * 86_400_000)
        .toISOString()
        .slice(0, 10)

/** Quick due dates for a charge sale. */
const CHARGE_DUE_PRESETS = [
    { label: 'Tomorrow', days: 1 },
    { label: '7 days', days: 7 },
    { label: '15 days', days: 15 },
    { label: '30 days', days: 30 },
] as const

const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

const notify = (type: 'success' | 'danger' | 'info', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

/** Settlement the cashier should expect; the server owns the final status. */
const expectedTenderStatus = (tender: PosTenderInput) => {
    switch (tender.method) {
        case 'CASH':
        case 'CARD':
            return { label: 'Paid', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' }
        case 'GCASH':
        case 'BANK_TRANSFER':
            return tender.verifiedBy
                ? { label: 'Paid', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' }
                : {
                      label: 'Pending verification',
                      className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
                  }
        case 'CHEQUE':
            return {
                label: 'Pending clearing',
                className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
            }
        case 'SALARY_LOAN':
            return {
                label: 'Unpaid',
                className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
            }
        default:
            return {
                label: 'Authorized (receivable)',
                className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
            }
    }
}

/**
 * Tender screen: one or more payment methods cover the amount due.
 *
 * The dialog only prepares the tenders — the server owns the totals, the tax
 * and the change, and the receipt renders what the server returned.
 */
const DP_PERCENTAGES = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const

const POSTenderDialog = ({
    isOpen,
    amountDue,
    cashierUserId,
    customerName,
    customerAccountType: _customerAccountType,
    customerId,
    completing = false,
    onClose,
    onAfterClose,
    onComplete,
    formatPrice,
}: POSTenderDialogProps) => {
    const [methods, setMethods] = useState<MethodOption[]>(FALLBACK_METHODS)
    const [method, setMethod] = useState<PosTenderMethod>('CASH')
    const [tenders, setTenders] = useState<PosTenderInput[]>([])

    const [paymentMode, setPaymentMode] = useState<PosPaymentMode>('FULL')
    const [dpType, setDpType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE')
    const [dpPct, setDpPct] = useState(50)
    const [dpCustomAmount, setDpCustomAmount] = useState('')

    // Custom down payment rules: an amount outside (0, order total) is never
    // silently corrected — it is reported and the sale cannot be completed.
    const dpCustomError = useMemo(() => {
        if (paymentMode !== 'DOWN_PAYMENT' || dpType !== 'FIXED') return null
        if (dpCustomAmount.trim() === '') {
            return 'Enter the down payment amount.'
        }
        const custom = round2(Number(dpCustomAmount))
        if (!Number.isFinite(custom) || custom <= 0) {
            return 'The down payment must be greater than zero.'
        }
        if (custom > round2(amountDue) + 0.005) {
            return `The down payment (${formatPrice(custom)}) cannot exceed the order total (${formatPrice(amountDue)}).`
        }
        if (custom >= round2(amountDue) - 0.005) {
            return `The down payment equals the order total (${formatPrice(amountDue)}). Use Full Payment instead, or enter a smaller amount.`
        }
        return null
    }, [paymentMode, dpType, dpCustomAmount, amountDue, formatPrice])

    const effectiveDpAmount = useMemo(() => {
        if (paymentMode !== 'DOWN_PAYMENT') return amountDue
        if (dpType === 'PERCENTAGE') return round2((amountDue * dpPct) / 100)
        if (dpCustomError) return 0
        return round2(Number(dpCustomAmount))
    }, [paymentMode, dpType, dpPct, dpCustomAmount, dpCustomError, amountDue])

    const effectiveAmountDue =
        paymentMode === 'DOWN_PAYMENT' ? effectiveDpAmount : amountDue
    const balanceDue =
        paymentMode === 'DOWN_PAYMENT'
            ? round2(amountDue - effectiveDpAmount)
            : 0

    const [amount, setAmount] = useState(() =>
        amountDue > 0 ? amountDue.toFixed(2) : '',
    )
    const [cashReceived, setCashReceived] = useState(() =>
        amountDue > 0 ? amountDue.toFixed(2) : '',
    )
    const [referenceNumber, setReferenceNumber] = useState('')
    const [bankName, setBankName] = useState('')
    const [transactionDate, setTransactionDate] = useState('')
    const [employeeName, setEmployeeName] = useState('')
    const [verified, setVerified] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [remarks, setRemarks] = useState('')
    // Charge (pay later): the day the customer promises to pay.
    const [chargeDueDate, setChargeDueDate] = useState('')
    // Each sale starts with empty remarks: clear them when the dialog reopens.
    const [wasOpen, setWasOpen] = useState(isOpen)
    if (wasOpen !== isOpen) {
        setWasOpen(isOpen)
        if (isOpen) {
            setRemarks('')
            setChargeDueDate('')
        }
    }

    const methodLabel = (code: string) =>
        methods.find((row) => row.method === code)?.label ?? code

    const methodIcon = (code: string) =>
        methods.find((row) => row.method === code)?.icon ?? <HiOutlineGlobeAlt />

    useEffect(() => {
        if (!isOpen) return
        listPaymentMethods(true)
            .then((records) => {
                if (records.length) setMethods(toMethodOptions(records))
            })
            .catch(() => {})
    }, [isOpen])

    const covered = useMemo(
        () => round2(tenders.reduce((sum, tender) => sum + tender.amount, 0)),
        [tenders],
    )
    const tendered = useMemo(
        () =>
            round2(
                tenders.reduce(
                    (sum, tender) =>
                        sum + (tender.tenderAmount ?? tender.amount),
                    0,
                ),
            ),
        [tenders],
    )
    const remaining = round2(effectiveAmountDue - covered)
    const progressPct =
        effectiveAmountDue > 0
            ? Math.min(100, Math.round((covered / effectiveAmountDue) * 100))
            : 0
    const change = useMemo(
        () =>
            round2(
                tenders.reduce(
                    (sum, tender) =>
                        sum +
                        (tender.method === 'CASH'
                            ? Math.max(
                                  0,
                                  (tender.tenderAmount ?? tender.amount) -
                                      tender.amount,
                              )
                            : 0),
                    0,
                ),
            ),
        [tenders],
    )

    const syncFormToDue = useCallback((due: number, nextMethod?: PosTenderMethod) => {
        if (nextMethod) setMethod(nextMethod)
            setAmount(due > 0 ? due.toFixed(2) : '')
            setCashReceived(due > 0 ? due.toFixed(2) : '')
            setReferenceNumber('')
            setBankName('')
            setTransactionDate('')
        setEmployeeName('')
            setVerified(false)
            setError(null)
    }, [])

    useEffect(() => {
        if (effectiveAmountDue > 0 && tenders.length === 0) {
            setAmount(effectiveAmountDue.toFixed(2))
            setCashReceived(effectiveAmountDue.toFixed(2))
        }
    }, [effectiveAmountDue, tenders.length])

    const selectMethod = (next: PosTenderMethod) => syncFormToDue(remaining, next)

    const setAmountCovering = (value: number) => {
        const next = round2(Math.max(0, Math.min(value, remaining)))
        setAmount(next > 0 ? next.toFixed(2) : '')
        if (method === 'CASH') {
            setCashReceived(next > 0 ? next.toFixed(2) : '')
        }
        setError(null)
    }

    // Live check of the amount being entered; buildTenderFromForm repeats it
    // and the server stays the final authority.
    const amountError = (() => {
        if (amount.trim() === '') return null
        const value = Number(amount)
        if (!Number.isFinite(value) || value <= 0) {
            return 'Enter an amount greater than zero.'
        }
        if (value > remaining + 0.005) {
            return `${formatPrice(value)} is more than the ${formatPrice(Math.max(0, remaining))} still due.`
        }
        return null
    })()

    const buildTenderFromForm = (): PosTenderInput | null => {
        if (dpCustomError) {
            setError(dpCustomError)
            return null
        }
        const value = Number(amount)
        if (!Number.isFinite(value) || value <= 0) {
            setError('Enter an amount greater than zero.')
            return null
        }
        if (value > remaining + 0.005) {
            setError(
                `This payment covers ${formatPrice(value)} but only ${formatPrice(remaining)} is still due.`,
            )
            return null
        }

        const tender: PosTenderInput = { method, amount: round2(value) }

        if (method === 'CASH') {
            const cash = Number(cashReceived)
            if (!Number.isFinite(cash) || cash < tender.amount) {
                setError('Cash received must be at least the amount it covers.')
                return null
            }
            tender.tenderAmount = round2(cash)
        }
        if (
            method === 'GCASH' ||
            method === 'BANK_TRANSFER' ||
            method === 'CARD' ||
            method === 'CHEQUE'
        ) {
            if (!referenceNumber.trim()) {
                setError(
                    method === 'CARD'
                        ? 'Enter the card transaction reference.'
                        : method === 'CHEQUE'
                          ? 'Enter the cheque number.'
                          : 'Enter the reference number.',
                )
                return null
            }
            tender.referenceNumber = referenceNumber.trim()
        }
        if (method === 'BANK_TRANSFER') {
            if (!bankName.trim()) {
                setError('Enter the bank name.')
                return null
            }
            if (!transactionDate.trim()) {
                setError('Enter the transaction date.')
                return null
            }
            tender.bankName = bankName.trim()
            tender.transactionDate = transactionDate.trim()
        }
        if (method === 'SALARY_LOAN') {
            if (!employeeName.trim()) {
                setError('Enter the employee full name.')
                return null
            }
            tender.employeeName = employeeName.trim()
        }
        if (
            (method === 'GCASH' || method === 'BANK_TRANSFER') &&
            verified &&
            cashierUserId
        ) {
            tender.verifiedBy = cashierUserId
        }

        return tender
    }

    const addPayment = () => {
        const tender = buildTenderFromForm()
        if (!tender) return

        const nextRemaining = round2(remaining - tender.amount)
        setTenders((current) => {
            const next = [...current, tender]
            if (next.length >= 2 && paymentMode === 'FULL') {
                setPaymentMode('SPLIT')
            }
            return next
        })
        syncFormToDue(nextRemaining, method)

        if (
            (method === 'GCASH' || method === 'BANK_TRANSFER') &&
            !tender.verifiedBy
        ) {
            notify(
                'info',
                'Pending verification',
                'The tender is recorded as pending until a cashier confirms it.',
            )
        }
    }

    const removeTender = (index: number) => {
        setTenders((current) => {
            const next = current.filter((_, i) => i !== index)
            const nextCovered = round2(
                next.reduce((sum, tender) => sum + tender.amount, 0),
            )
            const nextRemaining = round2(effectiveAmountDue - nextCovered)
            syncFormToDue(nextRemaining, method)
            if (next.length < 2 && paymentMode === 'SPLIT') {
                // stay in Split — cashier may still intend another method
            }
            return next
        })
    }

    const changeMode = (mode: PosPaymentMode) => {
        setPaymentMode(mode)
        setTenders([])
        setError(null)
        const due =
            mode === 'DOWN_PAYMENT'
                ? dpType === 'PERCENTAGE'
                    ? round2((amountDue * dpPct) / 100)
                    : dpCustomError
                      ? 0
                      : round2(Number(dpCustomAmount))
                : amountDue
        syncFormToDue(due > 0 ? due : amountDue, 'CASH')
    }

    const complete = () => {
        if (dpCustomError) {
            setError(dpCustomError)
            return
        }
        if (paymentMode === 'CHARGE') {
            if (!customerId || customerId === 'WALK-IN') {
                setError('A charge sale requires an identified customer.')
                return
            }
            if (!chargeDueDate) {
                setError('Choose when the customer will pay.')
                return
            }
            if (chargeDueDate < manilaDateIso(0)) {
                setError('The due date cannot be in the past.')
                return
            }
            const chargeRemarks = remarks.trim()
            onComplete({
                tenders: [],
                paymentMode: 'CHARGE',
                dueDate: chargeDueDate,
                ...(chargeRemarks ? { remarks: chargeRemarks } : {}),
            })
            return
        }
        let nextTenders = tenders
        if (!nextTenders.length) {
            if (paymentMode === 'SPLIT') {
            setError(
                    'Split payment needs at least two methods — add the first payment, then another for the rest.',
            )
            return
        }
            const tender = buildTenderFromForm()
            if (!tender) return
            nextTenders = [tender]
        }

        const nextCovered = round2(
            nextTenders.reduce((sum, tender) => sum + tender.amount, 0),
        )
        const nextRemaining = round2(effectiveAmountDue - nextCovered)
        if (nextRemaining > 0.005) {
            setError(
                `Still short ${formatPrice(nextRemaining)}. Add another payment or raise the amount.`,
            )
            return
        }
        if (paymentMode === 'SPLIT' && nextTenders.length < 2) {
            setError(
                'Split payment needs at least two methods. Switch to Full if one method covers everything.',
            )
            return
        }
        if (paymentMode === 'DOWN_PAYMENT' && balanceDue > 0) {
            if (!customerId || customerId === 'WALK-IN') {
                setError('A partial payment requires an identified customer.')
                return
            }
        }

        const trimmedRemarks = remarks.trim()
        onComplete({
            tenders: nextTenders,
            paymentMode:
                nextTenders.length >= 2 && paymentMode === 'FULL'
                    ? 'SPLIT'
                    : paymentMode,
            ...(trimmedRemarks ? { remarks: trimmedRemarks } : {}),
            ...(paymentMode === 'DOWN_PAYMENT' && {
                downPaymentType: dpType,
                downPaymentPct: dpType === 'PERCENTAGE' ? dpPct : undefined,
                downPaymentAmount: effectiveDpAmount,
            }),
        })
    }

    const selected = methods.find((row) => row.method === method) ?? methods[0]
    const showVerification =
        (method === 'GCASH' || method === 'BANK_TRANSFER') &&
        Boolean(cashierUserId)
    const formAmount = Number(amount) || 0
    const willLeaveRemaining =
        formAmount > 0 && round2(remaining - formAmount) > 0.005
    const isFinalSlice =
        formAmount > 0 && Math.abs(formAmount - remaining) <= 0.005
    const splitReady = remaining <= 0.005 && tenders.length >= 1

    return (
        <Dialog
            isOpen={isOpen}
            width={920}
            aria={{ labelledby: 'pos-tender-title' }}
            shouldReturnFocusAfterClose={false}
            onAfterClose={onAfterClose}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h5 id="pos-tender-title" className="mb-0.5">
                Take payment
            </h5>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {customerName ? `${customerName} · ` : ''}
                        Order total {formatPrice(amountDue)}
                    </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-right dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        {paymentMode === 'DOWN_PAYMENT'
                            ? 'Collect now'
                            : paymentMode === 'CHARGE'
                              ? 'Charge to customer'
                              : 'To collect'}
                    </div>
                    <div className="text-xl font-bold tabular-nums heading-text">
                        {formatPrice(effectiveAmountDue)}
                    </div>
                </div>
            </div>

            {/* Mode selector */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MODE_OPTIONS.map((option) => (
                    <button
                        key={option.mode}
                        type="button"
                        className={classNames(
                            'rounded-xl border px-3 py-2.5 text-left transition-colors',
                            paymentMode === option.mode
                                ? 'border-primary bg-primary-subtle shadow-sm dark:bg-primary/15'
                                : 'border-gray-200 hover:border-primary/60 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
                        )}
                        onClick={() => changeMode(option.mode)}
                        aria-pressed={paymentMode === option.mode}
                    >
                        <div
                            className={classNames(
                                'text-sm font-semibold',
                                paymentMode === option.mode
                                    ? 'text-primary'
                                    : 'heading-text',
                            )}
                        >
                            {option.label}
                        </div>
                        <div className="text-[11px] text-gray-500">
                            {option.hint}
                        </div>
                    </button>
                ))}
            </div>

            {/* Split progress */}
            {(paymentMode === 'SPLIT' || tenders.length > 0) && (
                <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 dark:border-sky-500/30 dark:bg-sky-500/10">
                    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                                {splitReady
                                    ? 'Split covered'
                                    : tenders.length === 0
                                      ? 'Start the split'
                                      : 'Still to cover'}
                            </div>
                            <div
                                className={classNames(
                                    'text-2xl font-bold tabular-nums',
                                    splitReady
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-sky-800 dark:text-sky-200',
                                )}
                            >
                                {splitReady
                                    ? formatPrice(0)
                                    : formatPrice(Math.max(0, remaining))}
                            </div>
                        </div>
                        <div className="text-right text-xs text-sky-800/80 dark:text-sky-200/80">
                            <div>
                                Paid {formatPrice(covered)} of{' '}
                                {formatPrice(effectiveAmountDue)}
                            </div>
                            <div className="font-semibold tabular-nums">
                                {progressPct}% · {tenders.length} payment
                                {tenders.length === 1 ? '' : 's'}
                            </div>
                        </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-950/50">
                        <div
                            className={classNames(
                                'h-full rounded-full transition-all',
                                splitReady ? 'bg-emerald-500' : 'bg-sky-500',
                            )}
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                    {paymentMode === 'SPLIT' && tenders.length === 0 ? (
                        <p className="mt-2 text-xs text-sky-800 dark:text-sky-200">
                            Add the first method for part of the total, then
                            pick another method for the rest.
                        </p>
                    ) : null}
                    {paymentMode === 'SPLIT' &&
                    tenders.length === 1 &&
                    remaining > 0.005 ? (
                        <p className="mt-2 text-xs text-sky-800 dark:text-sky-200">
                            Next: choose a second method for the remaining{' '}
                            {formatPrice(remaining)}.
                        </p>
                    ) : null}
                </div>
            )}

            {/* Down payment configuration */}
            {paymentMode === 'DOWN_PAYMENT' && (
                <AdaptiveCard className="mb-4 border border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5">
                    <div className="mb-3 flex items-center gap-3">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                className={classNames(
                                    'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                                    dpType === 'PERCENTAGE'
                                        ? 'border-primary bg-primary-subtle text-primary'
                                        : 'border-gray-200 text-gray-600 hover:border-primary dark:border-gray-700 dark:text-gray-300',
                                )}
                                onClick={() => setDpType('PERCENTAGE')}
                            >
                                Percentage
                            </button>
                            <button
                                type="button"
                                className={classNames(
                                    'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                                    dpType === 'FIXED'
                                        ? 'border-primary bg-primary-subtle text-primary'
                                        : 'border-gray-200 text-gray-600 hover:border-primary dark:border-gray-700 dark:text-gray-300',
                                )}
                                onClick={() => setDpType('FIXED')}
                            >
                                Custom Amount
                            </button>
                        </div>
                    </div>

                    {dpType === 'PERCENTAGE' ? (
                        <div className="flex flex-wrap gap-2">
                            {DP_PERCENTAGES.map((pct) => (
                                <button
                                    key={pct}
                                    type="button"
                                    className={classNames(
                                        'rounded-lg border px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors',
                                        dpPct === pct
                                            ? 'border-primary bg-primary text-white'
                                            : 'border-gray-200 text-gray-700 hover:border-primary hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800',
                                    )}
                                    onClick={() => {
                                        setDpPct(pct)
                                        setTenders([])
                                    }}
                                >
                                    {pct}%
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="max-w-xs">
                            <label
                                htmlFor="dp-custom-amount"
                                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
                            >
                                Down payment amount
                            </label>
                            <NumericInput
                                id="dp-custom-amount"
                                placeholder="0.00"
                                thousandSeparator=","
                                decimalScale={2}
                                fixedDecimalScale
                                allowNegative={false}
                                invalid={Boolean(dpCustomError)}
                                value={dpCustomAmount}
                                onValueChange={(v) => {
                                    setDpCustomAmount(v.value ?? '')
                                    setTenders([])
                                    setError(null)
                                }}
                            />
                            {dpCustomError && dpCustomAmount.trim() !== '' ? (
                                <p
                                    role="alert"
                                    className="mt-1 text-xs font-medium text-red-600 dark:text-red-400"
                                >
                                    {dpCustomError}
                                </p>
                            ) : null}
                        </div>
                    )}

                    <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                Order total
                            </div>
                            <div className="text-sm font-semibold tabular-nums heading-text">
                                {formatPrice(amountDue)}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                Down payment
                            </div>
                            <div className="text-sm font-semibold tabular-nums text-primary">
                                {formatPrice(effectiveDpAmount)}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                                Balance due
                            </div>
                            <div className="text-sm font-semibold tabular-nums text-amber-600">
                                {formatPrice(balanceDue)}
                            </div>
                        </div>
                    </div>

                    {(!customerId || customerId === 'WALK-IN') && (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                            A partial payment requires an identified customer.
                            Select or create a customer first.
                        </div>
                    )}
                </AdaptiveCard>
            )}

            {/* Charge (pay later): no tender, just the due date */}
            {paymentMode === 'CHARGE' && (
                <AdaptiveCard className="mb-4 border border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5">
                    <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                        The customer takes the items now and nothing is
                        collected at the register. The full{' '}
                        <span className="font-semibold tabular-nums heading-text">
                            {formatPrice(amountDue)}
                        </span>{' '}
                        becomes a receivable that can be paid in full, or in
                        parts (e.g. a down payment tomorrow), from the POS
                        transactions screen.
                    </p>

                    <label
                        htmlFor="pos-charge-due-date"
                        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                        Customer will pay by
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-44">
                            <Input
                                id="pos-charge-due-date"
                                type="date"
                                min={manilaDateIso(0)}
                                value={chargeDueDate}
                                invalid={Boolean(error) && !chargeDueDate}
                                onChange={(e) => {
                                    setChargeDueDate(e.target.value)
                                    setError(null)
                                }}
                            />
                        </div>
                        {CHARGE_DUE_PRESETS.map((preset) => {
                            const iso = manilaDateIso(preset.days)
                            return (
                                <button
                                    key={preset.days}
                                    type="button"
                                    className={classNames(
                                        'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                                        chargeDueDate === iso
                                            ? 'border-primary bg-primary text-white'
                                            : 'border-gray-200 text-gray-700 hover:border-primary hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800',
                                    )}
                                    onClick={() => {
                                        setChargeDueDate(iso)
                                        setError(null)
                                    }}
                                >
                                    {preset.label}
                                </button>
                            )
                        })}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                Collect now
                            </div>
                            <div className="text-sm font-semibold tabular-nums heading-text">
                                {formatPrice(0)}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                                Balance due
                            </div>
                            <div className="text-sm font-semibold tabular-nums text-amber-600">
                                {formatPrice(amountDue)}
                            </div>
                        </div>
                    </div>

                    {(!customerId || customerId === 'WALK-IN') && (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                            A charge sale requires an identified customer.
                            Select or create a customer first.
                        </div>
                    )}
                    {error ? (
                        <p
                            role="alert"
                            className="mt-2 text-xs font-medium text-red-600 dark:text-red-400"
                        >
                            {error}
                        </p>
                    ) : null}
                </AdaptiveCard>
            )}

            {paymentMode !== 'CHARGE' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                {/* LEFT — methods + taken payments */}
                <div className="space-y-3">
                    <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            {paymentMode === 'SPLIT' && tenders.length === 1
                                ? 'Second method'
                                : 'Payment method'}
                        </div>
                    <div className="grid grid-cols-2 gap-2">
                        {methods.map((row) => (
                            <button
                                key={row.method}
                                type="button"
                                className={classNames(
                                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                                    method === row.method
                                            ? 'border-primary bg-primary-subtle ring-1 ring-primary/30 dark:bg-primary/15'
                                        : 'border-gray-200 hover:border-primary hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
                                )}
                                onClick={() => selectMethod(row.method)}
                                aria-pressed={method === row.method}
                            >
                                <span className="shrink-0 text-lg text-gray-600 dark:text-gray-300">
                                    {row.icon}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold heading-text">
                                        {row.label}
                                    </span>
                                    <span className="block truncate text-[11px] text-gray-500">
                                        {row.hint}
                                    </span>
                                </span>
                            </button>
                        ))}
                        </div>
                    </div>

                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Payments in this sale
                            </span>
                            <Tag className="font-semibold tabular-nums">
                                {tenders.length}
                            </Tag>
                        </div>
                        {tenders.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 px-3 py-5 text-center text-sm text-gray-500 dark:border-gray-700">
                                {paymentMode === 'SPLIT'
                                    ? 'No split lines yet — add the first amount on the right.'
                                    : paymentMode === 'FULL'
                                      ? 'Full pay can complete from the form, or add a line first.'
                                      : 'Add payments that cover the down payment.'}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {tenders.map((tender, index) => (
                                    <div
                                        key={`${tender.method}-${index}`}
                                        className="rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex min-w-0 items-start gap-2.5">
                                                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold tabular-nums text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                                                    {index + 1}
                                                </span>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-base text-gray-500">
                                                            {methodIcon(
                                                                tender.method,
                                                            )}
                                                        </span>
                                                    <span className="text-sm font-semibold heading-text">
                                                            {methodLabel(
                                                                tender.method,
                                                            )}
                                                    </span>
                                                    <Tag
                                                        className={classNames(
                                                            'text-[10px] font-semibold',
                                                                expectedTenderStatus(
                                                                    tender,
                                                                ).className,
                                                        )}
                                                    >
                                                        {
                                                                expectedTenderStatus(
                                                                    tender,
                                                                ).label
                                                        }
                                                    </Tag>
                                                </div>
                                                    <div className="mt-0.5 text-sm font-semibold tabular-nums heading-text">
                                                        {formatPrice(
                                                            tender.amount,
                                                        )}
                                                    </div>
                                                    {tender.tenderAmount &&
                                                    tender.tenderAmount >
                                                        tender.amount ? (
                                                        <div className="text-[11px] text-gray-500 tabular-nums">
                                                            Received{' '}
                                                            {formatPrice(
                                                                    tender.tenderAmount,
                                                            )}{' '}
                                                            · change{' '}
                                                            {formatPrice(
                                                                round2(
                                                                    tender.tenderAmount -
                                                                        tender.amount,
                                                                ),
                                                            )}
                                                </div>
                                                    ) : null}
                                                {tender.referenceNumber ? (
                                                    <div className="truncate font-mono text-[11px] text-gray-500">
                                                            {
                                                                tender.referenceNumber
                                                            }
                                                    </div>
                                                ) : null}
                                                    {tender.employeeName ? (
                                                    <div className="truncate text-[11px] text-gray-500">
                                                        Employee{' '}
                                                            {
                                                                tender.employeeName
                                                            }
                                                    </div>
                                                ) : null}
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="plain"
                                                aria-label={`Remove ${methodLabel(tender.method)}`}
                                                icon={<HiOutlineTrash />}
                                                onClick={() =>
                                                    removeTender(index)
                                                }
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT — form */}
                <div className="space-y-3">
                    <AdaptiveCard className="border border-gray-200 dark:border-gray-700">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="text-lg text-gray-600 dark:text-gray-300">
                                    {selected.icon}
                                </span>
                                <div>
                                    <div className="text-sm font-semibold heading-text">
                                        {selected.label}
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                        {selected.hint}
                                    </div>
                                </div>
                            </div>
                            {remaining > 0.005 ? (
                                <Tag className="bg-amber-100 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                                    Left {formatPrice(remaining)}
                                </Tag>
                            ) : (
                                <Tag className="bg-emerald-100 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                    <span className="inline-flex items-center gap-1">
                                        <HiOutlineCheckCircle /> Covered
                                    </span>
                                </Tag>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label
                                    htmlFor="pos-tender-amount"
                                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                >
                                    Amount this method covers
                                </label>
                                <NumericInput
                                    id="pos-tender-amount"
                                    placeholder="0.00"
                                    thousandSeparator=","
                                    decimalScale={2}
                                    fixedDecimalScale
                                    allowNegative={false}
                                    invalid={Boolean(amountError)}
                                    value={amount}
                                    onValueChange={(v) => {
                                        setError(null)
                                        setAmount(v.value ?? '')
                                    }}
                                />
                                {amountError ? (
                                    <p
                                        role="alert"
                                        className="mt-1 text-xs font-medium text-red-600 dark:text-red-400"
                                    >
                                        {amountError}
                                    </p>
                                ) : null}
                                {remaining > 0.005 ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <Button
                                            size="xs"
                                            variant={
                                                isFinalSlice
                                                    ? 'solid'
                                                    : 'default'
                                            }
                                            onClick={() =>
                                                setAmountCovering(remaining)
                                            }
                                        >
                                            All remaining (
                                            {formatPrice(remaining)})
                                        </Button>
                                        {remaining > 1 ? (
                                            <Button
                                                size="xs"
                                                onClick={() =>
                                                    setAmountCovering(
                                                        remaining / 2,
                                                    )
                                                }
                                            >
                                                Half (
                                                {formatPrice(
                                                    round2(remaining / 2),
                                                )}
                                                )
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            {method === 'CASH' ? (
                                <>
                                    <div>
                                        <label
                                            htmlFor="pos-tender-cash"
                                            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                        >
                                            Cash received
                                        </label>
                                        <NumericInput
                                            id="pos-tender-cash"
                                            placeholder="0.00"
                                            thousandSeparator=","
                                            decimalScale={2}
                                            fixedDecimalScale
                                            allowNegative={false}
                                            value={cashReceived}
                                            onValueChange={(v) =>
                                                setCashReceived(v.value ?? '')
                                            }
                                        />
                                    </div>
                                    <div>
                                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Quick cash
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() =>
                                                    setCashReceived(
                                                        amount || '0',
                                                    )
                                                }
                                            >
                                                Exact
                                            </Button>
                                            {CASH_DENOMINATIONS.map(
                                                (denomination) => (
                                                    <Button
                                                        key={denomination}
                                                        size="sm"
                                                        onClick={() =>
                                                            setCashReceived(
                                                                String(
                                                                    round2(
                                                                        (Number(
                                                                            amount,
                                                                        ) ||
                                                                            0) +
                                                                            denomination,
                                                                    ),
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        +{denomination}
                                                    </Button>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : null}

                            {method === 'GCASH' ||
                            method === 'BANK_TRANSFER' ||
                            method === 'CARD' ||
                            method === 'CHEQUE' ? (
                                <div>
                                    <label
                                        htmlFor="pos-tender-reference"
                                        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                    >
                                        {method === 'CARD'
                                            ? 'Card transaction reference'
                                            : method === 'CHEQUE'
                                              ? 'Cheque number'
                                              : 'Reference number'}
                                    </label>
                                    <Input
                                        id="pos-tender-reference"
                                        value={referenceNumber}
                                        placeholder={
                                            method === 'CHEQUE'
                                                ? 'e.g. 004512'
                                                : 'e.g. 1234567890'
                                        }
                                        onChange={(e) =>
                                            setReferenceNumber(e.target.value)
                                        }
                                    />
                                </div>
                            ) : null}

                            {method === 'BANK_TRANSFER' ? (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label
                                            htmlFor="pos-tender-bank"
                                            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                        >
                                            Bank name
                                        </label>
                                        <Input
                                            id="pos-tender-bank"
                                            value={bankName}
                                            placeholder="e.g. BPI"
                                            onChange={(e) =>
                                                setBankName(e.target.value)
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="pos-tender-date"
                                            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                        >
                                            Transaction date
                                        </label>
                                        <Input
                                            id="pos-tender-date"
                                            type="date"
                                            value={transactionDate}
                                            onChange={(e) =>
                                                setTransactionDate(
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    </div>
                                </div>
                            ) : null}

                            {method === 'SALARY_LOAN' ? (
                                <>
                                        <div>
                                            <label
                                                htmlFor="pos-tender-employee"
                                                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                            >
                                            Employee full name
                                            </label>
                                            <Input
                                                id="pos-tender-employee"
                                            value={employeeName}
                                            placeholder="e.g. Juan Dela Cruz"
                                                onChange={(e) =>
                                                setEmployeeName(e.target.value)
                                            }
                                        />
                                    </div>
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                        Recorded as Unpaid until payroll
                                        collects it. Enter the employee full
                                        name only.
                                    </div>
                                </>
                            ) : null}

                            {showVerification ? (
                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        checked={verified}
                                        onChange={(e) =>
                                            setVerified(e.target.checked)
                                        }
                                    />
                                    Verified by the cashier
                                </label>
                            ) : null}
                            {method === 'GCASH' ||
                            method === 'BANK_TRANSFER' ? (
                                <p className="text-[11px] text-gray-500">
                                    Without confirmation this tender stays
                                    pending verification.
                                </p>
                            ) : null}

                            {error ? (
                                <div
                                    role="alert"
                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                                >
                                    {error}
                                </div>
                            ) : null}

                            <Button
                                block
                                variant={
                                    willLeaveRemaining ? 'default' : 'solid'
                                }
                                icon={<HiOutlinePlus />}
                                disabled={
                                    remaining <= 0.005 ||
                                    Boolean(dpCustomError) ||
                                    Boolean(amountError)
                                }
                                onClick={addPayment}
                            >
                                {remaining <= 0.005
                                    ? 'Nothing left to add'
                                    : willLeaveRemaining
                                      ? `Add ${selected.label} · leave ${formatPrice(round2(remaining - formAmount))}`
                                      : isFinalSlice && tenders.length > 0
                                        ? `Add final ${selected.label}`
                                        : `Add ${selected.label}`}
                            </Button>
                        </div>
                    </AdaptiveCard>

                    <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                        <div className="grid grid-cols-2 gap-3">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Tendered
                        </div>
                        <div className="text-base font-semibold tabular-nums heading-text">
                            {formatPrice(tendered)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Change
                        </div>
                        <div className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatPrice(change)}
                        </div>
                    </div>
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                            Preview only — the server owns tax, final total and
                            change.
                </p>
            </div>
                </div>
            </div>
            )}

            <div className="mt-4">
                <label
                    htmlFor="pos-payment-remarks"
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                >
                    Remarks
                </label>
                <Input
                    id="pos-payment-remarks"
                    textArea
                    rows={2}
                    maxLength={500}
                    value={remarks}
                    placeholder="Optional note for this sale (shows on the complete sales report)"
                    onChange={(e) => setRemarks(e.target.value)}
                />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                    {paymentMode === 'CHARGE'
                        ? 'No payment is taken now; the items are released and the amount is owed.'
                        : paymentMode === 'SPLIT' && !splitReady
                        ? `Cover the remaining ${formatPrice(Math.max(0, remaining))} to complete.`
                        : paymentMode === 'FULL' && tenders.length === 0
                          ? 'One method can complete the sale without adding a line first.'
                          : null}
                </div>
                <div className="flex gap-2">
                    <Button size="sm" onClick={onClose} disabled={completing}>
                    Cancel
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    loading={completing}
                        disabled={
                            completing ||
                            Boolean(dpCustomError) ||
                            (paymentMode === 'SPLIT'
                                ? remaining > 0.005 || tenders.length < 2
                                : remaining > 0.005 && tenders.length > 0)
                        }
                    onClick={complete}
                >
                        {paymentMode === 'CHARGE'
                            ? `Charge ${formatPrice(amountDue)} to customer`
                            : paymentMode === 'DOWN_PAYMENT' && balanceDue > 0
                            ? `Complete · balance ${formatPrice(balanceDue)}`
                            : paymentMode === 'SPLIT'
                              ? splitReady && tenders.length >= 2
                                  ? 'Complete split sale'
                                  : 'Complete split sale'
                              : 'Complete sale'}
                </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default POSTenderDialog
