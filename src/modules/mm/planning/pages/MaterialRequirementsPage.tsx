'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { planningService } from '../services/planningService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import MrpExplanationPanel from '../components/MrpExplanationPanel'
import type { BomExplosionTrace, MaterialRequirement, MrpRun } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/planning-mrp/material-requirements'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const MaterialRequirementsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<MaterialRequirement[]>([])
    const [traces, setTraces] = useState<BomExplosionTrace[]>([])
    const [selectedMaterialId, setSelectedMaterialId] = useState('')
    const [runs, setRuns] = useState<Opt[]>([])
    const [loading, setLoading] = useState(true)
    const { companies, warehouses, loadFilterRefs } = useDeferredFilterRefs('companies', 'warehouses')
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [mrpRunId, setMrpRunId] = useState('')
    const [explainRow, setExplainRow] = useState<MaterialRequirement | null>(
        null,
    )

    useEffect(() => {
        if (!companyId && companies[0]) setCompanyId(companies[0].value)
    }, [companies, companyId])

    useEffect(() => {
        if (!companyId) return
        planningService
            .listMrpRuns({ companyId, limit: 50 })
            .then((res) => {
                const opts = res.data.map((r: MrpRun) => ({
                    value: r.id,
                    label: `${r.runNumber} (${r.status})`,
                }))
                setRuns(opts)
                if (opts[0] && !mrpRunId) setMrpRunId(opts[0].value)
            })
            .catch(() => undefined)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await planningService.listRequirements({
                companyId,
                warehouseId: warehouseId || undefined,
                mrpRunId: mrpRunId || undefined,
                limit: 100,
            })
            setRows(res.data)
            if (mrpRunId || companyId) {
                const traceRes = await planningService.listBomExplosionTraces({
                    companyId,
                    mrpRunId: mrpRunId || undefined,
                    warehouseId: warehouseId || undefined,
                    limit: 200,
                })
                setTraces(traceRes.data)
            } else {
                setTraces([])
            }
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId, mrpRunId])

    useEffect(() => {
        load()
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [load, loadFilterRefs])

    const columns: ColumnDef<MaterialRequirement>[] = useMemo(
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
                header: 'Required date',
                cell: ({ row }) =>
                    row.original.requiredDate
                        ? String(row.original.requiredDate).slice(0, 10)
                        : '—',
            },
            {
                header: 'Source',
                cell: ({ row }) =>
                    row.original.source ? (
                        <StatusBadge status={row.original.source} />
                    ) : (
                        '—'
                    ),
            },
            {
                header: 'Independent',
                cell: ({ row }) =>
                    row.original.independentDemandQty != null
                        ? Number(row.original.independentDemandQty)
                        : Number(row.original.demandQty),
            },
            {
                header: 'BOM dep.',
                cell: ({ row }) =>
                    row.original.bomDependentDemandQty != null
                        ? Number(row.original.bomDependentDemandQty)
                        : 0,
            },
            {
                header: 'Total demand',
                cell: ({ row }) => Number(row.original.demandQty),
            },
            {
                header: 'Available',
                cell: ({ row }) => Number(row.original.availableQty),
            },
            {
                header: 'Incoming',
                cell: ({ row }) => Number(row.original.incomingQty),
            },
            {
                header: 'Safety',
                cell: ({ row }) => Number(row.original.safetyStock),
            },
            {
                header: 'Net',
                cell: ({ row }) => Number(row.original.netRequirement),
            },
            {
                header: 'Recommended',
                cell: ({ row }) => Number(row.original.recommendedQty),
            },
            {
                header: 'Flags',
                cell: ({ row }) => (
                    <div className="flex gap-1 flex-wrap">
                        {row.original.shortage && (
                            <StatusBadge status="SHORTAGE" />
                        )}
                        {row.original.belowReorderPoint && (
                            <StatusBadge status="BELOW_ROP" />
                        )}
                    </div>
                ),
            },
            {
                header: 'Procure by',
                cell: ({ row }) =>
                    row.original.expectedProcurementDate
                        ? String(row.original.expectedProcurementDate).slice(0, 10)
                        : '—',
            },
            {
                header: 'Actions',
                cell: ({ row }) =>
                    Number(row.original.recommendedQty) > 0 ||
                    row.original.explanationJson ? (
                        <Button
                            size="xs"
                            onClick={() => setExplainRow(row.original)}
                        >
                            View explanation
                        </Button>
                    ) : null,
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Material Requirements"
                description="Netting results from MRP runs"
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
                    <FormItem label="MRP Run">
                        <Select
                            isClearable
                            options={runs}
                            value={runs.find((o) => o.value === mrpRunId) || null}
                            onChange={(o: any) => setMrpRunId(o?.value || '')}
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
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={!!explainRow}
                onClose={() => setExplainRow(null)}
                title="MRP requirement explanation"
                width={960}
            >
                <MrpExplanationPanel explanation={explainRow?.explanationJson} />
            </FormDialog>

            {traces.length > 0 && (
                <AdaptiveCard className="mt-4">
                    <FormItem label="View BOM trace for material">
                        <Select
                            isClearable
                            options={[
                                ...new Map(
                                    traces.map((t) => [
                                        t.componentMaterialId,
                                        {
                                            value: t.componentMaterialId,
                                            label:
                                                t.componentMaterial
                                                    ?.materialCode ??
                                                t.componentMaterialId,
                                        },
                                    ]),
                                ).values(),
                                ...new Map(
                                    traces.map((t) => [
                                        t.parentMaterialId,
                                        {
                                            value: t.parentMaterialId,
                                            label:
                                                t.parentMaterial?.materialCode ??
                                                t.parentMaterialId,
                                        },
                                    ]),
                                ).values(),
                            ]}
                            value={
                                selectedMaterialId
                                    ? {
                                          value: selectedMaterialId,
                                          label:
                                              rows.find(
                                                  (r) =>
                                                      r.materialId ===
                                                      selectedMaterialId,
                                              )?.material?.materialCode ??
                                              selectedMaterialId,
                                      }
                                    : null
                            }
                            onChange={(o: any) =>
                                setSelectedMaterialId(o?.value || '')
                            }
                        />
                    </FormItem>
                </AdaptiveCard>
            )}
            {selectedMaterialId && traces.length > 0 && (
                <AdaptiveCard className="mt-4">
                    <h3 className="font-semibold mb-3">BOM Explosion Trace</h3>
                    <DataTable
                        columns={[
                            {
                                header: 'Parent',
                                cell: ({ row }) =>
                                    row.original.parentMaterial?.materialCode ??
                                    '—',
                            },
                            {
                                header: 'Component',
                                cell: ({ row }) =>
                                    row.original.componentMaterial?.materialCode ??
                                    '—',
                            },
                            {
                                header: 'Level',
                                cell: ({ row }) => row.original.level,
                            },
                            {
                                header: 'Qty/Parent',
                                cell: ({ row }) =>
                                    Number(row.original.quantityPer),
                            },
                            {
                                header: 'Gross',
                                cell: ({ row }) =>
                                    Number(row.original.grossComponentQty),
                            },
                            {
                                header: 'Reason',
                                cell: ({ row }) =>
                                    row.original.explosionReason ?? '—',
                            },
                        ]}
                        data={traces.filter(
                            (t) =>
                                t.componentMaterialId === selectedMaterialId ||
                                t.parentMaterialId === selectedMaterialId,
                        )}
                    />
                </AdaptiveCard>
            )}
        </PageContainer>
    )
}

export default MaterialRequirementsPage
