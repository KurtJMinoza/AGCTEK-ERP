'use client'

import { useRouter } from 'next/navigation'
import ActionLink from '@/components/shared/ActionLink'
import Button from '@/components/ui/Button'
import { HiArrowLeft } from 'react-icons/hi'
import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'
import classNames from '@/utils/classNames'

type ErpBackLinkProps = {
    items: BreadcrumbItem[]
    className?: string
}

/**
 * Navigates to the previous breadcrumb parent when available,
 * otherwise falls back to browser history back.
 */
export default function ErpBackLink({ items, className }: ErpBackLinkProps) {
    const router = useRouter()

    const parent = [...items]
        .reverse()
        .find((item, index) => index > 0 && Boolean(item.href))

    if (parent?.href) {
        return (
            <ActionLink
                href={parent.href}
                className={classNames(
                    'mb-3 inline-flex items-center gap-1.5 text-sm font-medium',
                    className,
                )}
            >
                <HiArrowLeft className="text-base" aria-hidden />
                Back to {parent.label}
            </ActionLink>
        )
    }

    if (items.length <= 1) {
        return null
    }

    return (
        <Button
            size="sm"
            variant="plain"
            className={classNames('mb-3 px-0', className)}
            icon={<HiArrowLeft />}
            onClick={() => router.back()}
        >
            Back
        </Button>
    )
}
