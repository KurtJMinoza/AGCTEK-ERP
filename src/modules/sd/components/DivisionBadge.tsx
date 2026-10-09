import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import { productDivisionLabel } from '../catalogs/productDivisions'

/**
 * Fulfillment division of an SD order line. Admins read this to know which
 * warehouse/brand arm has to pick the line: AWIC (retail), MCONPINCO
 * (appliances) or LPG.
 */
const DIVISION_TONE: Record<string, StatusTone> = {
    DIV_RETAIL: 'info',
    DIV_APPLIANCES: 'warning',
    DIV_LPG: 'success',
}

type DivisionBadgeProps = {
    /** `DIV_RETAIL` · `DIV_APPLIANCES` · `DIV_LPG`, or null on a headerless split. */
    divisionId: string | null | undefined
    /** Shown when no division is attached. */
    emptyLabel?: string
    className?: string
}

const DivisionBadge = ({
    divisionId,
    emptyLabel = '—',
    className,
}: DivisionBadgeProps) => {
    if (!divisionId) {
        return (
            <StatusBadge tone="default" className={className}>
                {emptyLabel}
            </StatusBadge>
        )
    }

    return (
        <StatusBadge
            tone={DIVISION_TONE[divisionId] ?? 'default'}
            className={className}
        >
            {productDivisionLabel(divisionId)}
        </StatusBadge>
    )
}

export default DivisionBadge
