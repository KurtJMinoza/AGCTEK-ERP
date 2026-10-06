'use client'

import { useCallback, useMemo } from 'react'
import type { ColumnDef } from '@/components/shared/DataTable'
import RefCrudPage from '@/modules/mm/material-master/components/RefCrudPage'
import type {
    RefCrudField,
    RefCrudFormSectionConfig,
} from '@/modules/mm/material-master/components/RefCrudPage'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import type { MmCompany } from '@/modules/mm/material-master/types'
import { HiOutlineOfficeBuilding } from 'react-icons/hi'

const ROUTE_PATH = '/modules/mm/organization/companies'

const fields: RefCrudField[] = [
    {
        key: 'code',
        label: 'Company code',
        required: true,
        placeholder: 'e.g. AGCTEK',
        helpText: 'Short unique ID used on warehouses and MM documents.',
        maxLength: 32,
    },
    {
        key: 'name',
        label: 'Legal name',
        required: true,
        placeholder: 'e.g. AGCTEK Corporation',
        maxLength: 200,
    },
    {
        key: 'tin',
        label: 'TIN',
        required: true,
        placeholder: '000-000-000-000',
        helpText: 'Tax identification number for invoices and BIR reporting.',
        maxLength: 32,
    },
    {
        key: 'address',
        label: 'Registered address',
        required: true,
        type: 'textarea',
        placeholder: 'Street, city, province, postal code',
        maxLength: 500,
        colSpan: 2,
    },
    {
        key: 'logoFile',
        label: 'Company logo',
        required: true,
        type: 'file',
        existingUrlField: 'logoUrl',
        helpText: 'Square PNG or JPG works best on receipts and letterheads. Max 5 MB.',
        colSpan: 2,
    },
]

const formSections: RefCrudFormSectionConfig[] = [
    {
        title: 'Identity',
        description: 'How this legal entity appears in the org structure.',
        keys: ['code', 'name'],
    },
    {
        title: 'Tax & address',
        description: 'Used on compliance documents and official correspondence.',
        keys: ['tin', 'address'],
    },
    {
        title: 'Branding',
        description: 'Logo shown in the company list and downstream documents.',
        keys: ['logoFile'],
    },
]

function toCompanyFormData(payload: Record<string, unknown>, logoFile: unknown): FormData {
    const fd = new FormData()
    fd.append('data', JSON.stringify(payload))
    if (logoFile instanceof File) fd.append('logo', logoFile)
    return fd
}

const CompaniesPage = () => {
    const columns = useMemo<ColumnDef<MmCompany>[]>(
        () => [
            {
                header: '',
                id: 'logo',
                size: 56,
                cell: ({ row }) =>
                    row.original.logoUrl ? (
                        <img
                            src={row.original.logoUrl}
                            alt=""
                            className="h-9 w-9 rounded-lg border border-gray-200 object-contain bg-white shadow-sm dark:border-gray-600"
                        />
                    ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400 dark:bg-gray-800">
                            —
                        </span>
                    ),
            },
            {
                header: 'Code',
                accessorKey: 'code',
                size: 120,
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold">{row.original.code}</span>
                ),
            },
            { header: 'Name', accessorKey: 'name', size: 200 },
            { header: 'TIN', accessorKey: 'tin', size: 140 },
            {
                header: 'Address',
                accessorKey: 'address',
                size: 260,
                cell: ({ row }) => (
                    <span className="line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                        {row.original.address || '—'}
                    </span>
                ),
            },
        ],
        [],
    )

    const saveItem = useCallback(
        async ({
            editing,
            payload,
            formData,
        }: {
            editing: MmCompany | null
            payload: Record<string, unknown>
            formData: Record<string, unknown>
        }) => {
            const fd = toCompanyFormData(payload, formData.logoFile)
            if (editing) return orgService.updateCompany(editing.id, fd)
            return orgService.createCompany(fd)
        },
        [],
    )

    return (
        <RefCrudPage<MmCompany>
            routePath={ROUTE_PATH}
            title="Companies"
            description="Legal entities that own warehouses, materials, and inventory transactions."
            fields={fields}
            columns={columns}
            fetchAll={orgService.companies}
            createItem={orgService.createCompany as any}
            updateItem={orgService.updateCompany as any}
            deleteItem={orgService.deleteCompany}
            saveItem={saveItem}
            formDialogSize="xl"
            formSections={formSections}
            formDialogIcon={<HiOutlineOfficeBuilding />}
            formDialogTitle={(editing) =>
                editing ? 'Edit company' : 'Register company'
            }
            formDialogDescription={(editing) =>
                editing
                    ? 'Update legal identity, tax details, address, or logo.'
                    : 'Add a legal entity with code, TIN, registered address, and logo.'
            }
            getItemLabel={(item) => `${item.code} — ${item.name}`}
        />
    )
}

export default CompaniesPage
