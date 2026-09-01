import withHeaderItem from '@/utils/hoc/withHeaderItem'
import useTheme from '@/utils/hooks/useTheme'
import classNames from '@/utils/classNames'
import NavToggle from '@/components/shared/NavToggle'
import type { CommonProps } from '@/@types/common'

const _SideNavToggle = ({ className }: CommonProps) => {
    const { layout, setSideNavCollapse } = useTheme((state) => state)

    const sideNavCollapse = layout.sideNavCollapse

    const onCollapse = () => {
        setSideNavCollapse(!sideNavCollapse)
    }

    return (
        <div
            className={classNames('hidden lg:block', className)}
            role="button"
            onClick={onCollapse}
        >
            <NavToggle className="text-2xl" toggled={sideNavCollapse} />
        </div>
    )
}

const SideNavToggle = withHeaderItem(_SideNavToggle)

export default SideNavToggle
