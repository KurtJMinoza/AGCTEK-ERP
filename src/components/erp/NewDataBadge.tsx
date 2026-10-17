import Badge from '@/components/ui/Badge'
import classNames from '@/utils/classNames'

type NewDataBadgeProps = {
    count: number
    /** Dot only (collapsed sidebar), no number. */
    dot?: boolean
    className?: string
}

/** Count of records added since the user last opened a module or page; hidden at zero. */
export default function NewDataBadge({ count, dot, className }: NewDataBadgeProps) {
    if (count <= 0) return null
    const label = `${count} new`
    return (
        <span
            role="status"
            aria-label={label}
            title={label}
            className={classNames('inline-flex shrink-0', className)}
        >
            {dot ? (
                <Badge />
            ) : (
                <Badge
                    content={count > 99 ? '99+' : count}
                    innerClass="!px-1.5 !py-0.5 leading-none"
                />
            )}
        </span>
    )
}
