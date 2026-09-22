'use client'

import { useCallback, useMemo } from 'react'
import type { ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import RefCrudPage from '@/modules/mm/material-master/components/RefCrudPage'
import type { RefCrudField } from '@/modules/mm/material-master/components/RefCrudPage'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import { useLazyMmRefs, useLazyOrgRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { MmBranch } from '@/modules/mm/material-master/types'

const ROUTE_PATH = '/modules/mm/organization/branches'

const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
]

const BranchesPage = () => {
    const { ensure: ensureOrgRefs, plants } = useLazyOrgRefs()
    const { ensure: ensureCompanies, companies } = useLazyMmRefs()

    const companyOptions = useMemo(
        () => companies.map((c) => ({ value: c.value, label: c.label })),
        [companies],
    )

    const plantOptions = useMemo(
        () => plants.map((p) => ({ value: p.value, label: p.label })),
        [plants],
    )

    const prepareFormOpen = useCallback(async () => {
        await Promise.all([
            ensureCompanies('companies'),
            ensureOrgRefs('plants'),
        ])
    }, [ensureCompanies, ensureOrgRefs])

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
                key: 'plantId',
                label: 'Plant',
                type: 'select',
                isClearable: true,
                options: plantOptions,
                placeholder: 'Optional plant link',
                helpText: 'Optionally tie this branch to a plant for warehouse assignment.',
            },
            {
                key: 'status',
                label: 'Status',
                type: 'select',
                options: STATUS_OPTIONS,
                placeholder: 'Active',
            },
        ],
        [companyOptions, plantOptions],
    )

    const columns = useMemo<ColumnDef<MmBranch>[]>(
        () => [
            { header: 'Code', accessorKey: 'code', size: 120, cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.code}</span> },
            { header: 'Name', accessorKey: 'name', size: 180 },
            { header: 'Company', id: 'company', size: 180, cell: ({ row }) => row.original.company?.name ?? '—' },
            { header: 'Plant', id: 'plant', size: 160, cell: ({ row }) => row.original.plant?.name ?? '—' },
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
            description="Operating branches under a company. Optional plant link helps route warehouse setup."
            fields={fields}
            columns={columns}
            fetchAll={() => orgService.branches()}
            createItem={(data) => orgService.createBranch({
                ...data,
                plantId: data.plantId || undefined,
                status: data.status || 'ACTIVE',
            })}
            updateItem={(id, data) => orgService.updateBranch(id, {
                ...data,
                plantId: data.plantId === '' ? null : data.plantId,
            })}
            deleteItem={orgService.deleteBranch}
            getItemLabel={(item) => `${item.code} — ${item.name}`}
            prepareFormOpen={prepareFormOpen}
        />
    )
}

export default BranchesPage
