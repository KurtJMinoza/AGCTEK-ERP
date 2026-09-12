'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import RefCrudPage from '@/modules/mm/material-master/components/RefCrudPage'
import type { RefCrudField } from '@/modules/mm/material-master/components/RefCrudPage'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import type { MmCompany, MmPlant } from '@/modules/mm/material-master/types'

const ROUTE_PATH = '/modules/mm/organization/plants'

const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
]

const PlantsPage = () => {
    const [companies, setCompanies] = useState<MmCompany[]>([])

    useEffect(() => {
        orgService.companies().then((list) => setCompanies(Array.isArray(list) ? list : [])).catch(() => {})
    }, [])

    const companyOptions = useMemo(
        () => companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
        [companies],
    )

    const fields = useMemo<RefCrudField[]>(
        () => [
            { key: 'code', label: 'Code', required: true, placeholder: 'e.g. PLT-01' },
            { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Main Manufacturing Plant' },
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

    const columns = useMemo<ColumnDef<MmPlant>[]>(
        () => [
            { header: 'Code', accessorKey: 'code', size: 120, cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.code}</span> },
            { header: 'Name', accessorKey: 'name', size: 200 },
            { header: 'Company', id: 'company', size: 200, cell: ({ row }) => row.original.company?.name ?? '—' },
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
        <RefCrudPage<MmPlant>
            routePath={ROUTE_PATH}
            title="Plants"
            description="Manufacturing or logistics sites under a company. Warehouses can be assigned to a plant."
            fields={fields}
            columns={columns}
            fetchAll={() => orgService.plants()}
            createItem={(data) => orgService.createPlant({ ...data, status: data.status || 'ACTIVE' })}
            updateItem={orgService.updatePlant}
            deleteItem={orgService.deletePlant}
            getItemLabel={(item) => `${item.code} — ${item.name}`}
        />
    )
}

export default PlantsPage
