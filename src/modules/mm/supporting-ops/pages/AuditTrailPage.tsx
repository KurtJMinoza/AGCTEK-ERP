'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import SupportingOpsResponsiveTable, {
    type ColumnDef,
} from '../components/SupportingOpsResponsiveTable'
import {
    SOP_AUDIT_ACTION,
    SopAnimatedStatus,
    SopDateCell,
    SopDocCell,
    SopMethodTag,
    SopPlainCell,
    sopStatusTone,
} from '../components/supportingOpsTableUi'
import { supportingOpsParentBreadcrumbs } from '../utils/supportingOpsPageUi'
import Input from '@/components/ui/Input'
import { supportingOpsService } from '../services/supportingOpsService'

const ROUTE = '/modules/mm/supporting-operations/audit-trail'

type AuditRow = {
    id?: string
    performedAt: string
    domain?: string
    action?: string
    entityNumber?: string | null
    performedBy?: string | null
}

const AuditTrailPage = () => {
    const parentBreadcrumbs = supportingOpsParentBreadcrumbs(ROUTE)
    const [companyId, setCompanyId] = useState('')
    const [rows, setRows] = useState<AuditRow[]>([])
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        if (!companyId.trim()) return
        setLoading(true)
        try {
            const res = await supportingOpsService.listAudit({
                companyId: companyId.trim(),
                pageSize: 100,
            })
            setRows(res.data)
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<AuditRow>[] = useMemo(
        () => [
            {
                header: 'When',
                cell: ({ row }) => <SopDateCell iso={row.original.performedAt} />,
            },
            {
                header: 'Domain',
                cell: ({ row }) => (
                    <SopMethodTag label={row.original.domain} />
                ),
            },
            {
                header: 'Action',
                cell: ({ row }) =>
                    row.original.action ? (
                        <SopAnimatedStatus
                            status={row.original.action}
                            tone={sopStatusTone(row.original.action, SOP_AUDIT_ACTION)}
                        />
                    ) : (
                        <SopPlainCell muted>—</SopPlainCell>
                    ),
            },
            {
                header: 'Entity',
                cell: ({ row }) =>
                    row.original.entityNumber ? (
                        <SopDocCell
                            icon="audit"
                            primary={row.original.entityNumber}
                        />
                    ) : (
                        <SopPlainCell muted>—</SopPlainCell>
                    ),
            },
            {
                header: 'By',
                cell: ({ row }) => (
                    <SopPlainCell mono>{row.original.performedBy}</SopPlainCell>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Audit Trail"
                description="Append-only compliance audit entries (no delete from UI)."
                breadcrumbs={parentBreadcrumbs}
            />
            <AdaptiveCard>
                <Input
                    className="mb-4 max-w-md"
                    placeholder="Company ID"
                    value={companyId}
                    onChange={(e: any) => setCompanyId(e.target.value)}
                />
                <SupportingOpsResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row, index) =>
                        row.id ?? `${row.performedAt}-${row.entityNumber ?? index}`
                    }
                    hidePagination
                    tableMinWidthClass="min-w-[960px]"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default AuditTrailPage
