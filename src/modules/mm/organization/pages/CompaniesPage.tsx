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
import {
    OrgAddressCell,
    OrgCompanyCell,
    OrgTinCell,
} from '../components/organizationTableUi'
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
                header: 'Company',
                id: 'company',
                size: 280,
                cell: ({ row }) => (
                    <OrgCompanyCell
                        code={row.original.code}
                        name={row.original.name}
                        logoUrl={row.original.logoUrl}
                    />
                ),
            },
            {
                header: 'TIN',
                accessorKey: 'tin',
                size: 140,
                cell: ({ row }) => <OrgTinCell tin={row.original.tin} />,
            },
            {
                header: 'Registered address',
                accessorKey: 'address',
                size: 280,
                cell: ({ row }) => <OrgAddressCell address={row.original.address} />,
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
            animatedTable
            integrateBreadcrumbs
            tableMinWidthClass="min-w-[720px]"
            tableMobile={{
                title: (row) => row.code,
                subtitle: (row) => row.name,
                fields: [
                    { label: 'TIN', value: (row) => row.tin ?? '—' },
                    {
                        label: 'Address',
                        value: (row) => row.address ?? '—',
                    },
                ],
            }}
        />
    )
}

export default CompaniesPage
