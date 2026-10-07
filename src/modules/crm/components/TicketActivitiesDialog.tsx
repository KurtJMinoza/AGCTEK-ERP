'use client'

import StatusBadge from '@/components/shared/StatusBadge'
import ActivitiesDialog from './ActivitiesDialog'
import { ActivityStatusBadge } from './NextActivityBadge'
import { crmTone, formatEnumLabel } from '../utils/format'
import { TICKET_ACTIVITY_STATUSES, type Ticket } from '../types'

type TicketActivitiesDialogProps = {
    ticket: Ticket | null
    canCreate: boolean
    canUpdate: boolean
    onClose: () => void
    onChanged?: () => void
}

export default function TicketActivitiesDialog({ ticket, ...rest }: TicketActivitiesDialogProps) {
    return (
        <ActivitiesDialog
            {...rest}
            parent={ticket ? { kind: 'ticket', id: ticket.id } : null}
            title={ticket?.subject ?? 'Ticket'}
            description={
                ticket
                    ? `${ticket.customer.companyName}${ticket.rmaReference ? ` · RMA ${ticket.rmaReference}` : ''}`
                    : undefined
            }
            headerExtra={
                ticket ? (
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={crmTone(ticket.status)}>
                            {formatEnumLabel(ticket.status)}
                        </StatusBadge>
                        <StatusBadge tone={crmTone(ticket.priority)}>
                            {formatEnumLabel(ticket.priority)}
                        </StatusBadge>
                        <ActivityStatusBadge
                            status={ticket.nextActivityStatus}
                            dueAt={ticket.nextActivityDueAt}
                        />
                    </div>
                ) : null
            }
            acceptsActivities={ticket ? TICKET_ACTIVITY_STATUSES.includes(ticket.status) : false}
            closedHint="Closed and cancelled tickets are read-only."
            summaryPlaceholder="e.g. Call customer to confirm replacement delivery"
        />
    )
}
