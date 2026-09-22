'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Input from '@/components/ui/Input'
import { HiOutlineClipboardCheck, HiOutlineSearch } from 'react-icons/hi'
import { qualityService } from '../services/qualityService'
import type { MmQualityDecision } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/usage-decisions'

const DECISION_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    ACCEPT: 'success',
    ACCEPT_WITH_DEVIATION: 'warning',
    BLOCK: 'danger',
    REJECT: 'danger',
    REWORK: 'warning',
    RETURN: 'danger',
}

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export default function UsageDecisionsPage() {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [data, setData] = useState<MmQualityDecision[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await qualityService.listDecisions({
                page,
                pageSize,
                search: search || undefined,
            })
            setData(res.data)
            setTotal(res.total)
        } catch {
            setData([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, search])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const columns: ColumnDef<MmQualityDecision>[] = useMemo(
        () => [
            {
                header: 'Lot #',
                accessorKey: 'inspectionLot.lotNumber',
                cell: ({ row }) => row.original.inspectionLot?.lotNumber ?? '—',
            },
            {
                header: 'Material',
                accessorKey: 'inspectionLot.material.materialCode',
                cell: ({ row }) => {
                    const m = row.original.inspectionLot?.material
                    return m ? `${m.materialCode} — ${m.materialName}` : '—'
                },
            },
            {
                header: 'Decision',
                accessorKey: 'decisionCode',
                cell: ({ row }) => (
                    <StatusBadge tone={DECISION_TONE[row.original.decisionCode] ?? 'default'}>
                        {row.original.decisionCode}
                    </StatusBadge>
                ),
            },
            {
                header: 'Qty',
                accessorKey: 'quantity',
                cell: ({ row }) => Number(row.original.quantity),
            },
            {
                header: 'Reason',
                accessorKey: 'reason',
                cell: ({ row }) => row.original.reason ?? '—',
            },
            {
                header: 'Decided by',
                accessorKey: 'decidedBy',
                cell: ({ row }) => row.original.decidedBy ?? '—',
            },
            {
                header: 'Decided at',
                accessorKey: 'decidedAt',
                cell: ({ row }) => fmtDate(row.original.decidedAt),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Usage decisions"
                description="Audit trail of inspection lot usage decisions across receiving."
                icon={<HiOutlineClipboardCheck />}
            />

            <AdaptiveCard>
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <Input
                        prefix={<HiOutlineSearch />}
                        placeholder="Search lot or decision code..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setPage(1)
                        }}
                        className="max-w-xs"
                    />
                </div>

                <DataTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => {
                        setPageSize(s)
                        setPage(1)
                    }}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}
