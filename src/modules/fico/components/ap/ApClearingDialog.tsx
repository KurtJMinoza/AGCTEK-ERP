'use client'

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import DatePicker from '@/components/ui/DatePicker'
import { FormItem } from '@/components/ui/Form'
import Alert from '@/components/ui/Alert'
import type { ApClearingAllocationInput, ApOpenItemRow } from '../../types/accountsPayable'
import { accountsPayableService } from '../../services/accountsPayableService'
import { apAmount, isCreditOpenItem, isPayableOpenItem } from './apUtils'

type Props = {
    companyId: string
    open: boolean
    supplierId: string
    supplierLabel: string
    currencyCode: string
    openItems?: ApOpenItemRow[]
    debitItemId?: string
    creditItemId?: string
    onClose: () => void
    onSuccess: () => void
}

const ApClearingDialog = ({
    companyId,
    open,
    supplierId,
    supplierLabel,
    currencyCode,
    openItems: openItemsProp,
    debitItemId: initialDebitId,
    creditItemId: initialCreditId,
    onClose,
    onSuccess,
}: Props) => {
    const [clearingDate, setClearingDate] = useState<Date | null>(new Date())
    const [reference, setReference] = useState('')
    const [debitItemId, setDebitItemId] = useState(initialDebitId ?? '')
    const [creditItemId, setCreditItemId] = useState(initialCreditId ?? '')
    const [amount, setAmount] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [openItems, setOpenItems] = useState<ApOpenItemRow[]>(openItemsProp ?? [])

    useEffect(() => {
        if (!open) return
        void accountsPayableService
            .fetchOpenItems({ companyId, supplierId })
            .then(setOpenItems)
            .catch(() => setOpenItems(openItemsProp ?? []))
    }, [open, companyId, supplierId, openItemsProp])

    const debitOptions = useMemo(
        () => openItems.filter(isCreditOpenItem),
        [openItems],
    )
    const creditOptions = useMemo(
        () => openItems.filter(isPayableOpenItem),
        [openItems],
    )

    useEffect(() => {
        if (!open) return
        setDebitItemId(initialDebitId ?? '')
        setCreditItemId(initialCreditId ?? '')
        setAmount('')
        setError('')
    }, [open, initialDebitId, initialCreditId])

    useEffect(() => {
        if (!debitItemId || !creditItemId || amount) return
        const debit = openItems.find((r) => r.id === debitItemId)
        const credit = openItems.find((r) => r.id === creditItemId)
        if (!debit || !credit) return
        const suggested = Math.min(apAmount(debit.openAmount), apAmount(credit.openAmount))
        if (suggested > 0) setAmount(String(suggested))
    }, [debitItemId, creditItemId, openItems, amount])

    const submit = async () => {
        if (!clearingDate) {
            setError('Clearing date is required.')
            return
        }
        const amt = Number(amount)
        if (!(amt > 0)) {
            setError('Enter a positive clearing amount.')
            return
        }
        if (!debitItemId || !creditItemId) {
            setError('Select both debit (credit memo / advance) and credit (liability) open items.')
            return
        }
        const allocations: ApClearingAllocationInput[] = [
            { debitOpenItemId: debitItemId, creditOpenItemId: creditItemId, amount: amt },
        ]
        setLoading(true)
        setError('')
        try {
            await accountsPayableService.postClearing({
                companyId,
                supplierId,
                clearingDate: dayjs(clearingDate).format('YYYY-MM-DD'),
                currencyCode,
                reference: reference.trim() || undefined,
                allocations,
            })
            onSuccess()
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Clearing failed.')
        } finally {
            setLoading(false)
        }
    }

    const labelFor = (row: ApOpenItemRow) => {
        const ref = row.document?.referenceNumber ?? row.documentId.slice(-8)
        return `${row.itemType} · ${ref} · ${apAmount(row.openAmount).toFixed(2)}`
    }

    return (
        <Dialog isOpen={open} width={520} onClose={onClose} onRequestClose={onClose}>
            <h4 className="mb-1 text-lg font-semibold heading-text">Post AP clearing</h4>
            <p className="mb-4 text-sm text-gray-500">{supplierLabel}</p>
            {error ? (
                <Alert showIcon className="mb-3" type="danger">
                    {error}
                </Alert>
            ) : null}
            <div className="space-y-3">
                <FormItem label="Clearing date" asterisk>
                    <DatePicker size="sm" value={clearingDate} onChange={(d) => setClearingDate(d)} />
                </FormItem>
                <FormItem label="Reference">
                    <Input size="sm" value={reference} onChange={(e) => setReference(e.target.value)} />
                </FormItem>
                <FormItem label="Debit item (credit memo / advance)" asterisk>
                    <select
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                        value={debitItemId}
                        onChange={(e) => setDebitItemId(e.target.value)}
                    >
                        <option value="">Choose…</option>
                        {debitOptions.map((row) => (
                            <option key={row.id} value={row.id}>
                                {labelFor(row)}
                            </option>
                        ))}
                    </select>
                </FormItem>
                <FormItem label="Credit item (invoice liability)" asterisk>
                    <select
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                        value={creditItemId}
                        onChange={(e) => setCreditItemId(e.target.value)}
                    >
                        <option value="">Choose…</option>
                        {creditOptions.map((row) => (
                            <option key={row.id} value={row.id}>
                                {labelFor(row)}
                            </option>
                        ))}
                    </select>
                </FormItem>
                <FormItem label={`Amount (${currencyCode})`} asterisk>
                    <Input
                        size="sm"
                        type="number"
                        min={0}
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                    />
                </FormItem>
            </div>
            <div className="mt-6 flex justify-end gap-2">
                <Button size="sm" variant="plain" disabled={loading} onClick={onClose}>
                    Cancel
                </Button>
                <Button size="sm" variant="solid" loading={loading} onClick={submit}>
                    Post clearing
                </Button>
            </div>
        </Dialog>
    )
}

export default ApClearingDialog