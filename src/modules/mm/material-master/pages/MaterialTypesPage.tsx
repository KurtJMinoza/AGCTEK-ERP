'use client'

import { useMemo } from 'react'
import Tag from '@/components/ui/Tag'
import RefCrudPage from '../components/RefCrudPage'
import { materialTypeService } from '../services/referenceService'
import type { MmMaterialType } from '../types'
import type { ColumnDef } from '@/components/shared/DataTable'

const MaterialTypesPage = () => {
    const columns = useMemo<ColumnDef<MmMaterialType>[]>(() => [
        { header: 'Code', accessorKey: 'code', size: 180 },
        { header: 'Name', accessorKey: 'name', size: 200 },
        { header: 'Description', accessorKey: 'description', size: 300, cell: ({ row }) => row.original.description ?? '—' },
        { header: 'Active', accessorKey: 'isActive', size: 100, cell: ({ row }) => row.original.isActive ? <Tag className="bg-emerald-100 text-emerald-700 text-xs">Yes</Tag> : <Tag className="text-xs">No</Tag> },
        { header: 'Position', accessorKey: 'sortOrder', size: 90 },
    ], [])

    return (
        <RefCrudPage<MmMaterialType>
            routePath="/modules/mm/material-master/material-types"
            title="Material Type"
            description="Configure material types that classify materials in the master."
            fields={[
                { key: 'code', label: 'Code', autoGenerate: true, autoGenerateHint: 'Auto-generated (e.g. TYP-000001)' },
                { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Raw Material, Finished Good, Packaging' },
                { key: 'description', label: 'Description', placeholder: 'e.g. Materials used in production before assembly' },
                { key: 'sortOrder', label: 'Display position', type: 'number', placeholder: 'e.g. 1', helpText: 'Controls where this appears in dropdowns and lists. Lower numbers show first (1, then 2, then 3…). Leave blank to use the default.' },
            ]}
            columns={columns}
            fetchAll={materialTypeService.list}
            createItem={materialTypeService.create}
            updateItem={materialTypeService.update}
            deleteItem={materialTypeService.remove}
            getItemLabel={(t) => `${t.code} — ${t.name}`}
        />
    )
}

export default MaterialTypesPage
