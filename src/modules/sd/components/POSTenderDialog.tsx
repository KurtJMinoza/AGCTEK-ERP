'use client'

import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
    HiOutlineCash,
    HiOutlineCreditCard,
    HiOutlineDeviceMobile,
    HiOutlineDocumentText,
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
} from '../types/pos.schema'
import { POS_TENDER_METHODS } from '../types/pos.schema'

type POSTenderDialogProps = {
    isOpen: boolean
    /** Preview of the amount due. The server owns the final total. */
    amountDue: number
    /** Signed-in cashier — confirms e-wallet / bank tenders. */
    cashierUserId?: string | null
    /** Customer of the sale; a salary deduction needs a CREDIT account. */
    customerName?: string | null
    customerAccountType?: string | null
    completing?: boolean
    onClose: () => void
    /** Called when the dialog closes (the terminal refocuses the scanner). */
    onAfterClose?: () => void
    onComplete: (tenders: PosTenderInput[]) => void
    formatPrice: (value: number) => string
}

type MethodOption = {
    method: PosTenderMethod
    label: string
    hint: string
    icon: ReactNode
}

/** Labels and hints of the tender methods (the vocabulary comes from SD). */
const METHOD_META: Record<
    PosTenderMethod,
    { label: string; hint: string; icon: ReactNode }
> = {
    CASH: {
        label: 'Cash',
        hint: 'Cash handed over; change is returned',
        icon: <HiOutlineCash />,
    },
    GCASH: {
        label: 'GCash',
        hint: 'Reference number required',
        icon: <HiOutlineDeviceMobile />,
    },
    BANK_TRANSFER: {
        label: 'Bank transfer',
        hint: 'Reference, bank and date required',
        icon: <HiOutlineOfficeBuilding />,
    },
    CARD: {
        label: 'Card',
        hint: 'Card transaction reference required',
        icon: <HiOutlineCreditCard />,
    },
    CHEQUE: {
        label: 'Cheque',
        hint: 'Cheque number required',
        icon: <HiOutlineDocumentText />,
    },
    SALARY_LOAN: {
        label: 'Salary deduction',
        hint: 'Employee number required',
        icon: <HiOutlineUser />,
    },
}

const METHODS: MethodOption[] = POS_TENDER_METHODS.map((method) => ({
    method,
    ...METHOD_META[method],
}))

/** Quick cash denominations offered at the register (PHP). */
const CASH_DENOMINATIONS = [500, 1000, 2000, 5000]

const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

const notify = (type: 'success' | 'danger' | 'info', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const methodLabel = (method: string) =>
    METHODS.find((row) => row.method === method)?.label ?? method

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
const POSTenderDialog = ({
    isOpen,
    amountDue,
    cashierUserId,
    customerName,
    customerAccountType,
    completing = false,
    onClose,
    onAfterClose,
    onComplete,
    formatPrice,
}: POSTenderDialogProps) => {
    const [method, setMethod] = useState<PosTenderMethod>('CASH')
    const [tenders, setTenders] = useState<PosTenderInput[]>([])
    const [amount, setAmount] = useState(() =>
        amountDue > 0 ? amountDue.toFixed(2) : '',
    )
    const [cashReceived, setCashReceived] = useState(() =>
        amountDue > 0 ? amountDue.toFixed(2) : '',
    )
    const [referenceNumber, setReferenceNumber] = useState('')
    const [bankName, setBankName] = useState('')
    const [transactionDate, setTransactionDate] = useState('')
    const [employeeNumber, setEmployeeNumber] = useState('')
    const [payrollReference, setPayrollReference] = useState('')
    const [verified, setVerified] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const covered = useMemo(
        () => round2(tenders.reduce((sum, tender) => sum + tender.amount, 0)),
        [tenders],
    )
    const tendered = useMemo(
        () =>
            round2(
                tenders.reduce(
                    (sum, tender) => sum + (tender.tenderAmount ?? tender.amount),
                    0,
                ),
            ),
        [tenders],
    )
    const remaining = round2(amountDue - covered)
    // The server returns the change of every cash tender (handed over minus
    // what it covers); a split sale may still be fully covered.
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

    /** Restarts the form for a method: the amount covers what is still due. */
    const resetForm = useCallback(
        (next: PosTenderMethod, due: number) => {
            setMethod(next)
            setAmount(due > 0 ? due.toFixed(2) : '')
            setCashReceived(due > 0 ? due.toFixed(2) : '')
            setReferenceNumber('')
            setBankName('')
            setTransactionDate('')
            setEmployeeNumber('')
            setPayrollReference('')
            setVerified(false)
            setError(null)
        },
        [],
    )

    const selectMethod = (next: PosTenderMethod) => resetForm(next, remaining)

    const addPayment = () => {
        const value = Number(amount)
        if (!Number.isFinite(value) || value <= 0) {
            setError('Enter an amount greater than zero.')
            return
        }
        if (value > remaining + 0.005) {
            setError(
                `This payment covers ${formatPrice(value)} but only ${formatPrice(remaining)} is still due.`,
            )
            return
        }

        const tender: PosTenderInput = { method, amount: round2(value) }

        if (method === 'CASH') {
            const cash = Number(cashReceived)
            if (!Number.isFinite(cash) || cash < tender.amount) {
                setError(
                    'Cash received must be at least the amount it covers.',
                )
                return
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
                return
            }
            tender.referenceNumber = referenceNumber.trim()
        }
        if (method === 'BANK_TRANSFER') {
            if (!bankName.trim()) {
                setError('Enter the bank name.')
                return
            }
            if (!transactionDate.trim()) {
                setError('Enter the transaction date.')
                return
            }
            tender.bankName = bankName.trim()
            tender.transactionDate = transactionDate.trim()
        }
        if (method === 'SALARY_LOAN') {
            if (!employeeNumber.trim()) {
                setError('Enter the employee number.')
                return
            }
            tender.employeeNumber = employeeNumber.trim()
            if (payrollReference.trim()) {
                tender.payrollReference = payrollReference.trim()
            }
        }
        if (
            (method === 'GCASH' || method === 'BANK_TRANSFER') &&
            verified &&
            cashierUserId
        ) {
            tender.verifiedBy = cashierUserId
        }

        setTenders((current) => [...current, tender])
        resetForm(method, round2(remaining - tender.amount))
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

    const removeTender = (index: number) =>
        setTenders((current) => current.filter((_, i) => i !== index))

    const complete = () => {
        if (!tenders.length) {
            setError('Add at least one payment method.')
            return
        }
        if (remaining > 0.005) {
            setError(
                `The tenders cover ${formatPrice(covered)} of ${formatPrice(amountDue)}.`,
            )
            return
        }
        onComplete(tenders)
    }

    const selected = METHODS.find((row) => row.method === method)!
    const showVerification =
        (method === 'GCASH' || method === 'BANK_TRANSFER') &&
        Boolean(cashierUserId)

    return (
        <Dialog
            isOpen={isOpen}
            width={880}
            aria={{ labelledby: 'pos-tender-title' }}
            shouldReturnFocusAfterClose={false}
            onAfterClose={onAfterClose}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h5 id="pos-tender-title" className="mb-1">
                Take payment
            </h5>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                {formatPrice(amountDue)} due
                {customerName ? ` · ${customerName}` : ''}. One sale may carry
                several payment methods.
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* LEFT — payment methods and the tenders already taken */}
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        {METHODS.map((row) => (
                            <button
                                key={row.method}
                                type="button"
                                className={classNames(
                                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                                    method === row.method
                                        ? 'border-primary bg-primary-subtle dark:bg-primary/15'
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

                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Payments taken
                            </span>
                            <Tag className="font-semibold tabular-nums">
                                {tenders.length}
                            </Tag>
                        </div>
                        {tenders.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-700">
                                No payment added yet.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {tenders.map((tender, index) => (
                                    <div
                                        key={`${tender.method}-${index}`}
                                        className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-semibold heading-text">
                                                        {methodLabel(tender.method)}
                                                    </span>
                                                    <Tag
                                                        className={classNames(
                                                            'text-[10px] font-semibold',
                                                            expectedTenderStatus(tender)
                                                                .className,
                                                        )}
                                                    >
                                                        {
                                                            expectedTenderStatus(tender)
                                                                .label
                                                        }
                                                    </Tag>
                                                </div>
                                                <div className="text-xs text-gray-500 tabular-nums">
                                                    {formatPrice(tender.amount)}
                                                    {tender.tenderAmount &&
                                                    tender.tenderAmount >
                                                        tender.amount ? (
                                                        <span className="ml-2">
                                                            received{' '}
                                                            {
                                                                formatPrice(
                                                                    tender.tenderAmount,
                                                                )
                                                            } · change{' '}
                                                            {formatPrice(
                                                                round2(
                                                                    tender.tenderAmount -
                                                                        tender.amount,
                                                                ),
                                                            )}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {tender.referenceNumber ? (
                                                    <div className="truncate font-mono text-[11px] text-gray-500">
                                                        {tender.referenceNumber}
                                                    </div>
                                                ) : null}
                                                {tender.employeeNumber ? (
                                                    <div className="truncate text-[11px] text-gray-500">
                                                        Employee{' '}
                                                        {tender.employeeNumber}
                                                    </div>
                                                ) : null}
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

                {/* RIGHT — the form of the selected method and the totals */}
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
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label
                                    htmlFor="pos-tender-amount"
                                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                >
                                    Amount covered
                                </label>
                                <NumericInput
                                    id="pos-tender-amount"
                                    placeholder="0.00"
                                    thousandSeparator=","
                                    decimalScale={2}
                                    fixedDecimalScale
                                    allowNegative={false}
                                    value={amount}
                                    onValueChange={(v) => setAmount(v.value ?? '')}
                                />
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
                                                                        ) || 0) +
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
                                        <p className="mt-1 text-[11px] text-gray-500">
                                            Adds the denomination on top of the
                                            amount covered; the surplus is the
                                            change.
                                        </p>
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
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div>
                                            <label
                                                htmlFor="pos-tender-employee"
                                                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                            >
                                                Employee number
                                            </label>
                                            <Input
                                                id="pos-tender-employee"
                                                value={employeeNumber}
                                                placeholder="e.g. EMP-0142"
                                                onChange={(e) =>
                                                    setEmployeeNumber(
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label
                                                htmlFor="pos-tender-payroll"
                                                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                            >
                                                Payroll reference
                                            </label>
                                            <Input
                                                id="pos-tender-payroll"
                                                value={payrollReference}
                                                placeholder="Optional"
                                                onChange={(e) =>
                                                    setPayrollReference(
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                        A salary deduction is a credit sale: the
                                        customer account must be a CREDIT
                                        account with a credit limit.
                                        {customerName
                                            ? ` ${customerName} is a ${customerAccountType ?? 'NON_CREDIT'} account.`
                                            : ' Pick a CREDIT customer before taking this payment.'}
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
                            {method === 'GCASH' || method === 'BANK_TRANSFER' ? (
                                <p className="text-[11px] text-gray-500">
                                    Without the cashier confirmation the tender
                                    is recorded as pending verification.
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
                                icon={<HiOutlinePlus />}
                                onClick={addPayment}
                            >
                                Add payment
                            </Button>
                        </div>
                    </AdaptiveCard>
                </div>
            </div>

            {/* Totals of the running sale */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Amount due
                        </div>
                        <div className="text-base font-semibold tabular-nums heading-text">
                            {formatPrice(amountDue)}
                        </div>
                    </div>
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
                            Remaining
                        </div>
                        <div
                            className={classNames(
                                'text-base font-semibold tabular-nums',
                                remaining > 0.005
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'heading-text',
                            )}
                        >
                            {formatPrice(Math.max(0, remaining))}
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
                    Preview only — the server adds the tax from the MM tax
                    configuration and owns the final total and the change.
                </p>
            </div>

            <div className="mt-4 flex justify-end gap-2">
                <Button
                    size="sm"
                    onClick={onClose}
                    disabled={completing}
                >
                    Cancel
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    loading={completing}
                    disabled={remaining > 0.005 || !tenders.length}
                    onClick={complete}
                >
                    Complete sale
                </Button>
            </div>
        </Dialog>
    )
}

export default POSTenderDialog
