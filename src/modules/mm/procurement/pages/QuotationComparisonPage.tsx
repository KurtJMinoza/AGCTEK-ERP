'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineBadgeCheck, HiOutlineChartBar, HiOutlineExternalLink } from 'react-icons/hi'
import { rfqService } from '../services/rfqService'
import type {
    MmRfq,
    RfqComparisonResponse,
    RfqComparisonRow,
} from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE_PATH = '/modules/mm/procurement/quotation-comparison'
const RFQ_PATH = '/modules/mm/procurement/rfqs'

const COMPARABLE_STATUSES = [
    'ISSUED',
    'PARTIALLY_RESPONDED',
    'RESPONDED',
    'EVALUATION',
    'AWARDED',
]

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    ISSUED: 'info',
    PARTIALLY_RESPONDED: 'warning',
    RESPONDED: 'info',
    EVALUATION: 'warning',
    AWARDED: 'success',
    SUBMITTED: 'info',
    WITHDRAWN: 'default',
    EXPIRED: 'danger',
    SELECTED: 'success',
}

type FilterOption = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

const QuotationComparisonPageInner = () => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE_PATH)

    const [rfqOptions, setRfqOptions] = useState<FilterOption[]>([])
    const [rfqMap, setRfqMap] = useState<Record<string, MmRfq>>({})
    const [selectedRfqId, setSelectedRfqId] = useState(searchParams.get('rfqId') || '')
    const [comparison, setComparison] = useState<RfqComparisonResponse | null>(null)
    const [loadingRfqs, setLoadingRfqs] = useState(true)
    const [loadingComparison, setLoadingComparison] = useState(false)

    const [awardOpen, setAwardOpen] = useState(false)
    const [awardForm, setAwardForm] = useState({
        quotationId: '',
        reason: '',
        evaluatedBy: 'current-user',
        useCheapest: false,
    })
    const [awardTouched, setAwardTouched] = useState<Record<string, boolean>>({})
    const [awardForce, setAwardForce] = useState(false)
    const [awarding, setAwarding] = useState(false)

    useEffect(() => {
        setLoadingRfqs(true)
        Promise.all(
            COMPARABLE_STATUSES.map((status) =>
                rfqService.list({ status, page: 1, pageSize: 100 }).catch(() => ({
                    data: [] as MmRfq[],
                    total: 0,
                    page: 1,
                    pageSize: 100,
                })),
            ),
        )
            .then((results) => {
                const map: Record<string, MmRfq> = {}
                const opts: FilterOption[] = []
                for (const res of results) {
                    for (const r of res.data) {
                        if (!map[r.id]) {
                            map[r.id] = r
                            opts.push({
                                value: r.id,
                                label: `${r.rfqNumber} — ${r.status.replace(/_/g, ' ')}${r.purpose ? ` (${r.purpose.slice(0, 30)})` : ''}`,
                            })
                        }
                    }
                }
                opts.sort((a, b) => a.label.localeCompare(b.label))
                setRfqMap(map)
                setRfqOptions(opts)
            })
            .finally(() => setLoadingRfqs(false))
    }, [])

    const loadComparison = useCallback(async (rfqId: string) => {
        if (!rfqId) {
            setComparison(null)
            return
        }
        setLoadingComparison(true)
        try {
            const data = await rfqService.getComparison(rfqId)
            setComparison(data)
        } catch {
            setComparison(null)
            pushToast('danger', 'Error', 'Failed to load comparison')
        } finally {
            setLoadingComparison(false)
        }
    }, [])

    useEffect(() => {
        if (selectedRfqId) loadComparison(selectedRfqId)
        else setComparison(null)
    }, [selectedRfqId, loadComparison])

    const awardErrors = useMemo<FieldErrors>(() => ({
        quotationId: awardForm.useCheapest ? undefined : required(awardForm.quotationId, 'Quotation'),
        reason: required(awardForm.reason, 'Reason'),
    }), [awardForm])

    const quotationOptions = useMemo(() => {
        return (comparison?.quotations ?? [])
            .filter((r) => r.status === 'SUBMITTED' && !r.expired)
            .map((r) => ({
                value: r.quotationId,
                label: `${r.quotationNumber} — ${r.supplierName} (${r.total.toFixed(2)})`,
            }))
    }, [comparison])

    const openAward = () => {
        setAwardForm({
            quotationId: comparison?.cheapestQuotationId || '',
            reason: '',
            evaluatedBy: 'current-user',
            useCheapest: false,
        })
        setAwardTouched({})
        setAwardForce(false)
        setAwardOpen(true)
    }

    const handleAward = async () => {
        setAwardForce(true)
        if (Object.values(awardErrors).some(Boolean) || !selectedRfqId) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields.')
            return
        }
        setAwarding(true)
        try {
            await rfqService.award(selectedRfqId, {
                quotationId: awardForm.useCheapest ? undefined : awardForm.quotationId || undefined,
                reason: awardForm.reason,
                evaluatedBy: awardForm.evaluatedBy || undefined,
                useCheapest: awardForm.useCheapest || undefined,
            })
            pushToast('success', 'Awarded', 'RFQ awarded successfully.')
            setAwardOpen(false)
            loadComparison(selectedRfqId)
            const refreshed = await rfqService.get(selectedRfqId)
            setRfqMap((m) => ({ ...m, [selectedRfqId]: refreshed }))
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Award failed')
        } finally {
            setAwarding(false)
        }
    }

    const columns = useMemo<ColumnDef<RfqComparisonRow>[]>(() => [
        {
            header: 'Supplier',
            accessorKey: 'supplierName',
            cell: ({ row }) => {
                const isCheapest = comparison?.cheapestQuotationId === row.original.quotationId
                return (
                    <div className="flex flex-col">
                        <span className={`text-sm font-medium ${isCheapest ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                            {row.original.supplierCode} — {row.original.supplierName}
                        </span>
                        {isCheapest && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                                Lowest total
                            </span>
                        )}
                    </div>
                )
            },
        },
        {
            header: 'Quotation',
            accessorKey: 'quotationNumber',
            cell: ({ row }) => <span className="font-mono text-xs">{row.original.quotationNumber}</span>,
        },
        {
            header: 'Avg Price',
            accessorKey: 'avgUnitPrice',
            cell: ({ row }) => <span>{row.original.avgUnitPrice.toFixed(2)}</span>,
        },
        {
            header: 'Freight',
            accessorKey: 'freight',
            cell: ({ row }) => <span>{Number(row.original.freight).toFixed(2)}</span>,
        },
        {
            header: 'Tax',
            accessorKey: 'tax',
            cell: ({ row }) => <span>{Number(row.original.tax).toFixed(2)}</span>,
        },
        {
            header: 'Landed Cost',
            id: 'landedCost',
            cell: ({ row }) => {
                const landed = row.original.landedCost ?? row.original.total
                const isCheapest = comparison?.cheapestQuotationId === row.original.quotationId
                return (
                    <span className={`font-semibold ${isCheapest ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                        {Number(landed).toFixed(2)}
                    </span>
                )
            },
        },
        {
            header: 'Lead Time',
            accessorKey: 'avgLeadTimeDays',
            cell: ({ row }) => (
                <span>
                    {row.original.avgLeadTimeDays != null
                        ? `${row.original.avgLeadTimeDays.toFixed(0)}d`
                        : '—'}
                </span>
            ),
        },
        {
            header: 'MOQ',
            accessorKey: 'maxMoq',
            cell: ({ row }) => <span>{row.original.maxMoq != null ? row.original.maxMoq : '—'}</span>,
        },
        {
            header: 'Payment Terms',
            id: 'payment',
            cell: ({ row }) => <span className="text-xs">{row.original.paymentTerms?.name || '—'}</span>,
        },
        {
            header: 'Delivery Terms',
            id: 'delivery',
            cell: ({ row }) => <span className="text-xs">{row.original.deliveryTerms || '—'}</span>,
        },
        {
            header: 'Quality',
            accessorKey: 'qualityScore',
            cell: ({ row }) => <span>{row.original.qualityScore ?? '—'}</span>,
        },
        {
            header: 'Supplier Score',
            accessorKey: 'supplierScore',
            cell: ({ row }) => <span>{row.original.supplierScore ?? '—'}</span>,
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {String(row.original.status)}
                    {row.original.expired ? ' (EXPIRED)' : ''}
                </StatusBadge>
            ),
        },
    ], [comparison])

    const selectedRfq = rfqMap[selectedRfqId] || comparison?.rfq
    const canAward = comparison?.rfq?.status === 'EVALUATION'
    const awErr = (key: string) => visibleError(awardErrors, awardTouched, key, awardForce)

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Quotation Comparison"
                description="Compare submitted quotations side by side. Cheapest is highlighted — never auto-awarded unless enabled on the RFQ."
                actions={
                    selectedRfqId ? (
                        <Button
                            size="sm"
                            icon={<HiOutlineExternalLink />}
                            onClick={() => router.push(`${RFQ_PATH}/${selectedRfqId}`)}
                        >
                            Open RFQ
                        </Button>
                    ) : undefined
                }
            />

            <AdaptiveCard className="mt-4">
                <div className="space-y-4">
                    <FormItem label="Select RFQ">
                        {loadingRfqs ? (
                            <div className="flex h-10 items-center"><Spinner size={24} /></div>
                        ) : (
                            <Select<FilterOption>
                                options={rfqOptions}
                                value={rfqOptions.find((o) => o.value === selectedRfqId) ?? null}
                                onChange={(opt) => setSelectedRfqId(opt?.value ?? '')}
                                placeholder="Choose an issued / responded / evaluation RFQ"
                                isClearable
                            />
                        )}
                    </FormItem>

                    {selectedRfq && (
                        <div className="flex flex-wrap items-center gap-3">
                            <StatusBadge tone={STATUS_TONE[selectedRfq.status] ?? 'default'}>
                                {String(selectedRfq.status).replace(/_/g, ' ')}
                            </StatusBadge>
                            <span className="text-sm text-gray-500">
                                Deadline:{' '}
                                {new Date(
                                    'responseDeadline' in selectedRfq
                                        ? selectedRfq.responseDeadline
                                        : '',
                                ).toLocaleDateString()}
                            </span>
                            {'autoSelectCheapest' in selectedRfq && (
                                <span className="text-xs text-gray-400">
                                    Auto cheapest: {selectedRfq.autoSelectCheapest ? 'On' : 'Off'}
                                </span>
                            )}
                        </div>
                    )}

                    {!selectedRfqId && (
                        <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
                            <HiOutlineChartBar className="text-4xl" />
                            <p className="text-sm font-medium">Select an RFQ to view the comparison matrix</p>
                        </div>
                    )}

                    {selectedRfqId && loadingComparison && (
                        <div className="flex h-48 items-center justify-center"><Spinner size={36} /></div>
                    )}

                    {selectedRfqId && !loadingComparison && comparison && (
                        <div className="space-y-4">
                            {comparison.awardHint && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
                                    {comparison.awardHint}
                                    {comparison.cheapestQuotationId && (
                                        <span className="ml-1 opacity-80">
                                            (Lowest total is highlighted — not auto-selected.)
                                        </span>
                                    )}
                                </div>
                            )}

                            <DataTable<RfqComparisonRow>
                                columns={columns}
                                data={comparison.quotations}
                                compact
                                fit
                                noData={comparison.quotations.length === 0}
                            />

                            {canAward && (
                                <div className="flex justify-end">
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        icon={<HiOutlineBadgeCheck />}
                                        onClick={openAward}
                                    >
                                        Award Winner
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </AdaptiveCard>

            <FormDialog
                isOpen={awardOpen}
                onClose={() => setAwardOpen(false)}
                width={520}
                title="Award RFQ"
                description="Select a winning quotation from the comparison."
                icon={<HiOutlineBadgeCheck />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAwardOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={awarding} onClick={handleAward}>
                            Confirm Award
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    {comparison?.rfq?.autoSelectCheapest && (
                        <Checkbox
                            checked={awardForm.useCheapest}
                            onChange={(v) => {
                                setAwardForm((p) => ({ ...p, useCheapest: v }))
                                setAwardTouched((t) => ({ ...t, quotationId: true }))
                            }}
                        >
                            Use cheapest eligible quotation
                        </Checkbox>
                    )}
                    {!awardForm.useCheapest && (
                        <FormItem
                            label="Quotation"
                            asterisk
                            invalid={Boolean(awErr('quotationId'))}
                            errorMessage={awErr('quotationId')}
                        >
                            <Select<FilterOption>
                                options={quotationOptions}
                                value={quotationOptions.find((o) => o.value === awardForm.quotationId) ?? null}
                                onChange={(opt) => {
                                    setAwardForm((p) => ({ ...p, quotationId: opt?.value ?? '' }))
                                    setAwardTouched((t) => ({ ...t, quotationId: true }))
                                }}
                            />
                        </FormItem>
                    )}
                    <FormItem
                        label="Reason"
                        asterisk
                        invalid={Boolean(awErr('reason'))}
                        errorMessage={awErr('reason')}
                    >
                        <Input
                            textArea
                            value={awardForm.reason}
                            onChange={(e) => {
                                setAwardForm((p) => ({ ...p, reason: e.target.value }))
                                setAwardTouched((t) => ({ ...t, reason: true }))
                            }}
                            placeholder="Why was this supplier selected?"
                        />
                    </FormItem>
                    <FormItem label="Evaluated By">
                        <Input
                            value={awardForm.evaluatedBy}
                            onChange={(e) => setAwardForm((p) => ({ ...p, evaluatedBy: e.target.value }))}
                        />
                    </FormItem>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

const QuotationComparisonPage = () => (
    <Suspense
        fallback={
            <PageContainer>
                <div className="flex h-96 items-center justify-center"><Spinner size={40} /></div>
            </PageContainer>
        }
    >
        <QuotationComparisonPageInner />
    </Suspense>
)

export default QuotationComparisonPage
