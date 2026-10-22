'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FilterBar, {
    type FilterChip,
    type FilterField,
} from '@/components/shared/FilterBar'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    HiOutlineSearch,
    HiOutlineClipboardList,
    HiOutlineCube,
    HiOutlineInbox,
} from 'react-icons/hi'
import {
    inventoryService,
    type InventoryTransaction,
} from '../services/inventoryService'
import {
    traceabilityService,
    type TraceChainNode,
} from '../services/traceabilityService'
import { useMmFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { buildTransactionColumns } from '../utils/ledgerColumns'
import {
    movementLabel,
    movementTone,
    sourceLabel,
    signedQty,
} from '../utils/ledgerLabels'
import { ReferenceDot, StockStatusTag, TONE_CARD } from '../utils/inventoryUi'

const { TabList, TabNav, TabContent } = Tabs

const ROUTE = '/modules/mm/inventory-management/traceability'

type TabKey = 'ledger' | 'forward' | 'backward' | 'whereUsed' | 'serial'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const TraceabilityPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const { companies, materials } = useMmFilterRefs('companies', 'materials')
    const [companyId, setCompanyId] = useState('')
    const [materialId, setMaterialId] = useState('')
    const [batchId, setBatchId] = useState('')
    const [serialNumberId, setSerialNumberId] = useState('')
    const [sourceDocumentId, setSourceDocumentId] = useState('')
    const [transactionId, setTransactionId] = useState('')
    const [tab, setTab] = useState<TabKey>('ledger')
    const [rows, setRows] = useState<InventoryTransaction[]>([])
    const [chain, setChain] = useState<TraceChainNode[]>([])
    const [whereUsed, setWhereUsed] = useState<any[]>([])
    const [batchSummary, setBatchSummary] = useState<any>(null)
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50 })
    const [page, setPage] = useState(1)
    const [hasSearched, setHasSearched] = useState(false)
    const [loading, setLoading] = useState(false)

    const searchLedger = useCallback(async () => {
        if (
            !materialId &&
            !batchId &&
            !serialNumberId &&
            !sourceDocumentId &&
            !transactionId
        ) {
            pushToast(
                'danger',
                'Required',
                'Provide at least one trace key (material, batch, serial, document, or transaction)',
            )
            return
        }
        setLoading(true)
        try {
            const res = await inventoryService.traceability({
                companyId: companyId || undefined,
                materialId: materialId || undefined,
                batchId: batchId || undefined,
                serialNumberId: serialNumberId || undefined,
                sourceDocumentId: sourceDocumentId || undefined,
                transactionId: transactionId || undefined,
                page,
                limit: 50,
            })
            setRows(res.data)
            setMeta({
                total: res.meta.total,
                page: res.meta.page,
                limit: res.meta.limit,
            })
        } catch (e: any) {
            pushToast('danger', 'Trace failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [companyId, materialId, batchId, serialNumberId, sourceDocumentId, transactionId, page])

    const searchGenealogy = useCallback(async () => {
        if (tab === 'serial') {
            if (!serialNumberId) {
                pushToast('danger', 'Required', 'Enter a Serial ID for serial history')
                return
            }
            setLoading(true)
            try {
                const res = await traceabilityService.getSerial(serialNumberId)
                setChain(res.history ?? [])
                setBatchSummary(null)
                setWhereUsed([])
            } catch (e: any) {
                pushToast('danger', 'Serial trace failed', e?.response?.data?.message ?? e.message)
            } finally {
                setLoading(false)
            }
            return
        }

        if (!batchId) {
            pushToast('danger', 'Required', 'Enter a Batch ID for genealogy tabs')
            return
        }

        setLoading(true)
        try {
            if (tab === 'forward') {
                const [fwd, detail] = await Promise.all([
                    traceabilityService.batchForward(batchId),
                    traceabilityService.getBatch(batchId),
                ])
                setChain(fwd.chain ?? [])
                setBatchSummary(detail)
                setWhereUsed([])
            } else if (tab === 'backward') {
                const [bwd, detail] = await Promise.all([
                    traceabilityService.batchBackward(batchId),
                    traceabilityService.getBatch(batchId),
                ])
                setChain(bwd.chain ?? [])
                setBatchSummary(detail)
                setWhereUsed([])
            } else if (tab === 'whereUsed') {
                const [wu, detail] = await Promise.all([
                    traceabilityService.batchWhereUsed(batchId),
                    traceabilityService.getBatch(batchId),
                ])
                setWhereUsed(wu.whereUsed ?? [])
                setBatchSummary(detail)
                setChain([])
            }
        } catch (e: any) {
            pushToast('danger', 'Genealogy failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [tab, batchId, serialNumberId])

    const runSearch = useCallback(() => {
        setHasSearched(true)
        setPage(1)
        if (tab === 'ledger') searchLedger()
        else searchGenealogy()
    }, [tab, searchLedger, searchGenealogy])

    useEffect(() => {
        if (hasSearched && tab === 'ledger' && page > 1) {
            searchLedger()
        }
    }, [page, hasSearched, searchLedger, tab])

    const ledgerColumns = useMemo(
        () =>
            buildTransactionColumns([
                'transaction',
                'movement',
                'material',
                'location',
                'quantity',
                'reference',
                'reverses',
                'idempotency',
            ]),
        [],
    )

    const chainColumns: ColumnDef<TraceChainNode>[] = useMemo(
        () => [
            {
                header: 'Transaction',
                cell: ({ row }) => (
                    <div className="min-w-[10rem]">
                        <div className="whitespace-nowrap font-mono text-xs font-semibold text-gray-900">
                            {row.original.transactionNumber}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-500">
                            {row.original.postingDate
                                ? new Date(row.original.postingDate).toLocaleDateString()
                                : '—'}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Movement',
                cell: ({ row }) => {
                    const tone = movementTone(
                        row.original.movementType,
                        row.original.signedQuantity as number | undefined,
                    )
                    return (
                        <span
                            className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${TONE_CARD[tone]}`}
                        >
                            {movementLabel(row.original.movementType)}
                        </span>
                    )
                },
            },
            {
                header: 'Material',
                cell: ({ row }) => (
                    <div className="min-w-[10rem] max-w-[12rem]">
                        <div className="truncate font-semibold text-gray-900">
                            {row.original.material?.materialCode ?? '—'}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                            {row.original.material?.materialName ?? '—'}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Quantity',
                cell: ({ row }) => {
                    const tone = movementTone(
                        row.original.movementType,
                        row.original.signedQuantity as number | undefined,
                    )
                    return (
                        <div className="whitespace-nowrap text-right font-semibold">
                            <span
                                className={
                                    tone === 'inbound'
                                        ? 'text-emerald-600'
                                        : tone === 'outbound'
                                          ? 'text-rose-600'
                                          : 'text-gray-900'
                                }
                            >
                                {signedQty(
                                    row.original.signedQuantity as number | undefined,
                                    row.original.quantity as number,
                                )}
                            </span>
                        </div>
                    )
                },
            },
            {
                header: 'Location',
                cell: ({ row }) => (
                    <div className="min-w-[8rem] max-w-[9rem] whitespace-nowrap text-sm text-gray-600">
                        <div className="truncate">
                            {row.original.warehouse?.code ??
                                row.original.warehouse?.name ??
                                '—'}
                        </div>
                        <div className="truncate font-mono text-xs text-gray-400">
                            {row.original.storageBin?.binCode ?? 'No bin'}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Reference',
                cell: ({ row }) => {
                    const tone = movementTone(
                        row.original.movementType,
                        row.original.signedQuantity as number | undefined,
                    )
                    return (
                        <div className="min-w-[9.5rem] max-w-[10rem]">
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                                <ReferenceDot tone={tone} />
                                <span className="min-w-0 truncate">
                                    {sourceLabel(row.original.sourceDocumentType)}
                                </span>
                            </div>
                            {row.original.sourceDocumentId ? (
                                <div className="mt-0.5 truncate whitespace-nowrap font-mono text-[11px] text-gray-400">
                                    …{row.original.sourceDocumentId.slice(-8)}
                                </div>
                            ) : null}
                        </div>
                    )
                },
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StockStatusTag status={row.original.stockStatus} />
                ),
            },
        ],
        [],
    )

    const whereUsedColumns: ColumnDef<any>[] = useMemo(
        () => [
            {
                header: 'Reference',
                cell: ({ row }) => (
                    <div className="min-w-[10rem] max-w-[11rem]">
                        <div className="truncate text-sm text-gray-700">
                            {sourceLabel(row.original.sourceDocumentType)}
                        </div>
                        <div className="truncate font-mono text-[11px] text-gray-400">
                            {row.original.sourceDocumentId
                                ? `…${String(row.original.sourceDocumentId).slice(-8)}`
                                : '—'}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Material',
                cell: ({ row }) => (
                    <div className="min-w-[10rem] max-w-[12rem]">
                        <div className="truncate font-semibold text-gray-900">
                            {row.original.material?.materialCode ?? '—'}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                            {row.original.material?.materialName ?? '—'}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Movements',
                cell: ({ row }) => (
                    <div className="flex flex-wrap gap-1">
                        {(row.original.movementTypes ?? []).map((m: string) => (
                            <span
                                key={m}
                                className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                            >
                                {movementLabel(m)}
                            </span>
                        ))}
                    </div>
                ),
            },
            {
                header: 'Quantity',
                cell: ({ row }) => (
                    <div className="whitespace-nowrap text-right font-semibold text-gray-900">
                        {Number(row.original.totalQuantity ?? 0).toLocaleString()}
                    </div>
                ),
            },
        ],
        [],
    )

    const expiry = batchSummary?.batch

    const chips = useMemo<FilterChip[]>(() => {
        const list: FilterChip[] = []
        if (companyId)
            list.push({
                key: 'companyId',
                label: `Company: ${
                    companies.find((c) => c.value === companyId)?.label ?? companyId
                }`,
                onRemove: () => setCompanyId(''),
            })
        if (materialId)
            list.push({
                key: 'materialId',
                label: `Material: ${
                    materials.find((m) => m.value === materialId)?.label ?? materialId
                }`,
                onRemove: () => setMaterialId(''),
            })
        if (batchId)
            list.push({
                key: 'batchId',
                label: `Batch: ${batchId}`,
                onRemove: () => setBatchId(''),
            })
        if (serialNumberId)
            list.push({
                key: 'serialNumberId',
                label: `Serial: ${serialNumberId}`,
                onRemove: () => setSerialNumberId(''),
            })
        if (sourceDocumentId)
            list.push({
                key: 'sourceDocumentId',
                label: `Document: ${sourceDocumentId}`,
                onRemove: () => setSourceDocumentId(''),
            })
        if (transactionId)
            list.push({
                key: 'transactionId',
                label: `Transaction: ${transactionId}`,
                onRemove: () => setTransactionId(''),
            })
        return list
    }, [
        companyId,
        materialId,
        batchId,
        serialNumberId,
        sourceDocumentId,
        transactionId,
        companies,
        materials,
    ])

    const fields = useMemo<FilterField[]>(() => {
        const list: FilterField[] = [
            {
                key: 'companyId',
                label: 'Company',
                value: companyId,
                options: companies,
                onChange: setCompanyId,
            },
            {
                key: 'materialId',
                label: 'Material',
                value: materialId,
                options: materials,
                onChange: setMaterialId,
            },
            {
                key: 'batchId',
                label: 'Batch ID',
                kind: 'text',
                value: batchId,
                placeholder: 'Batch id…',
                onChange: setBatchId,
            },
            {
                key: 'serialNumberId',
                label: 'Serial ID',
                kind: 'text',
                value: serialNumberId,
                placeholder: 'Serial id…',
                onChange: setSerialNumberId,
            },
        ]
        if (tab === 'ledger') {
            list.push(
                {
                    key: 'sourceDocumentId',
                    label: 'Source document ID',
                    kind: 'text',
                    value: sourceDocumentId,
                    placeholder: 'Document id…',
                    onChange: setSourceDocumentId,
                },
                {
                    key: 'transactionId',
                    label: 'Transaction ID',
                    kind: 'text',
                    value: transactionId,
                    placeholder: 'Transaction id…',
                    onChange: setTransactionId,
                },
            )
        }
        return list
    }, [
        tab,
        companyId,
        materialId,
        batchId,
        serialNumberId,
        sourceDocumentId,
        transactionId,
        companies,
        materials,
    ])

    const rowCount =
        tab === 'ledger' ? meta.total : tab === 'whereUsed' ? whereUsed.length : chain.length

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Inventory Traceability"
                description="Ledger search plus batch forward/backward genealogy, where-used, and serial history — all from the immutable inventory ledger."
            />

            <FilterBar
                className="mb-4"
                fields={fields}
                chips={chips}
                onClear={() => {
                    setCompanyId('')
                    setMaterialId('')
                    setBatchId('')
                    setSerialNumberId('')
                    setSourceDocumentId('')
                    setTransactionId('')
                }}
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlineSearch />}
                        loading={loading}
                        onClick={runSearch}
                    >
                        Trace
                    </Button>
                }
            />

            <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Rows in scope"
                    value={rowCount.toLocaleString()}
                    tone="info"
                    icon={<HiOutlineClipboardList />}
                />
                <StatCard
                    label="Batch"
                    value={expiry?.batchNumber ?? '—'}
                    tone="default"
                    icon={<HiOutlineCube />}
                />
                <StatCard
                    label="Expiry"
                    value={
                        expiry?.expiryDate
                            ? new Date(expiry.expiryDate).toLocaleDateString()
                            : '—'
                    }
                    tone={
                        expiry?.isExpired
                            ? 'danger'
                            : (expiry?.daysRemaining ?? 0) < 30
                              ? 'warning'
                              : 'success'
                    }
                    icon={<HiOutlineInbox />}
                />
                <StatCard
                    label="Days remaining"
                    value={
                        expiry?.daysRemaining == null
                            ? '—'
                            : expiry?.isExpired
                              ? `Expired (${Math.abs(expiry.daysRemaining)}d)`
                              : expiry.daysRemaining
                    }
                    tone={expiry?.isExpired ? 'danger' : 'default'}
                    icon={<HiOutlineCube />}
                />
            </div>

            {expiry ? (
                <AdaptiveCard className="mb-4">
                    <div className="grid gap-2 text-sm md:grid-cols-4">
                        <div>
                            <div className="text-gray-500">Batch</div>
                            <div className="font-medium">{expiry.batchNumber}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">Manufacture</div>
                            <div>
                                {expiry.manufacturingDate
                                    ? new Date(expiry.manufacturingDate).toLocaleDateString()
                                    : '—'}
                            </div>
                        </div>
                        <div>
                            <div className="text-gray-500">Expiry</div>
                            <div>
                                {expiry.expiryDate
                                    ? new Date(expiry.expiryDate).toLocaleDateString()
                                    : '—'}
                            </div>
                        </div>
                        <div>
                            <div className="text-gray-500">Days remaining</div>
                            <div>
                                {expiry.daysRemaining == null
                                    ? '—'
                                    : expiry.isExpired
                                      ? `Expired (${Math.abs(expiry.daysRemaining)}d)`
                                      : expiry.daysRemaining}
                            </div>
                        </div>
                    </div>
                </AdaptiveCard>
            ) : null}

            <AdaptiveCard>
                <Tabs value={tab} onChange={(v) => setTab(v as TabKey)}>
                    <TabList>
                        <TabNav value="ledger">Ledger</TabNav>
                        <TabNav value="forward">Batch Forward</TabNav>
                        <TabNav value="backward">Batch Backward</TabNav>
                        <TabNav value="whereUsed">Where Used</TabNav>
                        <TabNav value="serial">Serial History</TabNav>
                    </TabList>

                    <div className="mt-4">
                        <TabContent value="ledger">
                            <DataTable
                                columns={ledgerColumns}
                                data={rows}
                                loading={loading}
                                compact
                                noData={rows.length === 0}
                                pagingData={{
                                    total: meta.total,
                                    pageIndex: page,
                                    pageSize: meta.limit,
                                }}
                                onPaginationChange={setPage}
                            />
                        </TabContent>
                        <TabContent value="forward">
                            <DataTable
                                columns={chainColumns}
                                data={chain}
                                loading={loading}
                                compact
                                noData={chain.length === 0}
                            />
                        </TabContent>
                        <TabContent value="backward">
                            <DataTable
                                columns={chainColumns}
                                data={chain}
                                loading={loading}
                                compact
                            />
                        </TabContent>
                        <TabContent value="whereUsed">
                            <DataTable
                                columns={whereUsedColumns}
                                data={whereUsed}
                                loading={loading}
                                compact
                                noData={whereUsed.length === 0}
                            />
                        </TabContent>
                        <TabContent value="serial">
                            <DataTable
                                columns={chainColumns}
                                data={chain}
                                loading={loading}
                                compact
                            />
                        </TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default TraceabilityPage
