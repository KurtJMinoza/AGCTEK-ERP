'use client'

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import DatePicker from '@/components/ui/DatePicker'
import { FormItem } from '@/components/ui/Form'
import Alert from '@/components/ui/Alert'
import type { ApOpenItemRow, ApPaymentAllocationInput } from '../../types/accountsPayable'
import { accountsPayableService } from '../../services/accountsPayableService'
import { apAmount } from './apUtils'

type Props = {
    companyId: string
    open: boolean
    supplierId: string
    supplierLabel: string
    currencyCode: string
    initialAllocations: ApPaymentAllocationInput[]
    onClose: () => void
    onSuccess: () => void
}

const ApPaymentDialog = ({
    companyId,
    open,
    supplierId,
    supplierLabel,
    currencyCode,
    initialAllocations,
    onClose,
    onSuccess,
}: Props) => {
    const [paymentDate, setPaymentDate] = useState<Date | null>(new Date())
    const [paymentMethodCode, setPaymentMethodCode] = useState('BANK_TRANSFER')
    const [paymentReference, setPaymentReference] = useState('')
    const [bankAccountId, setBankAccountId] = useState('')
    const [bankApprovalId, setBankApprovalId] = useState('')
    const [allocations, setAllocations] = useState(initialAllocations)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [refLoading, setRefLoading] = useState(false)
    const [bankOptions, setBankOptions] = useState<Array<{ id: string; label: string }>>([])
    const [approvalOptions, setApprovalOptions] = useState<Array<{ id: string; label: string }>>([])

    useEffect(() => {
        if (!open) return
        setAllocations(initialAllocations)
        setError('')
    }, [open, initialAllocations])

    useEffect(() => {
        if (!open || !companyId || !supplierId) return
        setRefLoading(true)
        accountsPayableService
            .fetchReferenceData(companyId, supplierId)
            .then((ref) => {
                setBankOptions(
                    ref.bankGlAccounts.map((row) => ({
                        id: row.id,
                        label: `${row.accountCode} · ${row.accountName}`,
                    })),
                )
                setApprovalOptions(
                    ref.bankApprovals
                        .filter((row) => row.status === 'ACTIVE')
                        .map((row) => ({
                            id: row.id,
                            label: row.supplierBankAccount
                                ? `${row.supplierBankAccount.bankName} · ${row.supplierBankAccount.accountNumber}`
                                : row.id,
                        })),
                )
                if (ref.bankApprovals.find((r) => r.isDefault && r.status === 'ACTIVE')) {
                    const def = ref.bankApprovals.find((r) => r.isDefault && r.status === 'ACTIVE')
                    if (def) setBankApprovalId(def.id)
                }
            })
            .catch(() => undefined)
            .finally(() => setRefLoading(false))
    }, [open, companyId, supplierId])

    const total = useMemo(
        () => allocations.reduce((sum, row) => sum + row.amount, 0),
        [allocations],
    )

    const submit = async () => {
        if (!paymentDate) {
            setError('Payment date is required.')
            return
        }
        if (total <= 0) {
            setError('Allocate at least one positive amount.')
            return
        }
        setLoading(true)
        setError('')
        try {
            await accountsPayableService.postPayment({
                companyId,
                supplierId,
                paymentDate: dayjs(paymentDate).format('YYYY-MM-DD'),
                currencyCode,
                paymentMethodCode: paymentMethodCode.trim() || undefined,
                bankAccountId: bankAccountId || undefined,
                supplierBankApprovalId: bankApprovalId || undefined,
                paymentReference: paymentReference.trim() || undefined,
                allocations,
            })
            onSuccess()
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Payment failed.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog isOpen={open} width={520} onClose={onClose} onRequestClose={onClose}>
            <h4 className="mb-1 text-lg font-semibold heading-text">Post supplier payment</h4>
            <p className="mb-4 text-sm text-gray-500">{supplierLabel}</p>
            {error ? (
                <Alert showIcon className="mb-3" type="danger">
                    {error}
                </Alert>
            ) : null}
            <div className="space-y-3">
                <FormItem label="Payment date" asterisk>
                    <DatePicker
                        size="sm"
                        value={paymentDate}
                        onChange={(d) => setPaymentDate(d)}
                    />
                </FormItem>
                <FormItem label="Payment method">
                    <Input
                        size="sm"
                        value={paymentMethodCode}
                        placeholder="BANK_TRANSFER"
                        onChange={(e) => setPaymentMethodCode(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Reference">
                    <Input
                        size="sm"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                    />
                </FormItem>
                {bankOptions.length ? (
                    <FormItem label="Paying bank G/L (optional)">
                        <select
                            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                            value={bankAccountId}
                            onChange={(e) => setBankAccountId(e.target.value)}
                        >
                            <option value="">— Auto-resolve —</option>
                            {bankOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </FormItem>
                ) : null}
                {approvalOptions.length ? (
                    <FormItem label="Approved supplier bank">
                        <select
                            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                            value={bankApprovalId}
                            disabled={refLoading}
                            onChange={(e) => setBankApprovalId(e.target.value)}
                        >
                            <option value="">— Default —</option>
                            {approvalOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </FormItem>
                ) : null}
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Allocations ({currencyCode})
                    </p>
                    <div className="max-h-40 space-y-2 overflow-y-auto">
                        {allocations.map((row, index) => (
                            <div key={row.openItemId} className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                                    {row.openItemId.slice(-8)}
                                </span>
                                <Input
                                    size="sm"
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    className="w-28"
                                    value={String(row.amount)}
                                    onChange={(e) => {
                                        const amount = Number(e.target.value)
                                        setAllocations((prev) =>
                                            prev.map((p, i) =>
                                                i === index
                                                    ? { ...p, amount: Number.isFinite(amount) ? amount : 0 }
                                                    : p,
                                            ),
                                        )
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                    <p className="mt-2 text-right text-sm font-semibold tabular-nums">
                        Total {currencyCode} {total.toFixed(2)}
                    </p>
                </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
                <Button size="sm" variant="plain" disabled={loading} onClick={onClose}>
                    Cancel
                </Button>
                <Button size="sm" variant="solid" loading={loading} onClick={submit}>
                    Post payment
                </Button>
            </div>
        </Dialog>
    )
}

export default ApPaymentDialog

export function openItemsToPaymentAllocations(
    items: ApOpenItemRow[],
): ApPaymentAllocationInput[] {
    return items.map((row) => ({
        openItemId: row.id,
        amount: apAmount(row.openAmount),
    }))
}