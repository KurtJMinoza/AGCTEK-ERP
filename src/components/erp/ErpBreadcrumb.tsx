'use client'

import { usePathname } from 'next/navigation'
import Breadcrumb from '@/components/shared/Breadcrumb'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

type ErpBreadcrumbProps = {
    className?: string
}

const ErpBreadcrumb = ({ className }: ErpBreadcrumbProps) => {
    const pathname = usePathname()
    const items = buildErpBreadcrumbs(pathname)

    return <Breadcrumb items={items} className={className} />
}

export default ErpBreadcrumb
