'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Tabs from '@/components/ui/Tabs'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineSearch } from 'react-icons/hi'
import {
    inventoryService,
    type InventoryTransaction,
} from '../services/inventoryService'
import {
    traceabilityService,
    type TraceChainNode,
} from '../services/traceabilityService'
import { materialService } from '../../material-master/services/materialService'
import { orgService } from '../../material-master/services/referenceService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const { TabList, TabNav, TabContent } = Tabs

const ROUTE = '/modules/mm/inventory-management/traceability'
const LEDGER_ROUTE = '/modules/mm/inventory-management/inventory-ledger'

type Opt = { value: string; label: string }
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
    const [companies, setCompanies] = useState<Opt[]>([])
    const [materials, setMaterials] = useState<Opt[]>([])
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

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            materialService.list({ limit: 200 }),
        ])
            .then(([cos, mats]: any[]) => {
                setCompanies(
                    (Array.isArray(cos) ? cos : cos?.data ?? []).map((c: any) => ({
                        value: c.id,
                        label: c.name || c.code,
                    })),
                )
                setMaterials(
                    (mats?.data ?? []).map((m: any) => ({
                        value: m.id,
                        label: `${m.materialCode} — ${m.materialName}`,
                    })),
                )
            })
            .catch(() => undefined)
    }, [])

    const searchLedger = useCallback(async () => {
        if (!materialId && !batchId && !serialNumberId && !sourceDocumentId && !transactionId) {
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

    const ledgerColumns: ColumnDef<InventoryTransaction>[] = useMemo(
        () => [
            { header: 'Txn #', accessorKey: 'transactionNumber' },
            { header: 'Movement', accessorKey: 'movementType' },
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode ??
                    row.original.materialId.slice(0, 8),
            },
            {
                header: 'Source doc',
                cell: ({ row }) =>
                    row.original.sourceDocumentType && row.original.sourceDocumentId
                        ? `${row.original.sourceDocumentType}:${row.original.sourceDocumentId.slice(0, 8)}`
                        : '—',
            },
            {
                header: 'Qty',
                cell: ({ row }) => Number(row.original.signedQuantity ?? row.original.quantity),
            },
            {
                header: 'Reversal',
                cell: ({ row }) =>
                    row.original.reversalOfId ? (
                        <Link
                            href={`${LEDGER_ROUTE}?materialId=${row.original.materialId}`}
                            className="text-primary hover:underline"
                        >
                            {row.original.reversalOfId.slice(0, 8)}
                        </Link>
                    ) : (
                        '—'
                    ),
            },
            {
                header: 'Idempotency',
                cell: ({ row }) => row.original.idempotencyKey?.slice(0, 12) ?? '—',
            },
        ],
        [],
    )

    const chainColumns: ColumnDef<TraceChainNode>[] = useMemo(
        () => [
            { header: 'Txn #', accessorKey: 'transactionNumber' },
            {
                header: 'Date',
                cell: ({ row }) =>
                    row.original.postingDate
                        ? new Date(row.original.postingDate).toLocaleString()
                        : '—',
            },
            { header: 'Movement', accessorKey: 'movementType' },
            {
                header: 'Qty',
                cell: ({ row }) => Number(row.original.signedQuantity ?? row.original.quantity),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) =>
                    row.original.warehouse?.code ?? row.original.warehouse?.name ?? '—',
            },
            {
                header: 'Source',
                cell: ({ row }) =>
                    row.original.sourceDocumentType
                        ? `${row.original.sourceDocumentType}:${(row.original.sourceDocumentId ?? '').slice(0, 8)}`
                        : '—',
            },
            { header: 'Status', accessorKey: 'stockStatus' },
        ],
        [],
    )

    const whereUsedColumns: ColumnDef<any>[] = useMemo(
        () => [
            {
                header: 'Document',
                cell: ({ row }) =>
                    row.original.sourceDocumentType
                        ? `${row.original.sourceDocumentType}:${(row.original.sourceDocumentId ?? '').slice(0, 10)}`
                        : '—',
            },
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode ?? row.original.materialId?.slice(0, 8) ?? '—',
            },
            {
                header: 'Movements',
                cell: ({ row }) => (row.original.movementTypes ?? []).join(', '),
            },
            {
                header: 'Qty',
                cell: ({ row }) => Number(row.original.totalQuantity ?? 0),
            },
        ],
        [],
    )

    const expiry = batchSummary?.batch

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Inventory Traceability"
                description="Ledger search plus batch forward/backward genealogy, where-used, and serial history — all from the immutable inventory ledger."
            />

            <AdaptiveCard className="mb-4">
                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                    <FormItem label="Company">
                        <Select
                            isClearable
                            options={companies}
                            value={companies.find((o) => o.value === companyId) ?? null}
                            onChange={(o: any) => setCompanyId(o?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Material">
                        <Select
                            isClearable
                            options={materials}
                            value={materials.find((o) => o.value === materialId) ?? null}
                            onChange={(o: any) => setMaterialId(o?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Batch ID">
                        <Input value={batchId} onChange={(e) => setBatchId(e.target.value)} />
                    </FormItem>
                    <FormItem label="Serial ID">
                        <Input
                            value={serialNumberId}
                            onChange={(e) => setSerialNumberId(e.target.value)}
                        />
                    </FormItem>
                    {tab === 'ledger' && (
                        <>
                            <FormItem label="Source document ID">
                                <Input
                                    value={sourceDocumentId}
                                    onChange={(e) => setSourceDocumentId(e.target.value)}
                                />
                            </FormItem>
                            <FormItem label="Transaction ID">
                                <Input
                                    value={transactionId}
                                    onChange={(e) => setTransactionId(e.target.value)}
                                />
                            </FormItem>
                        </>
                    )}
                </div>
                <div className="mt-4">
                    <Button
                        variant="solid"
                        icon={<HiOutlineSearch />}
                        loading={loading}
                        onClick={runSearch}
                    >
                        Trace
                    </Button>
                </div>
            </AdaptiveCard>

            {expiry && (
                <AdaptiveCard className="mb-4">
                    <div className="grid gap-2 md:grid-cols-4 text-sm">
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
            )}

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
                                pagingData={{
                                    total: meta.total,
                                    pageIndex: page,
                                    pageSize: meta.limit,
                                }}
                                onPaginationChange={setPage}
                            />
                        </TabContent>
                        <TabContent value="forward">
                            <DataTable columns={chainColumns} data={chain} loading={loading} />
                        </TabContent>
                        <TabContent value="backward">
                            <DataTable columns={chainColumns} data={chain} loading={loading} />
                        </TabContent>
                        <TabContent value="whereUsed">
                            <DataTable
                                columns={whereUsedColumns}
                                data={whereUsed}
                                loading={loading}
                            />
                        </TabContent>
                        <TabContent value="serial">
                            <DataTable columns={chainColumns} data={chain} loading={loading} />
                        </TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default TraceabilityPage
