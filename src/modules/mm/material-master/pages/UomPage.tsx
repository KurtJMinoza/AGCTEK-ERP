'use client'

import { useMemo } from 'react'
import Tag from '@/components/ui/Tag'
import RefCrudPage from '../components/RefCrudPage'
import { uomService } from '../services/referenceService'
import type { MmUom } from '../types'
import type { ColumnDef } from '@/components/shared/DataTable'

const UomPage = () => {
    const columns = useMemo<ColumnDef<MmUom>[]>(() => [
        { header: 'Code', accessorKey: 'code', size: 120 },
        { header: 'Name', accessorKey: 'name', size: 200 },
        { header: 'Symbol', accessorKey: 'symbol', size: 100, cell: ({ row }) => row.original.symbol ?? '—' },
        { header: 'Active', accessorKey: 'isActive', size: 100, cell: ({ row }) => row.original.isActive ? <Tag className="bg-emerald-100 text-emerald-700 text-xs">Yes</Tag> : <Tag className="text-xs">No</Tag> },
        { header: 'Position', accessorKey: 'sortOrder', size: 90 },
    ], [])

    return (
        <RefCrudPage<MmUom>
            routePath="/modules/mm/material-master/units-of-measure"
            title="Unit of Measure"
            description="Define units of measure used across materials."
            fields={[
                { key: 'code', label: 'Code', autoGenerate: true, autoGenerateHint: 'Auto-generated (e.g. UOM-000001)' },
                { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Piece, Kilogram, Liter, Meter' },
                { key: 'symbol', label: 'Symbol', placeholder: 'e.g. pc, kg, L, m' },
                { key: 'sortOrder', label: 'Display position', type: 'number', placeholder: 'e.g. 1', helpText: 'Controls where this appears in dropdowns and lists. Lower numbers show first (1, then 2, then 3…). Leave blank to use the default.' },
            ]}
            columns={columns}
            fetchAll={uomService.list}
            createItem={uomService.create}
            updateItem={uomService.update}
            deleteItem={uomService.remove}
            getItemLabel={(u) => `${u.code} — ${u.name}`}
        />
    )
}

export default UomPage
