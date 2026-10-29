'use client'

import { useCallback, useEffect, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { sopMetricEnterClass } from '../components/supportingOpsTableUi'
import { supportingOpsParentBreadcrumbs } from '../utils/supportingOpsPageUi'
import Input from '@/components/ui/Input'
import { supportingOpsService } from '../services/supportingOpsService'

const ROUTE = '/modules/mm/supporting-operations/compliance-dashboard'

type Summary = {
    companyId: string
    generatedAt: string
    pendingScanOverrides: number
    documentsAwaitingReview: number
    expiredControlledDocuments: number
    openScanSessions: number
    scanEventsLast24h: number
    rejectedScansLast24h: number
    scanCompliancePercentLast24h: number | null
    revokedWarehouseDevices: number
    activeRfidTags: number
    archivedBarcodes: number
}

const METRICS: {
    key: keyof Summary
    label: string
    format?: (s: Summary) => string | number
}[] = [
    { key: 'pendingScanOverrides', label: 'Pending scan overrides' },
    { key: 'documentsAwaitingReview', label: 'Documents awaiting review' },
    { key: 'expiredControlledDocuments', label: 'Expired controlled documents' },
    { key: 'openScanSessions', label: 'Open scan sessions' },
    {
        key: 'scanCompliancePercentLast24h',
        label: 'Scan compliance (24h)',
        format: (s) =>
            s.scanCompliancePercentLast24h != null
                ? `${s.scanCompliancePercentLast24h}%`
                : '—',
    },
    {
        key: 'rejectedScansLast24h',
        label: 'Failed scans (24h)',
        format: (s) => `${s.rejectedScansLast24h} / ${s.scanEventsLast24h}`,
    },
    { key: 'revokedWarehouseDevices', label: 'Revoked devices' },
    { key: 'activeRfidTags', label: 'Active RFID tags' },
    { key: 'archivedBarcodes', label: 'Archived barcodes' },
]

const Metric = ({
    label,
    value,
    index,
}: {
    label: string
    value: string | number
    index: number
}) => (
    <div
        className={`rounded-lg border border-gray-200 p-4 transition-shadow duration-200 hover:shadow-sm dark:border-gray-700 ${sopMetricEnterClass(index)}`}
    >
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums heading-text">{value}</div>
    </div>
)

const ComplianceDashboardPage = () => {
    const parentBreadcrumbs = supportingOpsParentBreadcrumbs(ROUTE)
    const [companyId, setCompanyId] = useState('')
    const [summary, setSummary] = useState<Summary | null>(null)
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        if (!companyId.trim()) return
        setLoading(true)
        try {
            const res = await supportingOpsService.complianceSummary(companyId.trim())
            setSummary(res)
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    return (
        <PageContainer>
            <PageHeader
                title="Compliance Dashboard"
                description="Operational compliance indicators from scan events, overrides, devices, and controlled documents — not certification status."
                breadcrumbs={parentBreadcrumbs}
            />
            <AdaptiveCard>
                <Input
                    className="mb-6 max-w-md"
                    placeholder="Company ID"
                    value={companyId}
                    onChange={(e: any) => setCompanyId(e.target.value)}
                />
                {loading && <p className="text-sm text-gray-500">Loading…</p>}
                {summary && (
                    <>
                        <p className="mb-4 text-xs text-gray-500">
                            Generated {new Date(summary.generatedAt).toLocaleString()} · Company{' '}
                            {summary.companyId}
                        </p>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {METRICS.map((m, index) => (
                                <Metric
                                    key={m.key}
                                    index={index}
                                    label={m.label}
                                    value={
                                        m.format
                                            ? m.format(summary)
                                            : (summary[m.key] as string | number)
                                    }
                                />
                            ))}
                        </div>
                    </>
                )}
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ComplianceDashboardPage
