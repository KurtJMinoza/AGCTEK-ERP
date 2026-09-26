'use client'

import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import InfoCard from '@/modules/mm/shared/InfoCard'
import type { MrpRecommendationExplanation } from '../types'

type MrpExplanationPanelProps = {
    explanation: MrpRecommendationExplanation | null | undefined
    fallbackText?: string | null
}

const MrpExplanationPanel = ({
    explanation,
    fallbackText,
}: MrpExplanationPanelProps) => {
    if (!explanation) {
        return (
            <div className="text-sm text-gray-500">
                {fallbackText?.trim() || 'No structured explanation available for this run.'}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold">
                    {explanation.materialCode}
                    {explanation.materialName
                        ? ` — ${explanation.materialName}`
                        : ''}
                </span>
                {explanation.warehouseCode ? (
                    <StatusBadge status={explanation.warehouseCode} />
                ) : null}
                {explanation.planningDate ? (
                    <span className="text-sm text-gray-500">
                        Planning date: {explanation.planningDate}
                    </span>
                ) : null}
            </div>

            {explanation.demandLines.length > 0 ? (
                <AdaptiveCard>
                    <p className="mb-2 text-sm font-medium">Demand lines</p>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-600">
                                    <th className="py-2 pr-4">Source</th>
                                    <th className="py-2 pr-4">Label</th>
                                    <th className="py-2 pr-4">Date</th>
                                    <th className="py-2">Quantity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {explanation.demandLines.map((line, index) => (
                                    <tr
                                        key={`${line.label}-${index}`}
                                        className="border-b border-gray-100 dark:border-gray-700"
                                    >
                                        <td className="py-2 pr-4">
                                            <StatusBadge status={line.sourceType} />
                                        </td>
                                        <td className="py-2 pr-4">{line.label}</td>
                                        <td className="py-2 pr-4">
                                            {line.demandDate ?? '—'}
                                        </td>
                                        <td className="py-2">{line.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </AdaptiveCard>
            ) : null}

            <AdaptiveCard>
                <p className="mb-2 text-sm font-medium">Supply / demand math</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    <InfoCard label="Opening stock" value={explanation.openingStock} />
                    <InfoCard label="Reserved" value={explanation.reserved} />
                    <InfoCard
                        label="Projected supply"
                        value={explanation.projectedSupply}
                    />
                    <InfoCard label="Safety stock" value={explanation.safetyStock} />
                    <InfoCard
                        label="Projected available"
                        value={explanation.projectedAvailable}
                    />
                    <InfoCard label="Gross demand" value={explanation.grossDemand} />
                    <InfoCard
                        label="Net requirement"
                        value={explanation.netRequirement}
                    />
                    <InfoCard label="MOQ" value={explanation.moq} />
                    <InfoCard label="Lot size" value={explanation.lotSize} />
                    <InfoCard
                        label="Recommended"
                        value={explanation.recommendedQuantity}
                    />
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <p className="mb-2 text-sm font-medium">Reason</p>
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={explanation.reasonCode} />
                    <span className="text-sm">{explanation.reasonSummary}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                    Planning rule: {explanation.planningRule}
                </p>
            </AdaptiveCard>

            {explanation.sourceDemandReferences.length > 0 ? (
                <AdaptiveCard>
                    <p className="mb-2 text-sm font-medium">Source demand references</p>
                    <div className="flex flex-wrap gap-2">
                        {explanation.sourceDemandReferences.map((ref) => (
                            <StatusBadge key={ref} status={ref} />
                        ))}
                    </div>
                </AdaptiveCard>
            ) : null}

            {(explanation.independentDemandQty ||
                explanation.bomDependentDemandQty) && (
                <AdaptiveCard>
                    <p className="mb-2 text-sm font-medium">Demand breakdown</p>
                    <div className="grid grid-cols-2 gap-3">
                        <InfoCard
                            label="Independent demand"
                            value={explanation.independentDemandQty}
                        />
                        <InfoCard
                            label="BOM dependent demand"
                            value={explanation.bomDependentDemandQty}
                        />
                    </div>
                </AdaptiveCard>
            )}

            {explanation.timePhased?.violationDate ? (
                <AdaptiveCard>
                    <p className="mb-2 text-sm font-medium">Time-phased violation</p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        <InfoCard
                            label="Violation date"
                            value={explanation.timePhased.violationDate}
                        />
                        <InfoCard
                            label="Projected closing"
                            value={explanation.timePhased.projectedClosing}
                        />
                        <InfoCard
                            label="Safety deficit"
                            value={explanation.timePhased.safetyStockViolation}
                        />
                    </div>
                </AdaptiveCard>
            ) : null}

            {(explanation.leadTimeDays != null ||
                explanation.expectedProcurementDate ||
                explanation.preferredSupplierCode) && (
                <AdaptiveCard>
                    <p className="mb-2 text-sm font-medium">Procurement context</p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        <InfoCard
                            label="Lead time (days)"
                            value={
                                explanation.leadTimeDays != null
                                    ? String(explanation.leadTimeDays)
                                    : undefined
                            }
                        />
                        <InfoCard
                            label="Expected procurement"
                            value={explanation.expectedProcurementDate}
                        />
                        <InfoCard
                            label="Preferred supplier"
                            value={explanation.preferredSupplierCode}
                        />
                    </div>
                </AdaptiveCard>
            )}
        </div>
    )
}

export default MrpExplanationPanel
