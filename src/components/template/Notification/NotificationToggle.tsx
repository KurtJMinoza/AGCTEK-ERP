import classNames from '@/utils/classNames'
import Badge from '@/components/ui/Badge'
import { PiBellDuotone } from 'react-icons/pi'

const NotificationToggle = ({
    className,
    count,
}: {
    className?: string
    count: number
}) => {
    return (
        <div className={classNames('text-2xl', className)}>
            {count > 0 ? (
                <Badge
                    content={count}
                    badgeStyle={{ top: '3px', right: '6px' }}
                >
                    <PiBellDuotone />
                </Badge>
            ) : (
                <PiBellDuotone />
            )}
        </div>
    )
}

export default NotificationToggle
