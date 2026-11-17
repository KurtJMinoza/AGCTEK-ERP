'use client'

import { useMemo } from 'react'
import { type ColumnDef } from '@/components/shared/DataTable'
import RefCrudPage from '@/modules/mm/material-master/components/RefCrudPage'
import type { RefCrudField } from '@/modules/mm/material-master/components/RefCrudPage'
import { paymentTermsService } from '../services/paymentTermsService'
import type { PaymentTerms } from '../types'
import {
    SmCodeNameCell,
    SmPaymentDiscountCell,
    SmPlainCell,
} from '../components/SupplierTableCells'
import { supplierRefCrudTableDefaults } from '../utils/supplierPageUi'

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
            {
                header: 'Terms',
                accessorKey: 'code',
                size: 260,
                cell: ({ row }) => (
                    <SmCodeNameCell
                        code={row.original.code}
                        name={row.original.name}
                        description={row.original.description}
                    />
                ),
            },
            {
                header: 'Due',
                accessorKey: 'dueDays',
                size: 100,
                cell: ({ row }) => (
                    <SmPlainCell mono>{row.original.dueDays}</SmPlainCell>
                ),
            },
            {
                header: 'Discount',
                id: 'discount',
                size: 140,
                cell: ({ row }) => (
                    <SmPaymentDiscountCell
                        discountDays={row.original.discountDays}
                        discountPercent={row.original.discountPercent}
                        dueDays={row.original.dueDays}
                    />
                ),
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
            {...supplierRefCrudTableDefaults}
            tableMobile={{
                title: (row) => row.code,
                subtitle: (row) => row.name,
                fields: [
                    { label: 'Due days', value: (row) => String(row.dueDays) },
                    {
                        label: 'Discount',
                        value: (row) =>
                            row.discountDays
                                ? `${row.discountPercent}% / ${row.discountDays}d`
                                : '—',
                    },
                ],
            }}
        />
    )
}

export default PaymentTermsPage
