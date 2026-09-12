'use client'

import { useMemo } from 'react'
import type { ColumnDef } from '@/components/shared/DataTable'
import RefCrudPage from '@/modules/mm/material-master/components/RefCrudPage'
import type { RefCrudField } from '@/modules/mm/material-master/components/RefCrudPage'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import type { MmCompany } from '@/modules/mm/material-master/types'

const ROUTE_PATH = '/modules/mm/organization/companies'

const fields: RefCrudField[] = [
    { key: 'code', label: 'Code', required: true, placeholder: 'e.g. AGCTEK', helpText: 'Short unique identifier used across MM documents and warehouses.' },
    { key: 'name', label: 'Name', required: true, placeholder: 'e.g. AGCTEK Corporation' },
]

const CompaniesPage = () => {
    const columns = useMemo<ColumnDef<MmCompany>[]>(
        () => [
            { header: 'Code', accessorKey: 'code', size: 140, cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.code}</span> },
            { header: 'Name', accessorKey: 'name', size: 260 },
        ],
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
            createItem={orgService.createCompany}
            updateItem={orgService.updateCompany}
            deleteItem={orgService.deleteCompany}
            getItemLabel={(item) => `${item.code} — ${item.name}`}
        />
    )
}

export default CompaniesPage
