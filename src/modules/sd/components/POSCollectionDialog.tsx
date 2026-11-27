'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    HiOutlineCash,
    HiOutlineCreditCard,
    HiOutlineDeviceMobile,
    HiOutlineDocumentText,
    HiOutlineGlobeAlt,
    HiOutlineOfficeBuilding,
    HiOutlinePlus,
    HiOutlineTrash,
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
import type { PosTenderInput, PosTenderMethod } from '../types/pos.schema'
import { POS_TENDER_METHODS } from '../types/pos.schema'
import {
    collectPayment,
    newIdempotencyKey,
    type CollectionReceipt,
    type PosReceipt,
} from '../services/posService'
import { listPaymentMethods } from '../services/posPaymentMethodService'

type Props = {
    isOpen: boolean
    receipt: PosReceipt | null
    cashierUserId?: string | null
    posSessionId?: string | null
    onClose: () => void
    onCollected: (result: CollectionReceipt) => void
    formatPrice: (value: number) => string
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

const ICON_MAP: Record<string, React.ReactNode> = {
    HiOutlineCash: <HiOutlineCash />,
    HiOutlineCreditCard: <HiOutlineCreditCard />,
    HiOutlineDeviceMobile: <HiOutlineDeviceMobile />,
    HiOutlineDocumentText: <HiOutlineDocumentText />,
    HiOutlineOfficeBuilding: <HiOutlineOfficeBuilding />,
}

type MethodOption = { method: PosTenderMethod; label: string; icon: React.ReactNode }

const FALLBACK: MethodOption[] = [
    { method: 'CASH', label: 'Cash', icon: <HiOutlineCash /> },
    { method: 'GCASH', label: 'GCash', icon: <HiOutlineDeviceMobile /> },
    { method: 'BANK_TRANSFER', label: 'Bank transfer', icon: <HiOutlineOfficeBuilding /> },
    { method: 'CARD', label: 'Card', icon: <HiOutlineCreditCard /> },
    { method: 'CHEQUE', label: 'Cheque', icon: <HiOutlineDocumentText /> },
]

const POSCollectionDialog = ({
    isOpen,
    receipt,
    cashierUserId,
    posSessionId,
    onClose,
    onCollected,
    formatPrice,
}: Props) => {
    const balance = Number((receipt as Record<string, unknown> | null)?.outstandingBalance ?? 0)
    const [methods, setMethods] = useState<MethodOption[]>(FALLBACK)
    const [method, setMethod] = useState<PosTenderMethod>('CASH')
    const [tenders, setTenders] = useState<PosTenderInput[]>([])
    const [amount, setAmount] = useState('')
    const [cashReceived, setCashReceived] = useState('')
    const [referenceNumber, setReferenceNumber] = useState('')
    const [bankName, setBankName] = useState('')
    const [transactionDate, setTransactionDate] = useState('')
    const [verified, setVerified] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (!isOpen) return
        listPaymentMethods(true)
            .then((records) => {
                if (records.length) {
                    setMethods(
                        records
                            .filter((m) => m.code !== 'SALARY_LOAN')
                            .map((m) => ({
                                method: m.code as PosTenderMethod,
                                label: m.name,
                                icon: ICON_MAP[m.icon ?? ''] ?? <HiOutlineGlobeAlt />,
                            })),
                    )
                }
            })
            .catch(() => {})
        setTenders([])
        setAmount(balance > 0 ? balance.toFixed(2) : '')
        setCashReceived(balance > 0 ? balance.toFixed(2) : '')
        setError(null)
    }, [isOpen, balance])

    const covered = useMemo(
        () => round2(tenders.reduce((s, t) => s + t.amount, 0)),
        [tenders],
    )
    const remaining = round2(balance - covered)

    // Live validation; addPayment repeats it and the server is the authority.
    const amountError = useMemo(() => {
        if (amount.trim() === '') return null
        const value = Number(amount)
        if (!Number.isFinite(value) || value <= 0) {
            return 'Enter an amount greater than zero.'
        }
        if (value > remaining + 0.005) {
            return `${formatPrice(value)} is more than the ${formatPrice(Math.max(0, remaining))} balance still due.`
        }
        return null
    }, [amount, remaining, formatPrice])
    const cashError =
        method === 'CASH' &&
        !amountError &&
        amount.trim() !== '' &&
        cashReceived.trim() !== '' &&
        round2(Number(cashReceived)) < round2(Number(amount)) - 0.005
            ? 'Cash received must be at least the payment amount.'
            : null

    const addPayment = () => {
        const value = Number(amount)
        if (!Number.isFinite(value) || value <= 0) {
            setError('Enter an amount greater than zero.')
            return
        }
        if (value > remaining + 0.005) {
            setError(`This payment exceeds the remaining balance (${formatPrice(remaining)}).`)
            return
        }
        const tender: PosTenderInput = { method, amount: round2(value) }
        if (method === 'CASH') {
            const cash = Number(cashReceived)
            if (!Number.isFinite(cash) || cash < tender.amount) {
                setError('Cash received must be at least the payment amount.')
                return
            }
            tender.tenderAmount = round2(cash)
        }
        if (['GCASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE'].includes(method)) {
            if (!referenceNumber.trim()) {
                setError('Enter the reference number.')
                return
            }
            tender.referenceNumber = referenceNumber.trim()
        }
        if (method === 'BANK_TRANSFER') {
            if (!bankName.trim()) { setError('Enter the bank name.'); return }
            if (!transactionDate.trim()) { setError('Enter the transaction date.'); return }
            tender.bankName = bankName.trim()
            tender.transactionDate = transactionDate.trim()
        }
        if ((method === 'GCASH' || method === 'BANK_TRANSFER') && verified && cashierUserId) {
            tender.verifiedBy = cashierUserId
        }
        setTenders((c) => [...c, tender])
        const newRemaining = round2(remaining - tender.amount)
        setAmount(newRemaining > 0 ? newRemaining.toFixed(2) : '')
        setCashReceived(newRemaining > 0 ? newRemaining.toFixed(2) : '')
        setReferenceNumber('')
        setBankName('')
        setTransactionDate('')
        setVerified(false)
        setError(null)
    }

    const submit = async () => {
        if (!tenders.length) { setError('Add at least one payment.'); return }
        if (!receipt) return
        setSubmitting(true)
        try {
            const result = await collectPayment(receipt.salesOrderId, {
                tenders,
                posSessionId: posSessionId ?? undefined,
                collectedBy: cashierUserId ?? undefined,
                idempotencyKey: newIdempotencyKey('col'),
            })
            toast.push(
                <Notification type="success" title="Payment collected" closable>
                    {formatPrice(result.collectedAmount)} collected. Remaining: {formatPrice(result.remainingBalance)}
                </Notification>,
                { placement: 'top-end' },
            )
            onCollected(result)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Collection failed.')
        } finally {
            setSubmitting(false)
        }
    }

    if (!receipt) return null

    return (
        <Dialog
            isOpen={isOpen}
            width={720}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h5 className="mb-1">Collect Payment</h5>
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                {receipt.receiptNumber} · {receipt.customerName ?? 'Customer'}
            </p>

            {/* Highlighted outstanding due banner */}
            <div className="mb-4 rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 dark:border-amber-500/50 dark:from-amber-500/15 dark:to-orange-500/10">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                            Balance due
                        </div>
                        <div className="mt-0.5 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
                            {formatPrice(balance)}
                        </div>
                    </div>
                    <div className="text-right text-xs text-amber-800/80 dark:text-amber-200/80">
                        <div>Order total {formatPrice(receipt.total)}</div>
                        <div>Paid {formatPrice(round2(receipt.total - balance))}</div>
                    </div>
                </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                <AdaptiveCard className="border border-gray-200 dark:border-gray-700">
                    <div className="text-[10px] font-semibold uppercase text-gray-500">Original total</div>
                    <div className="text-sm font-semibold tabular-nums heading-text">{formatPrice(receipt.total)}</div>
                </AdaptiveCard>
                <AdaptiveCard className="border border-gray-200 dark:border-gray-700">
                    <div className="text-[10px] font-semibold uppercase text-gray-500">Previously paid</div>
                    <div className="text-sm font-semibold tabular-nums text-emerald-600">{formatPrice(round2(receipt.total - balance))}</div>
                </AdaptiveCard>
                <AdaptiveCard className="border-2 border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10">
                    <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Balance due</div>
                    <div className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-300">{formatPrice(balance)}</div>
                </AdaptiveCard>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        {methods.map((m) => (
                            <button
                                key={m.method}
                                type="button"
                                className={classNames(
                                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                                    method === m.method
                                        ? 'border-primary bg-primary-subtle dark:bg-primary/15'
                                        : 'border-gray-200 hover:border-primary dark:border-gray-700',
                                )}
                                onClick={() => setMethod(m.method)}
                            >
                                <span className="text-lg text-gray-600 dark:text-gray-300">{m.icon}</span>
                                <span className="font-semibold heading-text">{m.label}</span>
                            </button>
                        ))}
                    </div>

                    {tenders.length > 0 && (
                        <div className="space-y-2">
                            {tenders.map((t, i) => (
                                <div key={i} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
                                    <div>
                                        <span className="text-sm font-semibold heading-text">{t.method}</span>
                                        <span className="ml-2 text-xs tabular-nums text-gray-500">{formatPrice(t.amount)}</span>
                                    </div>
                                    <Button size="sm" variant="plain" icon={<HiOutlineTrash />} onClick={() => setTenders((c) => c.filter((_, idx) => idx !== i))} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <AdaptiveCard className="border border-gray-200 dark:border-gray-700">
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Amount</label>
                            <NumericInput
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
                                <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                                    {amountError}
                                </p>
                            ) : null}
                        </div>
                        {method === 'CASH' && (
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Cash received</label>
                                <NumericInput
                                    placeholder="0.00"
                                    thousandSeparator=","
                                    decimalScale={2}
                                    fixedDecimalScale
                                    allowNegative={false}
                                    invalid={Boolean(cashError)}
                                    value={cashReceived}
                                    onValueChange={(v) => {
                                        setError(null)
                                        setCashReceived(v.value ?? '')
                                    }}
                                />
                                {cashError ? (
                                    <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                                        {cashError}
                                    </p>
                                ) : null}
                            </div>
                        )}
                        {['GCASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE'].includes(method) && (
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Reference number</label>
                                <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
                            </div>
                        )}
                        {method === 'BANK_TRANSFER' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Bank name</label>
                                    <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Transaction date</label>
                                    <Input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
                                </div>
                            </div>
                        )}
                        {(method === 'GCASH' || method === 'BANK_TRANSFER') && cashierUserId && (
                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    checked={verified}
                                    onChange={(e) => setVerified(e.target.checked)}
                                />
                                Verified by cashier
                            </label>
                        )}
                        {error && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                {error}
                            </div>
                        )}
                        <Button
                            block
                            icon={<HiOutlinePlus />}
                            disabled={Boolean(amountError) || Boolean(cashError)}
                            onClick={addPayment}
                        >
                            Add payment
                        </Button>
                    </div>
                </AdaptiveCard>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <div className="text-[11px] font-semibold uppercase text-gray-500">Collecting</div>
                        <div className="text-base font-semibold tabular-nums heading-text">{formatPrice(covered)}</div>
                    </div>
                    <div>
                        <div className="text-[11px] font-semibold uppercase text-gray-500">Remaining</div>
                        <div className={classNames('text-base font-semibold tabular-nums', remaining > 0.005 ? 'text-amber-600' : 'text-emerald-600')}>
                            {formatPrice(Math.max(0, remaining))}
                        </div>
                    </div>
                    <div>
                        <div className="text-[11px] font-semibold uppercase text-gray-500">After collection</div>
                        <div className={classNames('text-base font-semibold tabular-nums', remaining > 0.005 ? 'text-amber-600' : 'text-emerald-600')}>
                            {formatPrice(Math.max(0, remaining))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
                <Button
                    size="sm"
                    variant="solid"
                    loading={submitting}
                    disabled={!tenders.length}
                    onClick={() => void submit()}
                >
                    {remaining <= 0.005
                        ? 'Settle in full'
                        : `Collect ${formatPrice(covered)}`}
                </Button>
            </div>
        </Dialog>
    )
}

export default POSCollectionDialog
