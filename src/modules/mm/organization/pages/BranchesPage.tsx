'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import RefCrudPage from '@/modules/mm/material-master/components/RefCrudPage'
import type { RefCrudField } from '@/modules/mm/material-master/components/RefCrudPage'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import type { MmBranch, MmCompany, MmPlant } from '@/modules/mm/material-master/types'

const ROUTE_PATH = '/modules/mm/organization/branches'

const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
]

const BranchesPage = () => {
    const [companies, setCompanies] = useState<MmCompany[]>([])
    const [plants, setPlants] = useState<MmPlant[]>([])

    useEffect(() => {
        orgService.companies().then((list) => setCompanies(Array.isArray(list) ? list : [])).catch(() => {})
        orgService.plants().then((list) => setPlants(Array.isArray(list) ? list : [])).catch(() => {})
    }, [])

    const companyOptions = useMemo(
        () => companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
        [companies],
    )

    const plantOptions = useMemo(
        () => plants.map((p) => ({
            value: p.id,
            label: `${p.code} — ${p.name}${p.company ? ` (${p.company.code})` : ''}`,
        })),
        [plants],
    )

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
        />
    )
}

export default BranchesPage
