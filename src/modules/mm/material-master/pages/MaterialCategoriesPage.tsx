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
            {
                key: 'imageFile',
                label: 'Category image',
                type: 'file' as const,
                existingUrlField: 'imageUrl',
                helpText:
                    'Shown in the shop under "Explore Popular Categories". Square PNG or JPG works best. Max 5 MB.',
            },
        ],
        [parentOptions],
    )

    const columns = useMemo<ColumnDef<MmMaterialCategory>[]>(() => [
        {
            header: '',
            id: 'image',
            size: 56,
            cell: ({ row }) =>
                row.original.imageUrl ? (
                    <img
                        src={row.original.imageUrl}
                        alt=""
                        className="h-9 w-9 rounded-lg border border-gray-200 object-cover bg-white shadow-sm dark:border-gray-600"
                    />
                ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400 dark:bg-gray-800">
                        —
                    </span>
                ),
        },
        { header: 'Code', accessorKey: 'code', size: 180 },
        { header: 'Name', accessorKey: 'name', size: 200 },
        { header: 'Parent', accessorKey: 'parentId', size: 160, cell: ({ row }) => row.original.parent?.name ?? '—' },
        { header: 'Children', id: 'children', size: 100, cell: ({ row }) => row.original.children?.length ?? 0 },
        { header: 'Position', accessorKey: 'sortOrder', size: 90 },
        { header: 'Active', accessorKey: 'isActive', size: 100, cell: ({ row }) => row.original.isActive ? <Tag className="bg-emerald-100 text-emerald-700 text-xs">Yes</Tag> : <Tag className="text-xs">No</Tag> },
    ], [])

    /** Multipart save so the image file travels with the category payload. */
    const saveItem = useCallback(
        async ({
            editing,
            payload,
            formData,
        }: {
            editing: MmMaterialCategory | null
            payload: Record<string, unknown>
            formData: Record<string, unknown>
        }) => {
            const fd = new FormData()
            fd.append('data', JSON.stringify(payload))
            if (formData.imageFile instanceof File) {
                fd.append('image', formData.imageFile)
            }
            if (editing) return materialCategoryService.update(editing.id, fd)
            return materialCategoryService.create(fd as unknown as {
                code: string
                name: string
            })
        },
        [],
    )

    return (
        <RefCrudPage<MmMaterialCategory>
            routePath="/modules/mm/material-master/material-categories"
            title="Material Category"
            description="Manage the category hierarchy for materials — images appear in the shop's popular categories."
            fields={fields}
            columns={columns}
            fetchAll={fetchAll}
            createItem={materialCategoryService.create as never}
            updateItem={materialCategoryService.update as never}
            deleteItem={materialCategoryService.remove}
            saveItem={saveItem}
            getItemLabel={(c) => `${c.code} — ${c.name}`}
        />
    )
}

export default MaterialCategoriesPage