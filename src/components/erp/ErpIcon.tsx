import erpIcon from '@/configs/erp-icon.config'

type ErpIconProps = {
    icon?: string
    className?: string
}

/** Same rendering pattern as VerticalMenuIcon + navigation-icon.config */
const ErpIcon = ({ icon, className = 'text-2xl' }: ErpIconProps) => {
    if (!icon || !erpIcon[icon]) {
        return erpIcon.fileText ? (
            <span className={className}>{erpIcon.fileText}</span>
        ) : null
    }

    return <span className={className}>{erpIcon[icon]}</span>
}

export default ErpIcon
