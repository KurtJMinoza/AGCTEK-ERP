'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import OpportunityStageControl from './OpportunityStageControl'
import { crmOpportunityBreadcrumbs } from '../../utils/breadcrumbs'
import { crmTone, formatDate, formatEnumLabel, formatUserName } from '../../utils/format'
import type { Opportunity, UpdateOpportunityInput } from '../../types'

type OpportunityHeaderProps = {
    opportunity: Opportunity
    canUpdate: boolean
    actions?: ReactNode
    onUpdate: (body: UpdateOpportunityInput) => Promise<unknown>
    onWin: () => void
}

const Meta = ({ label, children }: { label: string; children: ReactNode }) => (
    <span className="whitespace-nowrap">
        <span className="text-gray-400">{label} </span>
        {children}
    </span>
)

export default function OpportunityHeader({
    opportunity,
    canUpdate,
    actions,
    onUpdate,
    onWin,
}: OpportunityHeaderProps) {
    return (
        <>
            <PageHeader
                breadcrumbs={crmOpportunityBreadcrumbs(opportunity.name)}
                title={
                    <span className="flex flex-wrap items-center gap-2">
                        {opportunity.name}
                        <StatusBadge tone={crmTone(opportunity.stage)}>
                            {formatEnumLabel(opportunity.stage)}
                        </StatusBadge>
                    </span>
                }
                description={
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <Meta label="Customer">
                            <Link
                                href={`/crm/customers/${opportunity.customerId}`}
                                className="font-medium text-primary hover:underline"
                            >
                                {opportunity.customer.companyName}
                            </Link>
                        </Meta>
                        <Meta label="Owner">{formatUserName(opportunity.owner, 'Unassigned')}</Meta>
                        <Meta label="Expected close">{formatDate(opportunity.expectedCloseDate)}</Meta>
                    </span>
                }
                actions={actions}
            />
            <AdaptiveCard className="mb-4">
                <OpportunityStageControl
                    opportunity={opportunity}
                    canUpdate={canUpdate}
                    onUpdate={onUpdate}
                    onWin={onWin}
                />
            </AdaptiveCard>
        </>
    )
}
