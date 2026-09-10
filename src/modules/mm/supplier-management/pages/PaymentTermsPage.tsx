'use client'

import { useMemo } from 'react'
import { type ColumnDef } from '@/components/shared/DataTable'
import RefCrudPage from '@/modules/mm/material-master/components/RefCrudPage'
import type { RefCrudField } from '@/modules/mm/material-master/components/RefCrudPage'
import { paymentTermsService } from '../services/paymentTermsService'
import type { PaymentTerms } from '../types'

const ROUTE_PATH = '/modules/mm/supplier-management/payment-terms'

const fields: RefCrudField[] = [
    { key: 'code', label: 'Code', autoGenerate: true, autoGenerateHint: 'Auto-generated (e.g. PT-000001)' },
    { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Net 30, Due on Receipt, 2/10 Net 30' },
    { key: 'description', label: 'Description', placeholder: 'e.g. Payment due within 30 days of invoice date' },
    { key: 'dueDays', label: 'Due Days', required: true, type: 'number', placeholder: 'e.g. 30', helpText: 'Number of days after the invoice date when payment is due.' },
    { key: 'discountDays', label: 'Discount Days', type: 'number', placeholder: 'e.g. 10', helpText: 'Optional early-payment window (e.g. pay within 10 days for a discount).' },
    { key: 'discountPercent', label: 'Discount %', type: 'number', placeholder: 'e.g. 2', helpText: 'Optional discount percent if paid within the discount days.' },
]

const PaymentTermsPage = () => {
    const columns = useMemo<ColumnDef<PaymentTerms>[]>(
        () => [
            { header: 'Code', accessorKey: 'code', size: 120 },
            { header: 'Name', accessorKey: 'name', size: 200 },
            { header: 'Description', accessorKey: 'description', cell: ({ row }) => <span>{row.original.description || '—'}</span> },
            { header: 'Due Days', accessorKey: 'dueDays', size: 100 },
            {
                header: 'Discount',
                id: 'discount',
                cell: ({ row }) => {
                    const p = row.original
                    if (!p.discountDays) return <span>—</span>
                    return <span>{p.discountPercent}% if paid in {p.discountDays}d</span>
                },
            },
        ],
        [],
    )

    return (
        <RefCrudPage<PaymentTerms>
            routePath={ROUTE_PATH}
            title="Payment Terms"
            description="Define payment term codes for supplier purchasing."
            fields={fields}
            columns={columns}
            fetchAll={paymentTermsService.list}
            createItem={paymentTermsService.create}
            updateItem={paymentTermsService.update}
            deleteItem={paymentTermsService.delete}
            getItemLabel={(item) => `${item.code} — ${item.name}`}
        />
    )
}

export default PaymentTermsPage
