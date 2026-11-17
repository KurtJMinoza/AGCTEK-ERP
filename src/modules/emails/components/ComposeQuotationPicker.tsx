'use client'

import { useEffect, useMemo, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { formatDate, formatMoney } from '@/modules/crm/utils/format'
import { getCustomers, type Customer } from '@/modules/sd/services/customerMasterService'
import {
    listQuotations,
    type Quotation,
} from '@/modules/sd/services/quotationService'

const EMAILABLE = new Set(['SENT', 'ACCEPTED'])

type ComposeQuotationPickerProps = {
    open: boolean
    onClose: () => void
    onSelect: (quotation: Quotation) => void
}

/** Pick a SENT / ACCEPTED quotation to open the Gmail-style composer. */
export default function ComposeQuotationPicker({
    open,
    onClose,
    onSelect,
}: ComposeQuotationPickerProps) {
    const [rows, setRows] = useState<Quotation[]>([])
    const [customers, setCustomers] = useState<Map<string, Customer>>(new Map())
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (!open) return
        let active = true
        setLoading(true)
        setError(null)
        setSearch('')
        Promise.all([
            listQuotations({ limit: 100 }),
            getCustomers().catch(() => [] as Customer[]),
        ])
            .then(([quotations, customerRows]) => {
                if (!active) return
                setRows(
                    quotations.filter(
                        (q) =>
                            EMAILABLE.has(q.effectiveStatus) && !q.isExpired,
                    ),
                )
                setCustomers(
                    new Map(
                        customerRows.map((customer) => [customer.id, customer]),
                    ),
                )
            })
            .catch((err) => {
                if (!active) return
                setRows([])
                setError(
                    getApiErrorMessage(
                        err,
                        'Unable to load quotations for compose',
                    ),
                )
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [open])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return rows
        return rows.filter((row) => {
            const customer = customers.get(row.customerId)
            const haystack = [
                row.quotationNumber,
                String(row.revision),
                row.effectiveStatus,
                customer?.companyName,
                customer?.contactName,
                customer?.email,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
            return haystack.includes(q)
        })
    }, [rows, customers, search])

    return (
        <FormDialog
            isOpen={open}
            onClose={onClose}
            size="lg"
            title="Compose"
            description="Choose a sent or accepted quotation. The PDF is attached automatically."
            footer={
                <Button type="button" onClick={onClose}>
                    Cancel
                </Button>
            }
        >
            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}
            <Input
                className="mb-4"
                placeholder="Search by quotation, customer, or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={loading}
            />
            {loading ? (
                <p className="py-6 text-center text-sm text-gray-500">
                    Loading quotations…
                </p>
            ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">
                    {rows.length === 0
                        ? 'No sent or accepted quotations are ready to email.'
                        : 'No quotations match that search.'}
                </p>
            ) : (
                <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
                    {filtered.map((quotation) => {
                        const customer = customers.get(quotation.customerId)
                        const alreadyEmailed = Boolean(quotation.lastEmailedAt)
                        return (
                            <li key={quotation.id}>
                                <button
                                    type="button"
                                    className="flex w-full flex-col gap-1 rounded-lg border border-gray-200 px-3 py-3 text-left transition hover:border-primary hover:bg-primary/5 dark:border-gray-600 dark:hover:border-primary"
                                    onClick={() => onSelect(quotation)}
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold">
                                            {quotation.quotationNumber}
                                            <span className="text-gray-400">
                                                {' '}
                                                · rev {quotation.revision}
                                            </span>
                                        </span>
                                        <StatusBadge tone="info">
                                            {quotation.effectiveStatus}
                                        </StatusBadge>
                                        {alreadyEmailed ? (
                                            <StatusBadge tone="success">
                                                Previously emailed
                                            </StatusBadge>
                                        ) : null}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-300">
                                        {customer?.companyName ??
                                            'Unknown customer'}
                                        {customer?.email
                                            ? ` · ${customer.email}`
                                            : ' · no email on file'}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        {formatMoney(
                                            Number(quotation.totalAmount),
                                            quotation.currency,
                                        )}
                                        {quotation.validUntil
                                            ? ` · valid until ${formatDate(quotation.validUntil)}`
                                            : ''}
                                        {alreadyEmailed
                                            ? ` · last emailed ${formatDate(quotation.lastEmailedAt)}`
                                            : ''}
                                    </div>
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}
        </FormDialog>
    )
}
