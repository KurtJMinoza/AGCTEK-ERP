'use client'

import { useCallback, useMemo, useState } from 'react'
import type { ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import RefCrudPage from '@/modules/mm/material-master/components/RefCrudPage'
import type { RefCrudField } from '@/modules/mm/material-master/components/RefCrudPage'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import type { MmBranch } from '@/modules/mm/material-master/types'

const ROUTE_PATH = '/modules/mm/organization/branches'

const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
]

const BranchesPage = () => {
    const [companyOptions, setCompanyOptions] = useState<
        Array<{ value: string; label: string }>
    >([])

    const prepareFormOpen = useCallback(async () => {
        // Live fetch (bypasses the TTL ref cache) so the Company dropdown is
        // always populated with real companies when the form opens.
        try {
            const list = await orgService.companies()
            setCompanyOptions(
                list.map((c) => ({ value: c.id, label: c.name })),
            )
        } catch {
            setCompanyOptions([])
        }
    }, [])

    const fields = useMemo<RefCrudField[]>(
        () => [
            { key: 'code', label: 'Code', required: true, placeholder: 'e.g. BR-01' },
            { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Cebu Distribution Branch' },
            {
                key: 'companyId',
                label: 'Company',
                required: true,
                type: 'select',
                options: companyOptions,
                placeholder: 'Select company',
            },
            {
                key: 'status',
                label: 'Status',
                type: 'select',
                options: STATUS_OPTIONS,
                placeholder: 'Active',
            },
        ],
        [companyOptions],
    )

    const columns = useMemo<ColumnDef<MmBranch>[]>(
        () => [
            { header: 'Code', accessorKey: 'code', size: 120, cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.code}</span> },
            { header: 'Name', accessorKey: 'name', size: 180 },
            { header: 'Company', id: 'company', size: 180, cell: ({ row }) => row.original.company?.name ?? '—' },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 100,
                cell: ({ row }) => (
                    <StatusBadge tone={row.original.status === 'ACTIVE' ? 'success' : 'warning'}>
                        {row.original.status}
                    </StatusBadge>
                ),
            },
        ],
        [],
    )

    return (
        <RefCrudPage<MmBranch>
            routePath={ROUTE_PATH}
            title="Branches"
            description="Operating branches under a company. Warehouses link to a branch."
            fields={fields}
            columns={columns}
            fetchAll={() => orgService.branches()}
            createItem={(data) => orgService.createBranch({
                ...data,
                status: data.status || 'ACTIVE',
            })}
            updateItem={orgService.updateBranch}
            deleteItem={orgService.deleteBranch}
            getItemLabel={(item) => `${item.code} — ${item.name}`}
            prepareFormOpen={prepareFormOpen}
        />
    )
}

export default BranchesPage
