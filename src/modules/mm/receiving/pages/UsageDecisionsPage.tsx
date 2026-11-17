'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ReceivingResponsiveTable, { type ColumnDef } from '../components/ReceivingResponsiveTable'
import {
    RCV_USAGE_DECISION,
    RcvAnimatedStatus,
    RcvDateCell,
    RcvDocNumberCell,
    RcvMaterialCell,
    RcvPlainCell,
    RcvQtyCell,
    rcvStatusTone,
} from '../components/receivingTableUi'
import Input from '@/components/ui/Input'
import { HiOutlineClipboardCheck, HiOutlineSearch } from 'react-icons/hi'
import { qualityService } from '../services/qualityService'
import type { MmQualityDecision } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/usage-decisions'

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
                header: 'Lot',
                accessorKey: 'inspectionLot.lotNumber',
                cell: ({ row }) => (
                    <RcvDocNumberCell
                        icon="inspection"
                        primary={row.original.inspectionLot?.lotNumber ?? '—'}
                    />
                ),
            },
            {
                header: 'Material',
                accessorKey: 'inspectionLot.material.materialCode',
                cell: ({ row }) => {
                    const m = row.original.inspectionLot?.material
                    return (
                        <RcvMaterialCell code={m?.materialCode} name={m?.materialName} />
                    )
                },
            },
            {
                header: 'Decision',
                accessorKey: 'decisionCode',
                cell: ({ row }) => (
                    <RcvAnimatedStatus
                        status={row.original.decisionCode}
                        tone={rcvStatusTone(row.original.decisionCode, RCV_USAGE_DECISION)}
                    />
                ),
            },
            {
                header: 'Qty',
                accessorKey: 'quantity',
                cell: ({ row }) => <RcvQtyCell value={row.original.quantity} />,
            },
            {
                header: 'Reason',
                accessorKey: 'reason',
                cell: ({ row }) => <RcvPlainCell>{row.original.reason}</RcvPlainCell>,
            },
            {
                header: 'Decided by',
                accessorKey: 'decidedBy',
                cell: ({ row }) => (
                    <RcvPlainCell muted>{row.original.decidedBy}</RcvPlainCell>
                ),
            },
            {
                header: 'Decided at',
                accessorKey: 'decidedAt',
                cell: ({ row }) => (
                    <RcvDateCell iso={row.original.decidedAt} withTime />
                ),
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

                <ReceivingResponsiveTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    getRowId={(row) => row.id}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => {
                        setPageSize(s)
                        setPage(1)
                    }}
                    tableMinWidthClass="min-w-[900px]"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}
