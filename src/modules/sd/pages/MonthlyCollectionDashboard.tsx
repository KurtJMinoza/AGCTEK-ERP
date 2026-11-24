'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    HiOutlineCalendar,
    HiOutlineDownload,
    HiOutlineRefresh,
    HiOutlineTable,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Chart from '@/components/shared/Chart'
import MonthlyCollectionDetailTable from '../components/MonthlyCollectionDetailTable'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import Tabs from '@/components/ui/Tabs'
import Tag from '@/components/ui/Tag'
import Skeleton from '@/components/ui/Skeleton'
import { COLORS } from '@/constants/chart.constant'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    BUCKET_META,
    ReportMetaBanner,
    YearSummarySection,
    YearSummaryTable,
    formatYearMoney,
    monthTabLabel,
    sumYearBuckets,
    yearCollectionCount,
} from '../components/MonthlyCollectionWidgets'
import {
    EmptyState,
    KpiCard,
    SectionTitle,
    sharePercent,
} from '../components/SalesAnalysisWidgets'
import {
    fetchMonthlyCollection,
    type CollectionBucketTotals,
    type MonthlyCollectionReport,
} from '../services/monthlyCollectionService'
import { downloadMonthlyCollectionExcel } from '../utils/monthlyCollectionExport'

const ROUTE_PATH = '/modules/sd/monthly-collection'
const { TabList, TabNav } = Tabs

const YEAR_OPTIONS = [2026, 2025, 2024].map((y) => ({
    value: String(y),
    label: String(y),
}))

type YearOption = (typeof YEAR_OPTIONS)[number]

const compactPhp = (amount: number) =>
    `₱${new Intl.NumberFormat('en-PH', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(amount)}`

const MonthlyCollectionDashboard = () => {
    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])
    const [year, setYear] = useState(2026)
    const [activeTab, setActiveTab] = useState('TOTAL')
    const [report, setReport] = useState<MonthlyCollectionReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await fetchMonthlyCollection(year)
            setReport(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Load failed')
            setReport(null)
        } finally {
            setLoading(false)
        }
    }, [year])

    useEffect(() => {
        load()
    }, [load])

    const yearBuckets = useMemo(() => sumYearBuckets(report), [report])
    const collectionCount = useMemo(() => yearCollectionCount(report), [report])

    const activeMonth = useMemo(() => {
        if (activeTab === 'TOTAL' || !report) return null
        return (report.months ?? []).find((m) => m.monthLabel === activeTab) ?? null
    }, [activeTab, report])

    const tabItems = useMemo(() => {
        if (!report) return [{ value: 'TOTAL', label: 'TOTAL' }]
        const months = report.months ?? []
        return [
            { value: 'TOTAL', label: 'TOTAL' },
            ...months.map((m) => ({
                value: m.monthLabel,
                label: m.monthLabel,
            })),
        ]
    }, [report])

    useEffect(() => {
        if (activeTab !== 'TOTAL' && report) {
            const exists = (report.months ?? []).some(
                (m) => m.monthLabel === activeTab,
            )
            if (!exists) setActiveTab('TOTAL')
        }
    }, [activeTab, report])

    const changeYear = (next: number) => {
        setLoading(true)
        setYear(next)
        setActiveTab('TOTAL')
    }

    const monthlyChart = useMemo(() => {
        if (!report) return null
        const rows = report.yearSummary ?? []
        const hasData = rows.some((r) => r.summary.total > 0)
        if (!hasData) return null
        return {
            categories: rows.map((r) => r.monthLabel.slice(0, 3)),
            totals: rows.map((r) => r.summary.total),
        }
    }, [report])

    const tenderMixChart = useMemo(() => {
        const b = yearBuckets
        const entries = BUCKET_META.filter((m) => m.key !== 'total').map(
            (meta) => ({
                label: meta.shortLabel,
                value: b[meta.key as keyof CollectionBucketTotals] as number,
            }),
        )
        const active = entries.filter((e) => e.value > 0)
        if (!active.length || b.total <= 0) return null
        return active
    }, [yearBuckets])

    const monthKpis = useMemo(() => {
        if (!activeMonth) return []
        const s = activeMonth.summary
        const total = s.total
        return BUCKET_META.map((meta) => {
            const amount = s[meta.key]
            return {
                label: meta.label,
                value: formatYearMoney(amount),
                current: amount,
                previous: 0,
                icon: meta.icon,
                subtext:
                    meta.key === 'total'
                        ? `${activeMonth.rows?.length ?? 0} line${
                              (activeMonth.rows?.length ?? 0) === 1 ? '' : 's'
                          }`
                        : total > 0
                          ? `${sharePercent(amount, total)}% of month`
                          : 'No collections',
            }
        })
    }, [activeMonth])

    const yearKpis = useMemo(() => {
        const total = yearBuckets.total
        return BUCKET_META.map((meta) => {
            const amount = yearBuckets[meta.key]
            return {
                label: meta.label,
                value: formatYearMoney(amount),
                current: amount,
                previous: 0,
                icon: meta.icon,
                subtext:
                    meta.key === 'total'
                        ? `${collectionCount.toLocaleString('en-PH')} collection${
                              collectionCount === 1 ? '' : 's'
                          } in ${year}`
                        : total > 0
                          ? `${sharePercent(amount, total)}% of year`
                          : 'No collections',
            }
        })
    }, [yearBuckets, collectionCount, year])

    const showYearView = activeTab === 'TOTAL'
    const kpis = showYearView ? yearKpis : monthKpis

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Monthly Collection"
                icon={<HiOutlineTable />}
                description="Collections by tender type (cash, GCash, bank, cheque, and others) — live replacement for the Monthly Collection workbook."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={load}
                        >
                            Refresh
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            icon={<HiOutlineDownload />}
                            disabled={!report || loading}
                            onClick={() =>
                                report && downloadMonthlyCollectionExcel(report)
                            }
                        >
                            Export Excel
                        </Button>
                    </div>
                }
            />

            <AdaptiveCard className="mb-4" bodyClass="p-3 sm:p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                        <div className="w-full sm:w-36">
                            <label className="mb-1 block text-xs font-medium text-gray-500">
                                Calendar year
                            </label>
                            <Select<YearOption>
                                size="sm"
                                isSearchable={false}
                                value={YEAR_OPTIONS.find(
                                    (o) => o.value === String(year),
                                )}
                                options={YEAR_OPTIONS}
                                onChange={(opt) => {
                                    if (opt) changeYear(Number(opt.value))
                                }}
                            />
                        </div>
                        {report ? (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <HiOutlineCalendar className="text-base text-gray-400" />
                                <span className="font-semibold text-gray-700 dark:text-gray-200">
                                    1 Jan – 31 Dec {report.year}
                                </span>
                            </div>
                        ) : null}
                    </div>
                    <ReportMetaBanner
                        report={report}
                        loading={loading}
                        collectionCount={collectionCount}
                    />
                </div>
            </AdaptiveCard>

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {kpis.map((kpi) => (
                    <KpiCard
                        key={`${activeTab}-${kpi.label}`}
                        loading={loading}
                        {...kpi}
                    />
                ))}
            </div>

            <Tabs value={activeTab} onChange={setActiveTab}>
                <TabList className="mb-4 flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {tabItems.map((tab) => (
                        <TabNav
                            key={tab.value}
                            value={tab.value}
                            className="shrink-0 whitespace-nowrap px-3 text-xs sm:text-sm"
                        >
                            <span className="hidden sm:inline">
                                {monthTabLabel(tab.label, false)}
                            </span>
                            <span className="sm:hidden">
                                {monthTabLabel(tab.label, true)}
                            </span>
                        </TabNav>
                    ))}
                </TabList>

                {showYearView ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                            <AdaptiveCard className="xl:col-span-2">
                                <SectionTitle
                                    title="Collections by month"
                                    description="Paid order collections grouped by calendar month"
                                />
                                {loading ? (
                                    <Skeleton height={300} />
                                ) : monthlyChart ? (
                                    <Chart
                                        type="bar"
                                        height={300}
                                        xAxis={monthlyChart.categories}
                                        series={[
                                            {
                                                name: 'Collected',
                                                data: monthlyChart.totals,
                                            },
                                        ]}
                                        customOptions={{
                                            chart: {
                                                toolbar: { show: false },
                                            },
                                            plotOptions: {
                                                bar: {
                                                    columnWidth: '55%',
                                                    borderRadius: 4,
                                                },
                                            },
                                            colors: [COLORS[0]],
                                            dataLabels: { enabled: false },
                                            yaxis: {
                                                labels: {
                                                    formatter: (v: number) =>
                                                        compactPhp(v),
                                                },
                                            },
                                            tooltip: {
                                                y: {
                                                    formatter: (v: number) =>
                                                        formatYearMoney(v),
                                                },
                                            },
                                        }}
                                    />
                                ) : (
                                    <EmptyState
                                        message="No collections for this year yet"
                                        height={260}
                                    />
                                )}
                            </AdaptiveCard>

                            <AdaptiveCard>
                                <SectionTitle
                                    title="Tender mix"
                                    description="Share of year-to-date collections by payment type"
                                />
                                {loading ? (
                                    <Skeleton height={300} />
                                ) : tenderMixChart ? (
                                    <Chart
                                        type="donut"
                                        height={300}
                                        series={tenderMixChart.map(
                                            (e) => e.value,
                                        )}
                                        customOptions={{
                                            labels: tenderMixChart.map(
                                                (e) => e.label,
                                            ),
                                            colors: COLORS,
                                            legend: {
                                                position: 'bottom',
                                            },
                                            dataLabels: {
                                                enabled: true,
                                                formatter: (
                                                    val: number,
                                                ) => `${Math.round(val)}%`,
                                            },
                                            tooltip: {
                                                y: {
                                                    formatter: (
                                                        v: number,
                                                    ) => formatYearMoney(v),
                                                },
                                            },
                                        }}
                                    />
                                ) : (
                                    <EmptyState
                                        message="No tender breakdown yet"
                                        height={260}
                                    />
                                )}
                            </AdaptiveCard>
                        </div>

                        <YearSummarySection
                            title="Year overview"
                            description="Tap a month with collections to drill into line detail"
                        >
                            {report ? (
                                <YearSummaryTable
                                    report={report}
                                    loading={loading}
                                    selectedMonthLabel={
                                        activeTab !== 'TOTAL'
                                            ? activeTab
                                            : null
                                    }
                                    onSelectMonth={(label) =>
                                        setActiveTab(label)
                                    }
                                />
                            ) : loading ? (
                                <Skeleton height={240} />
                            ) : null}
                        </YearSummarySection>
                    </div>
                ) : null}

                {activeMonth ? (
                    <AdaptiveCard>
                        <SectionTitle
                            title={`${activeTab} ${year}`}
                            description="Collection lines posted with customer, AR reference, and tender split"
                            extra={
                                <Tag className="border-0 bg-gray-100 font-medium dark:bg-gray-700">
                                    {(activeMonth.rows?.length ?? 0).toLocaleString(
                                        'en-PH',
                                    )}{' '}
                                    line
                                    {(activeMonth.rows?.length ?? 0) === 1
                                        ? ''
                                        : 's'}
                                </Tag>
                            }
                        />
                        {(activeMonth.rows?.length ?? 0) > 0 ? (
                            <MonthlyCollectionDetailTable
                                month={activeMonth}
                                monthLabel={activeTab}
                                year={year}
                                loading={loading}
                            />
                        ) : loading ? (
                            <Skeleton height={200} />
                        ) : (
                            <EmptyState
                                message="No collection lines this month"
                                height={200}
                            />
                        )}
                    </AdaptiveCard>
                ) : null}

                {!report && !loading && !error ? (
                    <EmptyState message="Select a year to load collections" />
                ) : null}
            </Tabs>
        </PageContainer>
    )
}

export default MonthlyCollectionDashboard