'use client'

import { useMemo } from 'react'
import { type ColumnDef } from '@/components/shared/DataTable'
import RefCrudPage from '@/modules/mm/material-master/components/RefCrudPage'
import type { RefCrudField } from '@/modules/mm/material-master/components/RefCrudPage'
import { supplierCategoryService } from '../services/supplierCategoryService'
import type { SupplierCategory } from '../types'

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
            { header: 'Code', accessorKey: 'code', size: 120 },
            { header: 'Name', accessorKey: 'name', size: 200 },
            { header: 'Description', accessorKey: 'description', cell: ({ row }) => <span>{row.original.description || '—'}</span> },
            { header: 'Position', accessorKey: 'sortOrder', size: 100 },
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
        />
    )
}

export default SupplierCategoriesPage
