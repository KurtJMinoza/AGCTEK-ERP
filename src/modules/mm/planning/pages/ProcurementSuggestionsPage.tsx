'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { planningService } from '../services/planningService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { ProcurementSuggestion } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

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
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<ProcurementSuggestion[]>([])
    const [loading, setLoading] = useState(true)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [status, setStatus] = useState('OPEN')
    const [convertId, setConvertId] = useState<string | null>(null)
    const [dismissId, setDismissId] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [requesterId, setRequesterId] = useState('mrp-planner')
    const [purpose, setPurpose] = useState('MRP replenishment')

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
        ]).then(([cos, wh]: any[]) => {
            const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map(
                (x: any) => ({ value: x.id, label: x.name || x.code }),
            )
            setCompanies(c)
            setWarehouses(
                (wh?.data ?? []).map((x: any) => ({
                    value: x.id,
                    label: `${x.code} — ${x.name}`,
                })),
            )
            if (c[0]) setCompanyId(c[0].value)
        })
    }, [])

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
    }, [load])

    const columns: ColumnDef<ProcurementSuggestion>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) => row.original.material?.materialCode ?? '—',
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.code ?? '—',
            },
            {
                header: 'Type',
                cell: ({ row }) => (
                    <StatusBadge status={row.original.suggestionType} />
                ),
            },
            {
                header: 'Qty',
                cell: ({ row }) => Number(row.original.quantity),
            },
            {
                header: 'Supplier',
                cell: ({ row }) =>
                    row.original.preferredSupplier
                        ? row.original.preferredSupplier.supplierCode
                        : '—',
            },
            {
                header: 'Lead time',
                cell: ({ row }) =>
                    row.original.leadTimeDays != null
                        ? `${row.original.leadTimeDays}d`
                        : '—',
            },
            {
                header: 'Reason',
                cell: ({ row }) =>
                    row.original.reason ? (
                        <StatusBadge status={row.original.reason} />
                    ) : (
                        '—'
                    ),
            },
            {
                header: 'Expected',
                cell: ({ row }) =>
                    String(row.original.requiredDate).slice(0, 10),
            },
            {
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                header: 'PR',
                cell: ({ row }) =>
                    row.original.purchaseRequisition?.requisitionNumber ?? '—',
            },
            {
                header: 'Actions',
                cell: ({ row }) =>
                    row.original.status === 'OPEN' ? (
                        <div className="flex gap-2">
                            <Button
                                size="xs"
                                variant="solid"
                                onClick={() => setConvertId(row.original.id)}
                            >
                                Convert to PR
                            </Button>
                            <Button
                                size="xs"
                                onClick={() => setDismissId(row.original.id)}
                            >
                                Dismiss
                            </Button>
                        </div>
                    ) : null,
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
                `DRAFT PR ${res.purchaseRequisition.requisitionNumber}`,
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
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Procurement Suggestions"
                description="MRP recommendations — convert to DRAFT PR on demand (never auto-PO)"
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
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={!!convertId}
                onClose={() => setConvertId(null)}
                title="Convert to DRAFT Purchase Requisition"
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
