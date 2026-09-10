'use client'

import { useCallback, useMemo, useState } from 'react'
import Tag from '@/components/ui/Tag'
import RefCrudPage from '../components/RefCrudPage'
import { materialCategoryService } from '../services/referenceService'
import type { MmMaterialCategory } from '../types'
import type { ColumnDef } from '@/components/shared/DataTable'

const MaterialCategoriesPage = () => {
    const [categories, setCategories] = useState<MmMaterialCategory[]>([])

    // Must be stable — RefCrudPage reloads whenever fetchAll identity changes.
    const fetchAll = useCallback(async () => {
        const list = await materialCategoryService.list()
        setCategories(list)
        return list
    }, [])

    const parentOptions = useMemo(
        () => categories.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
        [categories],
    )

    const fields = useMemo(
        () => [
            { key: 'code', label: 'Code', autoGenerate: true, autoGenerateHint: 'Auto-generated (e.g. CAT-000001)' },
            { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Packaging Supplies, Electrical Parts, Fasteners' },
            { key: 'description', label: 'Description', placeholder: 'e.g. Corrugated boxes, tape, and packing materials' },
            {
                key: 'parentId',
                label: 'Parent category',
                type: 'select' as const,
                isClearable: true,
                options: parentOptions,
                placeholder: 'Optional parent…',
                helpText: 'Leave empty for a top-level category.',
            },
            {
                key: 'sortOrder',
                label: 'Display position',
                type: 'number' as const,
                placeholder: 'e.g. 1',
                helpText:
                    'Controls where this appears in dropdowns and lists. Lower numbers show first (1, then 2, then 3…). Leave blank to use the default.',
            },
        ],
        [parentOptions],
    )

    const columns = useMemo<ColumnDef<MmMaterialCategory>[]>(() => [
        { header: 'Code', accessorKey: 'code', size: 180 },
        { header: 'Name', accessorKey: 'name', size: 200 },
        { header: 'Parent', accessorKey: 'parentId', size: 160, cell: ({ row }) => row.original.parent?.name ?? '—' },
        { header: 'Children', id: 'children', size: 100, cell: ({ row }) => row.original.children?.length ?? 0 },
        { header: 'Position', accessorKey: 'sortOrder', size: 90 },
        { header: 'Active', accessorKey: 'isActive', size: 100, cell: ({ row }) => row.original.isActive ? <Tag className="bg-emerald-100 text-emerald-700 text-xs">Yes</Tag> : <Tag className="text-xs">No</Tag> },
    ], [])

    return (
        <RefCrudPage<MmMaterialCategory>
            routePath="/modules/mm/material-master/material-categories"
            title="Material Category"
            description="Manage the category hierarchy for materials."
            fields={fields}
            columns={columns}
            fetchAll={fetchAll}
            createItem={materialCategoryService.create}
            updateItem={materialCategoryService.update}
            deleteItem={materialCategoryService.remove}
            getItemLabel={(c) => `${c.code} — ${c.name}`}
        />
    )
}

export default MaterialCategoriesPage
