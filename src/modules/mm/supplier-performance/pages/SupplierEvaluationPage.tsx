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
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Card from '@/components/ui/Card'
import Tabs from '@/components/ui/Tabs'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlay, HiOutlineSave } from 'react-icons/hi'
import { supplierPerformanceService } from '../services/supplierPerformanceService'
import { orgService } from '../../material-master/services/referenceService'
import type {
    SupplierEvaluation,
    SupplierPerfAlert,
    ScoreWeightConfig,
    AlertConfig,
} from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/supplier-management/supplier-evaluation'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function monthBounds() {
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
    return {
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10),
    }
}

const SupplierEvaluationPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [tab, setTab] = useState('run')
    const [companies, setCompanies] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [evaluations, setEvaluations] = useState<SupplierEvaluation[]>([])
    const [alerts, setAlerts] = useState<SupplierPerfAlert[]>([])
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [period, setPeriod] = useState(monthBounds)
    const [weights, setWeights] = useState<ScoreWeightConfig>({
        companyId: '',
        deliveryWeight: 25,
        qualityWeight: 25,
        priceWeight: 20,
        quantityWeight: 15,
        serviceWeight: 10,
        complianceWeight: 5,
    })
    const [alertCfg, setAlertCfg] = useState<AlertConfig>({
        companyId: '',
        scoreThreshold: 70,
        lateDeliveryRateThreshold: 0.25,
        rejectionRateThreshold: 0.1,
        shortageRateThreshold: 0.15,
        priceVarianceThreshold: 0.1,
        isActive: true,
    })
    const [runOpen, setRunOpen] = useState(false)

    useEffect(() => {
        orgService.companies().then((cos: any) => {
            const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map(
                (x: any) => ({ value: x.id, label: x.name || x.code }),
            )
            setCompanies(c)
            if (c[0]) setCompanyId(c[0].value)
        })
    }, [])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const [evals, al, w, a] = await Promise.all([
                supplierPerformanceService.listEvaluations({
                    companyId,
                    limit: 50,
                }),
                supplierPerformanceService.listAlerts({
                    companyId,
                    status: 'OPEN',
                    limit: 50,
                }),
                supplierPerformanceService.getWeights(companyId),
                supplierPerformanceService.getAlertConfig(companyId),
            ])
            setEvaluations(evals.data)
            setAlerts(al.data)
            setWeights({ ...w, companyId })
            setAlertCfg({
                companyId,
                scoreThreshold: Number(a.scoreThreshold),
                lateDeliveryRateThreshold: Number(
                    a.lateDeliveryRateThreshold ?? 0.25,
                ),
                rejectionRateThreshold: Number(a.rejectionRateThreshold ?? 0.1),
                shortageRateThreshold: Number(a.shortageRateThreshold ?? 0.15),
                priceVarianceThreshold: Number(a.priceVarianceThreshold ?? 0.1),
                isActive: a.isActive,
                id: a.id,
            })
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const runEval = async () => {
        setSubmitting(true)
        try {
            const res = await supplierPerformanceService.runEvaluation({
                companyId,
                periodStart: period.periodStart,
                periodEnd: period.periodEnd,
            })
            pushToast(
                'success',
                'Evaluation complete',
                `Scored ${res.evaluated} supplier(s)`,
            )
            setRunOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Run failed')
        } finally {
            setSubmitting(false)
        }
    }

    const saveWeights = async () => {
        setSubmitting(true)
        try {
            await supplierPerformanceService.upsertWeights({ ...weights, companyId })
            pushToast('success', 'Saved', 'Score weights updated')
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Save failed')
        } finally {
            setSubmitting(false)
        }
    }

    const saveAlertCfg = async () => {
        setSubmitting(true)
        try {
            await supplierPerformanceService.upsertAlertConfig({
                companyId,
                scoreThreshold: Number(alertCfg.scoreThreshold),
                isActive: alertCfg.isActive,
            })
            pushToast('success', 'Saved', 'Alert threshold updated (no auto-block)')
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Save failed')
        } finally {
            setSubmitting(false)
        }
    }

    const evalCols: ColumnDef<SupplierEvaluation>[] = useMemo(
        () => [
            {
                header: 'Supplier',
                cell: ({ row }) =>
                    row.original.supplier
                        ? `${row.original.supplier.supplierCode}`
                        : '—',
            },
            {
                header: 'Period',
                cell: ({ row }) =>
                    `${String(row.original.periodStart).slice(0, 10)} → ${String(row.original.periodEnd).slice(0, 10)}`,
            },
            {
                header: 'Overall',
                cell: ({ row }) => Number(row.original.overallScore).toFixed(1),
            },
            {
                header: 'Delivery',
                cell: ({ row }) => Number(row.original.deliveryScore).toFixed(1),
            },
            {
                header: 'Quality',
                cell: ({ row }) => Number(row.original.qualityScore).toFixed(1),
            },
            {
                header: 'Price',
                cell: ({ row }) => Number(row.original.priceScore).toFixed(1),
            },
            {
                header: 'Quantity',
                cell: ({ row }) =>
                    Number(row.original.quantityScore ?? 0).toFixed(1),
            },
            {
                header: 'Fill %',
                cell: ({ row }) =>
                    `${(Number(row.original.fillRate ?? 0) * 100).toFixed(0)}%`,
            },
            {
                header: 'Service',
                cell: ({ row }) => Number(row.original.serviceScore).toFixed(1),
            },
            {
                header: 'Compliance',
                cell: ({ row }) => Number(row.original.complianceScore).toFixed(1),
            },
        ],
        [],
    )

    const alertCols: ColumnDef<SupplierPerfAlert>[] = useMemo(
        () => [
            {
                header: 'Supplier',
                cell: ({ row }) => row.original.supplier?.supplierCode ?? '—',
            },
            {
                header: 'Type',
                cell: ({ row }) => row.original.alertType ?? 'POOR_SCORE',
            },
            {
                header: 'Score',
                cell: ({ row }) => Number(row.original.score).toFixed(1),
            },
            {
                header: 'Threshold',
                cell: ({ row }) => Number(row.original.threshold).toFixed(1),
            },
            {
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                header: 'Message',
                cell: ({ row }) => row.original.message ?? '—',
            },
            {
                header: 'Actions',
                cell: ({ row }) =>
                    row.original.status === 'OPEN' ? (
                        <div className="flex gap-2">
                            <Button
                                size="xs"
                                onClick={async () => {
                                    await supplierPerformanceService.acknowledgeAlert(
                                        row.original.id,
                                    )
                                    load()
                                }}
                            >
                                Ack
                            </Button>
                            <Button
                                size="xs"
                                onClick={async () => {
                                    await supplierPerformanceService.dismissAlert(
                                        row.original.id,
                                    )
                                    load()
                                }}
                            >
                                Dismiss
                            </Button>
                        </div>
                    ) : null,
            },
        ],
        [load],
    )

    const weightSum =
        Number(weights.deliveryWeight) +
        Number(weights.qualityWeight) +
        Number(weights.priceWeight) +
        Number(weights.quantityWeight ?? 0) +
        Number(weights.serviceWeight) +
        Number(weights.complianceWeight)

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Supplier Evaluation"
                description="Run period scorecards from MM transactions, configure weights and alert thresholds. Calculated scores cannot be overwritten — use Manual Assessment for controlled qualitative reviews. Alerts never auto-block suppliers."
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlay />}
                        onClick={() => setRunOpen(true)}
                    >
                        Run Evaluation
                    </Button>
                }
            />

            <AdaptiveCard className="mb-4">
                <FormItem label="Company">
                    <Select
                        options={companies}
                        value={companies.find((o) => o.value === companyId)}
                        onChange={(o: any) => setCompanyId(o?.value || '')}
                    />
                </FormItem>
            </AdaptiveCard>

            <AdaptiveCard>
                <Tabs value={tab} onChange={(v) => setTab(v)}>
                    <Tabs.TabList>
                        <Tabs.TabNav value="run">Results</Tabs.TabNav>
                        <Tabs.TabNav value="weights">Score Weights</Tabs.TabNav>
                        <Tabs.TabNav value="alerts">Alerts</Tabs.TabNav>
                    </Tabs.TabList>
                    <Tabs.TabContent value="run">
                        <DataTable
                            columns={evalCols}
                            data={evaluations}
                            loading={loading}
                        />
                    </Tabs.TabContent>
                    <Tabs.TabContent value="weights">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl mb-4">
                            {(
                                [
                                    ['deliveryWeight', 'Delivery %'],
                                    ['qualityWeight', 'Quality %'],
                                    ['priceWeight', 'Cost %'],
                                    ['quantityWeight', 'Quantity %'],
                                    ['serviceWeight', 'Service %'],
                                    ['complianceWeight', 'Compliance %'],
                                ] as const
                            ).map(([key, label]) => (
                                <FormItem key={key} label={label}>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={weights[key]}
                                        onChange={(e) =>
                                            setWeights((w) => ({
                                                ...w,
                                                [key]: Number(e.target.value),
                                            }))
                                        }
                                    />
                                </FormItem>
                            ))}
                        </div>
                        <p className="text-sm mb-3">
                            Sum: {weightSum} {weightSum === 100 ? '(OK)' : '(must be 100)'}
                        </p>
                        <Button
                            variant="solid"
                            icon={<HiOutlineSave />}
                            loading={submitting}
                            disabled={weightSum !== 100}
                            onClick={saveWeights}
                        >
                            Save Weights
                        </Button>
                        <div className="mt-8 border-t pt-6 max-w-2xl space-y-3">
                            <h5 className="font-semibold">Alert thresholds (advisory only)</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormItem label="Score below">
                                    <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={Number(alertCfg.scoreThreshold)}
                                        onChange={(e) =>
                                            setAlertCfg((a) => ({
                                                ...a,
                                                scoreThreshold: Number(e.target.value),
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Late delivery rate above">
                                    <Input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={Number(
                                            alertCfg.lateDeliveryRateThreshold ?? 0.25,
                                        )}
                                        onChange={(e) =>
                                            setAlertCfg((a) => ({
                                                ...a,
                                                lateDeliveryRateThreshold: Number(
                                                    e.target.value,
                                                ),
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Rejection rate above">
                                    <Input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={Number(
                                            alertCfg.rejectionRateThreshold ?? 0.1,
                                        )}
                                        onChange={(e) =>
                                            setAlertCfg((a) => ({
                                                ...a,
                                                rejectionRateThreshold: Number(
                                                    e.target.value,
                                                ),
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Shortage rate above">
                                    <Input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={Number(
                                            alertCfg.shortageRateThreshold ?? 0.15,
                                        )}
                                        onChange={(e) =>
                                            setAlertCfg((a) => ({
                                                ...a,
                                                shortageRateThreshold: Number(
                                                    e.target.value,
                                                ),
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Price variance above">
                                    <Input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={Number(
                                            alertCfg.priceVarianceThreshold ?? 0.1,
                                        )}
                                        onChange={(e) =>
                                            setAlertCfg((a) => ({
                                                ...a,
                                                priceVarianceThreshold: Number(
                                                    e.target.value,
                                                ),
                                            }))
                                        }
                                    />
                                </FormItem>
                            </div>
                            <Checkbox
                                checked={alertCfg.isActive}
                                onChange={(v) =>
                                    setAlertCfg((a) => ({ ...a, isActive: !!v }))
                                }
                            >
                                Alerts active (never auto-blocks)
                            </Checkbox>
                            <Button
                                variant="solid"
                                loading={submitting}
                                onClick={saveAlertCfg}
                            >
                                Save Alert Config
                            </Button>
                        </div>
                    </Tabs.TabContent>
                    <Tabs.TabContent value="alerts">
                        <DataTable
                            columns={alertCols}
                            data={alerts}
                            loading={loading}
                        />
                    </Tabs.TabContent>
                </Tabs>
            </AdaptiveCard>

            <FormDialog
                isOpen={runOpen}
                onClose={() => setRunOpen(false)}
                title="Run Supplier Evaluation"
                footer={
                    <>
                        <Button size="sm" onClick={() => setRunOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={runEval}
                        >
                            Run
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Period start">
                        <Input
                            type="date"
                            value={period.periodStart}
                            onChange={(e) =>
                                setPeriod((p) => ({
                                    ...p,
                                    periodStart: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Period end">
                        <Input
                            type="date"
                            value={period.periodEnd}
                            onChange={(e) =>
                                setPeriod((p) => ({
                                    ...p,
                                    periodEnd: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default SupplierEvaluationPage
