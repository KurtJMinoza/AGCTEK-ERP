'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ReceivingResponsiveTable, { type ColumnDef } from '../components/ReceivingResponsiveTable'
import {
    RCV_INSPECTION_LOT_STATUS,
    RCV_INSPECTION_RESULT,
    RcvAnimatedStatus,
    RcvDateCell,
    RcvDocNumberCell,
    RcvMaterialCell,
    RcvQtyCell,
    rcvStatusTone,
} from '../components/receivingTableUi'
import Input from '@/components/ui/Input'
import Tabs from '@/components/ui/Tabs'
import { HiOutlineClipboardList, HiOutlineSearch } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import { inspectionService } from '../services/inspectionService'
import { qualityService, type QualityDashboard } from '../services/qualityService'
import type { MmInspectionLot } from '../types'
import { receivingParentBreadcrumbs } from '../utils/receivingPageUi'

const ROUTE = '/modules/mm/receiving/inspection-queue'
const DETAIL_ROUTE = '/modules/mm/receiving/inspection-queue'

const InspectionQueuePage = () => {
    const parentBreadcrumbs = useMemo(
        () => receivingParentBreadcrumbs(ROUTE),
        [],
    )
    const [data, setData] = useState<MmInspectionLot[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusTab, setStatusTab] = useState('PENDING')
    const [kpis, setKpis] = useState<QualityDashboard | null>(null)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inspectionService.list({
                page,
                pageSize,
                search: search || undefined,
                status: statusTab || undefined,
            })
            setData(res.data)
            setTotal(res.total)
        } catch {
            setData([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, search, statusTab])

    useEffect(() => { fetchData() }, [fetchData])

    useEffect(() => {
        qualityService.dashboard().then(setKpis).catch(() => setKpis(null))
    }, [])

    const pendingCount = useMemo(
        () =>
            data.filter((l) =>
                ['CREATED', 'READY', 'PENDING', 'IN_PROGRESS', 'PENDING_DECISION'].includes(
                    l.status,
                ),
            ).length,
        [data],
    )

    const columns: ColumnDef<MmInspectionLot>[] = useMemo(() => [
        {
            header: 'Lot',
            accessorKey: 'lotNumber',
            cell: ({ row }) => (
                <Link href={`${DETAIL_ROUTE}/${row.original.id}`} className="block">
                    <RcvDocNumberCell icon="inspection" primary={row.original.lotNumber} />
                </Link>
            ),
        },
        {
            header: 'Material',
            accessorKey: 'material.materialCode',
            cell: ({ row }) => (
                <RcvMaterialCell
                    code={row.original.material?.materialCode ?? row.original.materialId}
                    name={row.original.material?.materialName}
                />
            ),
        },
        {
            header: 'GR',
            accessorKey: 'goodsReceipt.documentNumber',
            cell: ({ row }) => (
                <RcvDocNumberCell
                    icon="gr"
                    primary={row.original.goodsReceipt?.documentNumber ?? '—'}
                />
            ),
        },
        {
            header: 'Qty',
            accessorKey: 'quantity',
            cell: ({ row }) => <RcvQtyCell value={row.original.quantity} />,
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <RcvAnimatedStatus
                    status={row.original.status}
                    tone={rcvStatusTone(row.original.status, RCV_INSPECTION_LOT_STATUS)}
                />
            ),
        },
        {
            header: 'Result',
            accessorKey: 'result',
            cell: ({ row }) =>
                row.original.result ? (
                    <RcvAnimatedStatus
                        status={row.original.result}
                        tone={rcvStatusTone(row.original.result, RCV_INSPECTION_RESULT)}
                    />
                ) : (
                    <span className="text-sm text-gray-400">—</span>
                ),
        },
        {
            header: 'Created',
            accessorKey: 'createdAt',
            cell: ({ row }) => <RcvDateCell iso={row.original.createdAt} />,
        },
    ], [])

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Inspection Queue"
                description="Pending inspection lots created at goods receipt post. Record samples and usage decisions from lot detail."
                icon={<HiOutlineClipboardList />}
                actions={
                    <Link href="/modules/mm/receiving/quality-dashboard">
                        <Button size="sm">Quality dashboard</Button>
                    </Link>
                }
            />
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">Open lots (company)</p>
                    <p className="text-2xl font-semibold">{kpis?.pendingLots ?? '—'}</p>
                </AdaptiveCard>
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">In progress</p>
                    <p className="text-2xl font-semibold">{kpis?.inProgressLots ?? '—'}</p>
                </AdaptiveCard>
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">Pending decision</p>
                    <p className="text-2xl font-semibold">{kpis?.pendingDecision ?? '—'}</p>
                </AdaptiveCard>
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">On this page</p>
                    <p className="text-2xl font-semibold">{pendingCount} / {total}</p>
                </AdaptiveCard>
            </div>

            <AdaptiveCard>
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <Input
                        prefix={<HiOutlineSearch />}
                        placeholder="Search lot #..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                        className="max-w-xs"
                    />
                </div>

                <Tabs value={statusTab} onChange={(val) => { setStatusTab(val as string); setPage(1) }}>
                    <Tabs.TabList>
                        <Tabs.TabNav value="PENDING">Open</Tabs.TabNav>
                        <Tabs.TabNav value="IN_PROGRESS">In Progress</Tabs.TabNav>
                        <Tabs.TabNav value="PENDING_DECISION">Pending decision</Tabs.TabNav>
                        <Tabs.TabNav value="COMPLETED">Decided</Tabs.TabNav>
                        <Tabs.TabNav value="">All</Tabs.TabNav>
                    </Tabs.TabList>
                </Tabs>

                <ReceivingResponsiveTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    getRowId={(row) => row.id}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => { setPageSize(s); setPage(1) }}
                    tableMinWidthClass="min-w-[900px]"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default InspectionQueuePage
