'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HiOutlineCog } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Segment from '@/components/ui/Segment'
import Select from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import DemandPlanChart from '../components/demand-plan/DemandPlanChart'
import DemandPlanGridTable from '../components/demand-plan/DemandPlanGridTable'
import DemandPlanKpiChips from '../components/demand-plan/DemandPlanKpiChips'
import DemandPlanSettingsDialog from '../components/demand-plan/DemandPlanSettingsDialog'
import NewDemandPlanDialog from '../components/demand-plan/NewDemandPlanDialog'
import PastSalesPanel, {
    type GenerateRequest,
} from '../components/demand-plan/PastSalesPanel'
import SopReviewPanel from '../components/demand-plan/SopReviewPanel'
import { useDemandPlanGrid } from '../hooks/useDemandPlanGrid'
import { useDemandPlans } from '../hooks/useDemandPlans'
import {
    apiAdjustDemandCells,
    apiGenerateDemandForecast,
    apiPublishDemandPlan,
    apiUpdateDemandPlan,
} from '../services/scmApi'
import { getApiErrorMessage } from '../utils/apiError'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import type {
    DemandChartDensity,
    DemandHorizonKind,
    DemandPlanStatus,
} from '../types'

type ForecastView = 'chart' | 'grid' | 'sales'

type Opt<T extends string = string> = { value: T; label: string }

const STATUS_TONE: Record<DemandPlanStatus, StatusTone> = {
    DRAFT: 'default',
    REVIEWED: 'info',
    APPROVED: 'warning',
    PUBLISHED: 'success',
}

const ALL_LOCATIONS = '__all'

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    })
}

function SettingItem({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
                {label}
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {value}
            </p>
        </div>
    )
}

/**
 * Demand Plan — single SCM card. Horizon is a scope control on the plan version;
 * every horizon switch reloads a server-aggregated grid.
 */
export default function DemandPlanningPage() {
    const {
        plans,
        presets,
        loading: plansLoading,
        error: plansError,
        reload: reloadPlans,
    } = useDemandPlans()

    const [versionId, setVersionId] = useState<string | null>(null)
    const [horizonKind, setHorizonKind] =
        useState<DemandHorizonKind>('OPERATIONAL')
    const [locationCode, setLocationCode] = useState(ALL_LOCATIONS)
    const [compareVersionId, setCompareVersionId] = useState('')
    const [tab, setTab] = useState('forecast')
    const [view, setView] = useState<ForecastView>('chart')
    const [chartDensity, setChartDensity] = useState<DemandChartDensity>('AUTO')
    const [edits, setEdits] = useState<Record<string, string>>({})
    const [actionError, setActionError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [newOpen, setNewOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [reasonOpen, setReasonOpen] = useState(false)
    const [reason, setReason] = useState('')
    const [publishOpen, setPublishOpen] = useState(false)

    useEffect(() => {
        if (versionId || plans.length === 0) return
        const initial =
            plans.find((p) => p.status === 'DRAFT') ??
            plans.find((p) => p.status === 'PUBLISHED') ??
            plans[0]
        setVersionId(initial.id)
        setHorizonKind(initial.horizonKind)
    }, [plans, versionId])

    const { detail, grid, loading, error, reload, applyPayload } = useDemandPlanGrid(
        versionId,
        {
            horizonKind,
            locationCode:
                locationCode === ALL_LOCATIONS ? undefined : locationCode,
            compareVersionId: compareVersionId || undefined,
            chartDensity,
        },
    )

    const pendingCount = Object.keys(edits).length
    const hasPending = pendingCount > 0

    const onEdit = useCallback(
        (lineId: string, value: string, currentQty: number) => {
            setEdits((prev) => {
                const next = { ...prev }
                if (value === String(Math.round(currentQty))) delete next[lineId]
                else next[lineId] = value
                return next
            })
        },
        [],
    )

    const discardEdits = () => setEdits({})

    const horizonOptions: Opt<DemandHorizonKind>[] = presets.map((p) => ({
        value: p.kind,
        label: p.label,
    }))
    const versionOptions: Opt[] = plans.map((p) => ({
        value: p.id,
        label: `${p.code} · ${p.status}`,
    }))
    const compareOptions = versionOptions.filter((o) => o.value !== versionId)
    const locationOptions: Opt[] = useMemo(
        () => [
            { value: ALL_LOCATIONS, label: 'All locations' },
            ...(grid?.locations ?? []).map((l) => ({
                value: l,
                label: grid?.locationNames?.[l] ?? l,
            })),
        ],
        [grid?.locations, grid?.locationNames],
    )

    const runAction = async (fn: () => Promise<unknown>) => {
        setBusy(true)
        setActionError(null)
        try {
            await fn()
            await Promise.all([reload(), reloadPlans()])
        } catch (err) {
            setActionError(getApiErrorMessage(err, 'Action failed'))
        } finally {
            setBusy(false)
        }
    }

    const saveDraft = async () => {
        if (!versionId || !reason.trim()) return
        const cells = Object.entries(edits).map(([lineId, raw]) => {
            const n = raw.trim() === '' ? null : Number(raw)
            return {
                lineId,
                adjustedQty: n === null || !Number.isFinite(n) ? null : n,
                reason: reason.trim(),
            }
        })
        const invalid = Object.values(edits).some(
            (v) => v.trim() !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0),
        )
        if (invalid) {
            setActionError('Adjusted quantities must be numbers ≥ 0.')
            return
        }
        setReasonOpen(false)
        await runAction(async () => {
            await apiAdjustDemandCells(versionId, cells)
            discardEdits()
            setReason('')
        })
    }

    const [generating, setGenerating] = useState(false)
    const generateDisabledReason =
        !detail
            ? 'Select a plan version.'
            : detail.status !== 'DRAFT'
              ? `Generate is only available on DRAFT plans (this plan is ${detail.status}).`
              : grid?.scope.bucket === 'QUARTER'
                ? 'Switch to the Operational or Tactical horizon to generate.'
                : hasPending
                  ? 'Save or discard grid edits before generating.'
                  : null

    const generateForecast = async (req: GenerateRequest) => {
        if (!versionId || generateDisabledReason) return
        setGenerating(true)
        setActionError(null)
        try {
            const res = await apiGenerateDemandForecast(versionId, {
                method: 'MOVING_AVERAGE',
                window: req.window,
                historyLength: req.historyLength,
                overwriteAdjustments: req.overwriteAdjustments,
                horizonKind,
                locationCode:
                    locationCode === ALL_LOCATIONS ? undefined : locationCode,
                compareVersionId: compareVersionId || undefined,
                chartDensity,
            })
            applyPayload(res.detail, res.grid)
            setView('grid')
            const g = res.generation
            const kept = g.preservedOverrides
                ? ` ${g.preservedOverrides} override${g.preservedOverrides === 1 ? '' : 's'} preserved.`
                : ''
            const cleared = g.clearedOverrides
                ? ` ${g.clearedOverrides} override${g.clearedOverrides === 1 ? '' : 's'} overwritten.`
                : ''
            const missing = g.productsWithoutHistory.length
                ? ` ${g.productsWithoutHistory.length} item(s) had no past sales and were left unchanged.`
                : ''
            toast.push(
                <Notification
                    type="success"
                    title="System forecast generated"
                    closable
                    duration={5000}
                >
                    System forecast generated for {g.periodsGenerated}{' '}
                    {g.bucket.toLowerCase()} period
                    {g.periodsGenerated === 1 ? '' : 's'} (moving average N=
                    {g.window}
                    {g.frozenPeriodsSkipped
                        ? `, ${g.frozenPeriodsSkipped} frozen skipped`
                        : ''}
                    ).{kept}
                    {cleared}
                    {missing} Switched to Forecast Grid.
                </Notification>,
                { placement: 'top-end' },
            )
        } catch (err) {
            setActionError(getApiErrorMessage(err, 'Forecast generation failed'))
        } finally {
            setGenerating(false)
        }
    }

    const status = detail?.status
    const selectLocked = hasPending || generating

    return (
        <PageContainer>
            <PageHeader
                title="Demand Plan"
                description="Product × location × period demand by version. Horizon sets the bucket, length, granularity and freeze fence of the view."
                breadcrumbs={scmPageBreadcrumbs('Demand Plan', 'planning')}
                actions={
                    <Button
                        size="sm"
                        variant="solid"
                        onClick={() => setNewOpen(true)}
                    >
                        New version
                    </Button>
                }
            />

            {plansError || error || actionError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {actionError || error || plansError}
                </Alert>
            ) : null}

            {!plansLoading && plans.length === 0 && !plansError ? (
                <AdaptiveCard>
                    <div className="py-10 text-center">
                        <h5 className="mb-1">No demand plan versions yet</h5>
                        <p className="mb-4 text-sm text-gray-500">
                            Create a version, or run{' '}
                            <code>npm run prisma:seed-demand-plan</code> in{' '}
                            <code>backend/</code> for demo data.
                        </p>
                        <Button variant="solid" onClick={() => setNewOpen(true)}>
                            New version
                        </Button>
                    </div>
                </AdaptiveCard>
            ) : (
                <>
                    <AdaptiveCard className="mb-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <FormItem label="Horizon" className="mb-0">
                                <Select
                                    options={horizonOptions}
                                    isDisabled={selectLocked}
                                    value={horizonOptions.find(
                                        (o) => o.value === horizonKind,
                                    )}
                                    onChange={(o) => o && setHorizonKind(o.value)}
                                />
                            </FormItem>
                            <FormItem label="Version" className="mb-0">
                                <Select
                                    options={versionOptions}
                                    isDisabled={selectLocked}
                                    isLoading={plansLoading}
                                    value={
                                        versionOptions.find(
                                            (o) => o.value === versionId,
                                        ) ?? null
                                    }
                                    onChange={(o) => {
                                        if (!o) return
                                        setVersionId(o.value)
                                        setCompareVersionId('')
                                    }}
                                />
                            </FormItem>
                            <FormItem label="Location" className="mb-0">
                                <Select
                                    options={locationOptions}
                                    isDisabled={selectLocked}
                                    value={locationOptions.find(
                                        (o) => o.value === locationCode,
                                    )}
                                    onChange={(o) =>
                                        setLocationCode(o?.value ?? ALL_LOCATIONS)
                                    }
                                />
                            </FormItem>
                            <FormItem label="Compare with" className="mb-0">
                                <Select
                                    isClearable
                                    placeholder="No comparison"
                                    options={compareOptions}
                                    isDisabled={selectLocked}
                                    value={
                                        compareOptions.find(
                                            (o) => o.value === compareVersionId,
                                        ) ?? null
                                    }
                                    onChange={(o) =>
                                        setCompareVersionId(o?.value ?? '')
                                    }
                                />
                            </FormItem>
                        </div>

                        {grid && detail ? (
                            <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-gray-100 pt-4 dark:border-gray-700">
                                <div>
                                    <p className="text-[11px] uppercase tracking-wide text-gray-400">
                                        Status
                                    </p>
                                    <StatusBadge tone={STATUS_TONE[detail.status]}>
                                        {detail.status}
                                    </StatusBadge>
                                </div>
                                <SettingItem
                                    label="Range"
                                    value={`${formatDate(grid.scope.rangeStart)} – ${formatDate(
                                        new Date(
                                            new Date(grid.scope.rangeEnd).getTime() -
                                                86400000,
                                        ).toISOString(),
                                    )}`}
                                />
                                <SettingItem
                                    label="Bucket"
                                    value={`${grid.scope.bucket.toLowerCase()} × ${grid.scope.viewLength}`}
                                />
                                <SettingItem
                                    label="Granularity"
                                    value={grid.scope.granularity}
                                />
                                <SettingItem
                                    label="Freeze until"
                                    value={formatDate(grid.scope.freezeUntil)}
                                />
                                <Button
                                    size="xs"
                                    icon={<HiOutlineCog />}
                                    onClick={() => setSettingsOpen(true)}
                                >
                                    Settings
                                </Button>
                            </div>
                        ) : null}
                    </AdaptiveCard>

                    {grid?.scope.readOnlyReason ? (
                        <Alert showIcon type="info" className="mb-4">
                            {grid.scope.readOnlyReason}
                        </Alert>
                    ) : null}
                    {hasPending ? (
                        <Alert showIcon type="warning" className="mb-4">
                            {pendingCount} unsaved override
                            {pendingCount === 1 ? '' : 's'}. Save or discard
                            before changing horizon, version or filters. Clear a
                            cell to revert it to the system forecast.
                        </Alert>
                    ) : null}

                    <AdaptiveCard>
                        <Tabs value={tab} onChange={(v) => setTab(String(v))}>
                            <Tabs.TabList>
                                <Tabs.TabNav value="forecast">Forecast</Tabs.TabNav>
                                <Tabs.TabNav value="sop">S&amp;OP Review</Tabs.TabNav>
                            </Tabs.TabList>
                        </Tabs>

                        <div className="pt-4">
                            {tab === 'forecast' ? (
                                <>
                                    {grid ? (
                                        <DemandPlanKpiChips
                                            chart={grid.chart}
                                            periodCount={grid.periods.length}
                                            bucketLabel={grid.scope.bucket.toLowerCase()}
                                        />
                                    ) : null}
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                        <Segment
                                            size="sm"
                                            value={view}
                                            onChange={(v) =>
                                                v && setView(v as ForecastView)
                                            }
                                        >
                                            <Segment.Item value="chart">Chart</Segment.Item>
                                            <Segment.Item value="grid">Grid</Segment.Item>
                                            <Segment.Item value="sales">
                                                Past Sales
                                            </Segment.Item>
                                        </Segment>
                                        {view === 'chart' &&
                                        grid?.scope.granularity === 'SKU' ? (
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span>Series</span>
                                                <Segment
                                                    size="xs"
                                                    value={chartDensity}
                                                    onChange={(v) =>
                                                        v &&
                                                        setChartDensity(
                                                            v as DemandChartDensity,
                                                        )
                                                    }
                                                >
                                                    <Segment.Item value="AUTO">
                                                        By SKU
                                                    </Segment.Item>
                                                    <Segment.Item value="FAMILY">
                                                        By family
                                                    </Segment.Item>
                                                </Segment>
                                            </div>
                                        ) : null}
                                    </div>
                                    {view === 'sales' ? (
                                        <PastSalesPanel
                                            plan={detail}
                                            bucket={grid?.scope.bucket ?? 'WEEK'}
                                            locationCode={
                                                locationCode === ALL_LOCATIONS
                                                    ? undefined
                                                    : locationCode
                                            }
                                            generating={generating}
                                            generateDisabledReason={generateDisabledReason}
                                            onGenerate={(req) => void generateForecast(req)}
                                        />
                                    ) : view === 'chart' ? (
                                        <DemandPlanChart grid={grid} loading={loading} />
                                    ) : (
                                        <DemandPlanGridTable
                                            grid={grid}
                                            loading={loading}
                                            edits={edits}
                                            onEdit={onEdit}
                                        />
                                    )}
                                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-xs text-gray-400">
                                            {view === 'grid'
                                                ? `• overridden · locked columns are inside the freeze fence${
                                                      compareVersionId
                                                          ? ' · green ▲ / red ▼ = delta vs comparison'
                                                          : ''
                                                  }`
                                                : view === 'sales'
                                                  ? 'Actuals from past sales, summed server-side into the horizon bucket.'
                                                  : hasPending
                                                    ? 'Chart shows saved values — unsaved grid edits appear after Save draft.'
                                                    : 'Switch to Grid to edit weekly SKU quantities.'}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {hasPending ? (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        onClick={discardEdits}
                                                    >
                                                        Discard
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="solid"
                                                        loading={busy}
                                                        onClick={() =>
                                                            setReasonOpen(true)
                                                        }
                                                    >
                                                        Save draft ({pendingCount})
                                                    </Button>
                                                </>
                                            ) : null}
                                            {status === 'DRAFT' && !hasPending ? (
                                                <Button
                                                    size="sm"
                                                    loading={busy}
                                                    onClick={() =>
                                                        void runAction(() =>
                                                            apiUpdateDemandPlan(
                                                                versionId!,
                                                                { status: 'REVIEWED' },
                                                            ),
                                                        )
                                                    }
                                                >
                                                    Submit for review
                                                </Button>
                                            ) : null}
                                            {(status === 'REVIEWED' ||
                                                status === 'APPROVED') ? (
                                                <Button
                                                    size="sm"
                                                    loading={busy}
                                                    onClick={() =>
                                                        void runAction(() =>
                                                            apiUpdateDemandPlan(
                                                                versionId!,
                                                                {
                                                                    status:
                                                                        status ===
                                                                        'REVIEWED'
                                                                            ? 'DRAFT'
                                                                            : 'REVIEWED',
                                                                },
                                                            ),
                                                        )
                                                    }
                                                >
                                                    Send back
                                                </Button>
                                            ) : null}
                                            {status === 'REVIEWED' ? (
                                                <Button
                                                    size="sm"
                                                    variant="solid"
                                                    loading={busy}
                                                    onClick={() =>
                                                        void runAction(() =>
                                                            apiUpdateDemandPlan(
                                                                versionId!,
                                                                { status: 'APPROVED' },
                                                            ),
                                                        )
                                                    }
                                                >
                                                    Approve
                                                </Button>
                                            ) : null}
                                            {status === 'APPROVED' ? (
                                                <Button
                                                    size="sm"
                                                    variant="solid"
                                                    loading={busy}
                                                    onClick={() =>
                                                        setPublishOpen(true)
                                                    }
                                                >
                                                    Publish
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <SopReviewPanel
                                    plan={detail}
                                    locationNames={grid?.locationNames}
                                    onSaved={() => void reload()}
                                />
                            )}
                        </div>
                    </AdaptiveCard>
                </>
            )}

            <NewDemandPlanDialog
                isOpen={newOpen}
                presets={presets}
                plans={plans}
                onClose={() => setNewOpen(false)}
                onCreated={(plan) => {
                    setNewOpen(false)
                    discardEdits()
                    setVersionId(plan.id)
                    setHorizonKind(plan.horizonKind)
                    setCompareVersionId('')
                    void reloadPlans()
                }}
            />

            <DemandPlanSettingsDialog
                isOpen={settingsOpen}
                plan={detail}
                onClose={() => setSettingsOpen(false)}
                onSaved={() => {
                    setSettingsOpen(false)
                    void reload()
                }}
            />

            <Dialog
                isOpen={reasonOpen}
                onClose={() => setReasonOpen(false)}
                onRequestClose={() => setReasonOpen(false)}
                width={480}
            >
                <h5 className="mb-1">Save overrides</h5>
                <p className="mb-4 text-sm text-gray-500">
                    {pendingCount} cell{pendingCount === 1 ? '' : 's'} will be
                    saved to the draft. A reason is required for the audit
                    trail.
                </p>
                <FormItem label="Reason">
                    <Input
                        textArea
                        value={reason}
                        placeholder="e.g. Confirmed project order, promo uplift…"
                        onChange={(e) => setReason(e.target.value)}
                    />
                </FormItem>
                <div className="flex justify-end gap-2">
                    <Button onClick={() => setReasonOpen(false)}>Cancel</Button>
                    <Button
                        variant="solid"
                        disabled={!reason.trim()}
                        onClick={() => void saveDraft()}
                    >
                        Save draft
                    </Button>
                </div>
            </Dialog>

            <ConfirmDialog
                isOpen={publishOpen}
                type="warning"
                title={`Publish ${detail?.code ?? ''}?`}
                confirmText="Publish"
                onClose={() => setPublishOpen(false)}
                onRequestClose={() => setPublishOpen(false)}
                onCancel={() => setPublishOpen(false)}
                onConfirm={() => {
                    setPublishOpen(false)
                    if (versionId) {
                        void runAction(() => apiPublishDemandPlan(versionId))
                    }
                }}
            >
                <p>
                    The published version becomes the official demand signal and
                    can no longer be edited.
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}
