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
    MRP_FLAG_STATUS,
    MRP_SOURCE_STATUS,
    mrpStatusTone,
} from '../components/mrpTableUi'
import { mrpParentBreadcrumbs } from '../utils/mrpPageUi'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import Tabs from '@/components/ui/Tabs'
import { planningService } from '../services/planningService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import MrpExplanationPanel from '../components/MrpExplanationPanel'
import type { BomExplosionTrace, MaterialRequirement, MrpRun } from '../types'

const ROUTE = '/modules/mm/planning-mrp/material-requirements'
type Opt = { value: string; label: string }
type MrpTab = 'requirements' | 'trace'

const { TabList, TabNav, TabContent } = Tabs

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const MaterialRequirementsPage = () => {
    const parentBreadcrumbs = mrpParentBreadcrumbs(ROUTE)
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
    const [viewTab, setViewTab] = useState<MrpTab>('requirements')

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
                header: 'Required date',
                cell: ({ row }) => <MrpDateCell iso={row.original.requiredDate} />,
            },
            {
                header: 'Source',
                cell: ({ row }) =>
                    row.original.source ? (
                        <MrpAnimatedStatus
                            status={row.original.source}
                            tone={mrpStatusTone(row.original.source, MRP_SOURCE_STATUS)}
                        />
                    ) : (
                        <MrpPlainCell muted>—</MrpPlainCell>
                    ),
            },
            {
                header: 'Independent',
                cell: ({ row }) => (
                    <MrpQtyCell
                        value={
                            row.original.independentDemandQty != null
                                ? row.original.independentDemandQty
                                : row.original.demandQty
                        }
                    />
                ),
            },
            {
                header: 'BOM dep.',
                cell: ({ row }) => (
                    <MrpQtyCell value={row.original.bomDependentDemandQty ?? 0} />
                ),
            },
            {
                header: 'Total demand',
                cell: ({ row }) => <MrpQtyCell value={row.original.demandQty} />,
            },
            {
                header: 'Available',
                cell: ({ row }) => <MrpQtyCell value={row.original.availableQty} />,
            },
            {
                header: 'Incoming',
                cell: ({ row }) => (
                    <MrpQtyCell value={row.original.incomingQty} emphasize="success" />
                ),
            },
            {
                header: 'Safety',
                cell: ({ row }) => <MrpQtyCell value={row.original.safetyStock} />,
            },
            {
                header: 'Net',
                cell: ({ row }) => (
                    <MrpQtyCell
                        value={row.original.netRequirement}
                        emphasize={Number(row.original.netRequirement) > 0 ? 'danger' : undefined}
                    />
                ),
            },
            {
                header: 'Recommended',
                cell: ({ row }) => (
                    <MrpQtyCell value={row.original.recommendedQty} emphasize="warning" />
                ),
            },
            {
                header: 'Flags',
                cell: ({ row }) => (
                    <div className="flex gap-1 flex-wrap">
                        {row.original.shortage && (
                            <MrpAnimatedStatus
                                status="SHORTAGE"
                                tone={mrpStatusTone('SHORTAGE', MRP_FLAG_STATUS)}
                            />
                        )}
                        {row.original.belowReorderPoint && (
                            <MrpAnimatedStatus
                                status="BELOW_ROP"
                                tone={mrpStatusTone('BELOW_ROP', MRP_FLAG_STATUS)}
                            />
                        )}
                    </div>
                ),
            },
            {
                header: 'Procure by',
                cell: ({ row }) => (
                    <MrpDateCell iso={row.original.expectedProcurementDate} />
                ),
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

    const traceColumns: ColumnDef<BomExplosionTrace>[] = useMemo(
        () => [
            {
                header: 'Parent',
                cell: ({ row }) => (
                    <MrpMaterialCell
                        code={row.original.parentMaterial?.materialCode}
                        name={row.original.parentMaterial?.materialName}
                    />
                ),
            },
            {
                header: 'Component',
                cell: ({ row }) => (
                    <MrpMaterialCell
                        code={row.original.componentMaterial?.materialCode}
                        name={row.original.componentMaterial?.materialName}
                    />
                ),
            },
            {
                header: 'Level',
                cell: ({ row }) => <MrpPlainCell mono>{row.original.level}</MrpPlainCell>,
            },
            {
                header: 'Qty/Parent',
                cell: ({ row }) => <MrpQtyCell value={row.original.quantityPer} />,
            },
            {
                header: 'Gross',
                cell: ({ row }) => <MrpQtyCell value={row.original.grossComponentQty} />,
            },
            {
                header: 'Reason',
                cell: ({ row }) => <MrpPlainCell>{row.original.explosionReason}</MrpPlainCell>,
            },
        ],
        [],
    )

    const traceMaterialOptions = useMemo(
        () => [
            ...new Map(
                traces.map((t) => [
                    t.componentMaterialId,
                    {
                        value: t.componentMaterialId,
                        label:
                            t.componentMaterial?.materialCode ??
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
                            t.parentMaterial?.materialCode ?? t.parentMaterialId,
                    },
                ]),
            ).values(),
        ],
        [traces],
    )

    const filteredTraces = useMemo(
        () =>
            selectedMaterialId
                ? traces.filter(
                      (t) =>
                          t.componentMaterialId === selectedMaterialId ||
                          t.parentMaterialId === selectedMaterialId,
                  )
                : [],
        [traces, selectedMaterialId],
    )

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
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
                <Tabs value={viewTab} onChange={(v) => setViewTab(v as MrpTab)}>
                    <TabList>
                        <TabNav value="requirements">Net requirements</TabNav>
                        <TabNav value="trace" disabled={traces.length === 0}>
                            BOM explosion trace
                        </TabNav>
                    </TabList>
                    <div className="mt-4">
                        <TabContent value="requirements">
                            <MrpResponsiveTable
                                columns={columns}
                                data={rows}
                                loading={loading}
                                getRowId={(row) => row.id}
                                tableMinWidthClass="min-w-[1280px]"
                            />
                        </TabContent>
                        <TabContent value="trace">
                            {traces.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                    Run MRP with BOM explosion to view trace rows.
                                </p>
                            ) : (
                                <>
                                    <FormItem label="Material">
                                        <Select
                                            isClearable
                                            options={traceMaterialOptions}
                                            value={
                                                selectedMaterialId
                                                    ? {
                                                          value: selectedMaterialId,
                                                          label:
                                                              rows.find(
                                                                  (r) =>
                                                                      r.materialId ===
                                                                      selectedMaterialId,
                                                              )?.material
                                                                  ?.materialCode ??
                                                              selectedMaterialId,
                                                      }
                                                    : null
                                            }
                                            onChange={(o: any) =>
                                                setSelectedMaterialId(o?.value || '')
                                            }
                                        />
                                    </FormItem>
                                    <MrpResponsiveTable
                                        columns={traceColumns}
                                        data={filteredTraces}
                                        getRowId={(row, index) => row.id ?? String(index)}
                                        noData={
                                            !!selectedMaterialId &&
                                            filteredTraces.length === 0
                                        }
                                        tableMinWidthClass="min-w-[960px]"
                                    />
                                </>
                            )}
                        </TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>

            <FormDialog
                isOpen={!!explainRow}
                onClose={() => setExplainRow(null)}
                title="MRP requirement explanation"
                width={960}
            >
                <MrpExplanationPanel explanation={explainRow?.explanationJson} />
            </FormDialog>

        </PageContainer>
    )
}

export default MaterialRequirementsPage
