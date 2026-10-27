'use client'

import { useCallback, useEffect, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Input from '@/components/ui/Input'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
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

const Metric = ({ label, value }: { label: string; value: string | number }) => (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
)

const ComplianceDashboardPage = () => {
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
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Compliance Dashboard"
                description="Operational compliance indicators from scan events, overrides, devices, and controlled documents — not certification status."
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
                        <p className="text-xs text-gray-500 mb-4">
                            Generated {new Date(summary.generatedAt).toLocaleString()} · Company{' '}
                            {summary.companyId}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <Metric label="Pending scan overrides" value={summary.pendingScanOverrides} />
                            <Metric
                                label="Documents awaiting review"
                                value={summary.documentsAwaitingReview}
                            />
                            <Metric
                                label="Expired controlled documents"
                                value={summary.expiredControlledDocuments}
                            />
                            <Metric label="Open scan sessions" value={summary.openScanSessions} />
                            <Metric
                                label="Scan compliance (24h)"
                                value={
                                    summary.scanCompliancePercentLast24h != null
                                        ? `${summary.scanCompliancePercentLast24h}%`
                                        : '—'
                                }
                            />
                            <Metric
                                label="Failed scans (24h)"
                                value={`${summary.rejectedScansLast24h} / ${summary.scanEventsLast24h}`}
                            />
                            <Metric label="Revoked devices" value={summary.revokedWarehouseDevices} />
                            <Metric label="Active RFID tags" value={summary.activeRfidTags} />
                            <Metric label="Archived barcodes" value={summary.archivedBarcodes} />
                        </div>
                    </>
                )}
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ComplianceDashboardPage
