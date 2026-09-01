import classNames from '@/utils/classNames'
import type { ReactNode } from 'react'

/**
 * Lightweight content wrapper for module pages.
 * App shell containment already comes from `components/template/PageContainer`
 * via route `meta.pageContainerType` — do not nest another Container here.
 */
type PageContainerProps = {
    children: ReactNode
    className?: string
}

const PageContainer = ({ children, className }: PageContainerProps) => {
    return <div className={classNames('h-full', className)}>{children}</div>
}

export default PageContainer
