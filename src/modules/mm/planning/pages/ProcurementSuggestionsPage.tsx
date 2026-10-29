'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import MrpResponsiveTable, { type ColumnDef } from '../components/MrpResponsiveTable'
import {
    MrpAnimatedStatus,
    MrpDateCell,
    MrpMaterialCell,
    MrpPlainCell,
    MrpQtyCell,
    MRP_SUGGESTION_STATUS,
    mrpStatusTone,
} from '../components/mrpTableUi'
import { mrpParentBreadcrumbs } from '../utils/mrpPageUi'
import { SmEntityCell } from '@/modules/mm/supplier-management/components/SupplierTableCells'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { planningService } from '../services/planningService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import MrpExplanationPanel from '../components/MrpExplanationPanel'
import type { ProcurementSuggestion } from '../types'

const ROUTE = '/modules/mm/planning-mrp/procurement-suggestions'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const ProcurementSuggestionsPage = () => {
    const parentBreadcrumbs = mrpParentBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<ProcurementSuggestion[]>([])
    const [loading, setLoading] = useState(true)
    const { companies, warehouses, loadFilterRefs } = useDeferredFilterRefs('companies', 'warehouses')
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [status, setStatus] = useState('OPEN')
    const [convertId, setConvertId] = useState<string | null>(null)
    const [dismissId, setDismissId] = useState<string | null>(null)
    const [explainRow, setExplainRow] = useState<ProcurementSuggestion | null>(
        null,
    )
    const [submitting, setSubmitting] = useState(false)
    const [requesterId, setRequesterId] = useState('mrp-planner')
    const [purpose, setPurpose] = useState('MRP replenishment')

    useEffect(() => {
        if (!companyId && companies[0]) setCompanyId(companies[0].value)
    }, [companies, companyId])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await planningService.listSuggestions({
                companyId,
                warehouseId: warehouseId || undefined,
                status: status || undefined,
                limit: 100,
            })
            setRows(res.data)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId, status])

    useEffect(() => {
        load()
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [load, loadFilterRefs])

    const columns: ColumnDef<ProcurementSuggestion>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) => (
                    <MrpMaterialCell
                        code={row.original.material?.materialCode}
                        name={row.original.material?.materialName}
                    />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <MrpPlainCell mono>{row.original.warehouse?.code}</MrpPlainCell>
                ),
            },
            {
                header: 'Type',
                cell: ({ row }) => (
                    <MrpAnimatedStatus status={row.original.suggestionType} tone="info" />
                ),
            },
            {
                header: 'Qty',
                cell: ({ row }) => (
                    <MrpQtyCell value={row.original.quantity} emphasize="warning" />
                ),
            },
            {
                header: 'Supplier',
                cell: ({ row }) => (
                    <SmEntityCell
                        kind="supplier"
                        primary={row.original.preferredSupplier?.supplierName}
                        secondary={row.original.preferredSupplier?.supplierCode}
                    />
                ),
            },
            {
                header: 'Lead time',
                cell: ({ row }) => (
                    <MrpPlainCell mono>
                        {row.original.leadTimeDays != null
                            ? `${row.original.leadTimeDays}d`
                            : undefined}
                    </MrpPlainCell>
                ),
            },
            {
                header: 'Demand source',
                cell: ({ row }) => <MrpPlainCell>{row.original.demandSource}</MrpPlainCell>,
            },
            {
                header: 'MOQ',
                cell: ({ row }) => <MrpQtyCell value={row.original.moq} />,
            },
            {
                header: 'Reason',
                cell: ({ row }) => {
                    const reason = row.original.shortageReason || row.original.reason
                    return reason ? (
                        <MrpAnimatedStatus status={reason} tone="warning" />
                    ) : (
                        <MrpPlainCell muted>—</MrpPlainCell>
                    )
                },
            },
            {
                header: 'Expected',
                cell: ({ row }) => <MrpDateCell iso={row.original.requiredDate} />,
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <MrpAnimatedStatus
                        status={row.original.status}
                        tone={mrpStatusTone(row.original.status, MRP_SUGGESTION_STATUS)}
                    />
                ),
            },
            {
                header: 'Request',
                cell: ({ row }) => (
                    <MrpPlainCell mono>
                        {row.original.purchaseRequisition?.requisitionNumber}
                    </MrpPlainCell>
                ),
            },
            {
                header: 'Actions',
                cell: ({ row }) => (
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="xs"
                            onClick={() => setExplainRow(row.original)}
                        >
                            View explanation
                        </Button>
                        {row.original.status === 'OPEN' ? (
                            <>
                                <Button
                                    size="xs"
                                    variant="solid"
                                    onClick={() => setConvertId(row.original.id)}
                                >
                                    Convert to request
                                </Button>
                                <Button
                                    size="xs"
                                    onClick={() => setDismissId(row.original.id)}
                                >
                                    Dismiss
                                </Button>
                            </>
                        ) : null}
                    </div>
                ),
            },
        ],
        [],
    )

    const convert = async () => {
        if (!convertId) return
        setSubmitting(true)
        try {
            const res = await planningService.convertSuggestion(convertId, {
                requesterId,
                purpose,
            })
            pushToast(
                'success',
                'Converted',
                `DRAFT purchase request ${res.purchaseRequisition.requisitionNumber}`,
            )
            setConvertId(null)
            load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Convert failed')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Procurement Suggestions"
                description="MRP recommendations — convert to DRAFT purchase request on demand (never auto-PO)"
            />
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId)}
                            onChange={(o: any) => setCompanyId(o?.value || '')}
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            isClearable
                            options={warehouses}
                            value={
                                warehouses.find((o) => o.value === warehouseId) ||
                                null
                            }
                            onChange={(o: any) => setWarehouseId(o?.value || '')}
                        />
                    </FormItem>
                    <FormItem label="Status">
                        <Select
                            options={[
                                { value: 'OPEN', label: 'Open' },
                                { value: 'CONVERTED', label: 'Converted' },
                                { value: 'DISMISSED', label: 'Dismissed' },
                            ]}
                            value={{ value: status, label: status }}
                            onChange={(o: any) => setStatus(o?.value || 'OPEN')}
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <MrpResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    tableMinWidthClass="min-w-[1200px]"
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={!!explainRow}
                onClose={() => setExplainRow(null)}
                title="MRP recommendation explanation"
                width={960}
            >
                <MrpExplanationPanel
                    explanation={explainRow?.explanationJson}
                    fallbackText={explainRow?.explanation}
                />
            </FormDialog>

            <FormDialog
                isOpen={!!convertId}
                onClose={() => setConvertId(null)}
                title="Convert to DRAFT purchase request"
                footer={
                    <>
                        <Button size="sm" onClick={() => setConvertId(null)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={convert}
                        >
                            Convert
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Requester ID">
                        <Input
                            value={requesterId}
                            onChange={(e) => setRequesterId(e.target.value)}
                        />
                    </FormItem>
                    <FormItem label="Purpose">
                        <Input
                            value={purpose}
                            onChange={(e) => setPurpose(e.target.value)}
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <ConfirmDialog
                isOpen={!!dismissId}
                type="warning"
                title="Dismiss suggestion?"
                onCancel={() => setDismissId(null)}
                onConfirm={async () => {
                    if (!dismissId) return
                    await planningService.dismissSuggestion(dismissId)
                    setDismissId(null)
                    load()
                }}
            >
                <p>This suggestion will be marked dismissed.</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default ProcurementSuggestionsPage
