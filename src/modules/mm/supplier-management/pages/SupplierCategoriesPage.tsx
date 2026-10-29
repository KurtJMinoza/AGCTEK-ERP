'use client'

import { useMemo } from 'react'
import { type ColumnDef } from '@/components/shared/DataTable'
import RefCrudPage from '@/modules/mm/material-master/components/RefCrudPage'
import type { RefCrudField } from '@/modules/mm/material-master/components/RefCrudPage'
import { supplierCategoryService } from '../services/supplierCategoryService'
import type { SupplierCategory } from '../types'
import { SmCodeNameCell, SmPlainCell } from '../components/SupplierTableCells'
import { supplierRefCrudTableDefaults } from '../utils/supplierPageUi'

const ROUTE_PATH = '/modules/mm/supplier-management/supplier-categories'

const fields: RefCrudField[] = [
    { key: 'code', label: 'Code', autoGenerate: true, autoGenerateHint: 'Auto-generated (e.g. SCAT-000001)' },
    { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Local Vendor, Overseas Supplier, Service Provider' },
    { key: 'description', label: 'Description', placeholder: 'e.g. Domestic suppliers for consumables and spare parts' },
    { key: 'sortOrder', label: 'Display position', type: 'number', placeholder: 'e.g. 1', helpText: 'Controls where this appears in dropdowns and lists. Lower numbers show first (1, then 2, then 3…). Leave blank to use the default.' },
]

const SupplierCategoriesPage = () => {
    const columns = useMemo<ColumnDef<SupplierCategory>[]>(
        () => [
            {
                header: 'Category',
                accessorKey: 'code',
                size: 280,
                cell: ({ row }) => (
                    <SmCodeNameCell
                        code={row.original.code}
                        name={row.original.name}
                        description={row.original.description}
                    />
                ),
            },
            {
                header: 'Position',
                accessorKey: 'sortOrder',
                size: 100,
                cell: ({ row }) => (
                    <SmPlainCell mono>{row.original.sortOrder ?? '—'}</SmPlainCell>
                ),
            },
        ],
        [],
    )

    return (
        <RefCrudPage<SupplierCategory>
            routePath={ROUTE_PATH}
            title="Supplier Categories"
            description="Classify suppliers into categories."
            fields={fields}
            columns={columns}
            fetchAll={supplierCategoryService.list}
            createItem={supplierCategoryService.create}
            updateItem={supplierCategoryService.update}
            deleteItem={supplierCategoryService.delete}
            getItemLabel={(item) => `${item.code} — ${item.name}`}
            {...supplierRefCrudTableDefaults}
            tableMobile={{
                title: (row) => row.code,
                subtitle: (row) => row.name,
                fields: [
                    { label: 'Description', value: (row) => row.description ?? '—' },
                    { label: 'Position', value: (row) => String(row.sortOrder ?? '—') },
                ],
            }}
        />
    )
}

export default SupplierCategoriesPage
