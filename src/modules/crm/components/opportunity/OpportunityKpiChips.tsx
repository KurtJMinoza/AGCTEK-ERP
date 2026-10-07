'use client'

import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import NextActivityBadge from '../NextActivityBadge'
import { SalesOrderOriginBadges, SD_SALES_ORDERS_PATH } from '../OpportunitySalesOrderDialog'
import { crmTone, formatDate, formatEnumLabel, formatMoney } from '../../utils/format'
import type { LinkedSalesOrder, Opportunity } from '../../types'

type OpportunityKpiChipsProps = {
    opportunity: Opportunity
    salesOrder: LinkedSalesOrder | null
    salesOrderError: string | null
}

export default function OpportunityKpiChips({
    opportunity,
    salesOrder,
    salesOrderError,
}: OpportunityKpiChipsProps) {
    const linked = Boolean(opportunity.sdSalesOrderId)
    const isOpen = !opportunity.stage.startsWith('CLOSED_')

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
                label="Amount"
                value={formatMoney(opportunity.amount, opportunity.currency)}
            />
            <StatCard
                label="Probability"
                value={opportunity.probability == null ? '—' : `${opportunity.probability}%`}
            />
            <StatCard
                label="Next activity"
                value={
                    isOpen ? (
                        <span className="flex flex-col items-start gap-1">
                            <NextActivityBadge opportunity={opportunity} />
                            <span className="text-sm font-normal text-gray-500">
                                {opportunity.nextActivityDueAt
                                    ? `Due ${new Date(opportunity.nextActivityDueAt).toLocaleString()}`
                                    : 'Nothing scheduled'}
                            </span>
                        </span>
                    ) : (
                        <span className="text-sm font-normal text-gray-500">
                            Closed — no activity tracking
                        </span>
                    )
                }
            />
            <StatCard
                label="SD sales order"
                href={linked ? SD_SALES_ORDERS_PATH : undefined}
                value={
                    !linked ? (
                        '—'
                    ) : salesOrder ? (
                        <span className="flex flex-col items-start gap-1">
                            <span className="font-mono text-lg">{salesOrder.orderNumber}</span>
                            <span className="flex flex-wrap items-center gap-2 text-sm font-normal text-gray-500">
                                <StatusBadge tone={crmTone(salesOrder.status)}>
                                    {formatEnumLabel(salesOrder.status)}
                                </StatusBadge>
                                <SalesOrderOriginBadges order={salesOrder} />
                                {formatDate(salesOrder.createdAt)}
                            </span>
                        </span>
                    ) : (
                        <span className="text-sm font-normal text-gray-500">
                            {salesOrderError ?? 'Loading…'}
                        </span>
                    )
                }
            />
        </div>
    )
}
