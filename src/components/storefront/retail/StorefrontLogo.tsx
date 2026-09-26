'use client'

import Image from 'next/image'
import classNames from '@/utils/classNames'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'

type StorefrontLogoProps = {
    className?: string
    size?: 'sm' | 'md' | 'lg' | 'hero'
    priority?: boolean
    /** Show AWIC / Amalgated World wordmark beside the mark */
    withWordmark?: boolean
    /** Wordmark color for light or dark backgrounds */
    tone?: 'onLight' | 'onDark'
}

const SIZE_MAP = {
    sm: { width: 36, height: 36, className: 'h-9 w-9' },
    md: { width: 52, height: 52, className: 'h-13 w-13 h-[52px] w-[52px]' },
    lg: { width: 80, height: 80, className: 'h-20 w-20' },
    hero: {
        width: 200,
        height: 200,
        className: 'h-36 w-36 sm:h-44 sm:w-44 lg:h-48 lg:w-48',
    },
} as const

export default function StorefrontLogo({
    className,
    size = 'md',
    priority = false,
    withWordmark = false,
    tone = 'onLight',
}: StorefrontLogoProps) {
    const dims = SIZE_MAP[size]
    const onDark = tone === 'onDark'

    const mark = (
        <Image
            src="/storefront/aw-logo-new.png"
            alt={AWIC_BRAND.shortName}
            width={dims.width}
            height={dims.height}
            priority={priority}
            className={classNames(dims.className, 'object-contain', className)}
        />
    )

    if (!withWordmark) return mark

    return (
        <span className="inline-flex items-center gap-3">
            {mark}
            <span className="text-left leading-tight">
                <span
                    className={classNames(
                        'block font-storefront-heading font-semibold uppercase tracking-[0.12em]',
                        onDark ? 'text-brand-gold' : 'text-brand-ink',
                        size === 'sm' && 'text-xs',
                        size === 'md' && 'text-sm',
                        (size === 'lg' || size === 'hero') && 'text-base',
                    )}
                >
                    {AWIC_BRAND.initials}
                </span>
                <span
                    className={classNames(
                        'block font-storefront-body',
                        onDark
                            ? 'text-brand-gold-soft/70'
                            : 'text-brand-ink/65',
                        size === 'sm' && 'text-[10px]',
                        size === 'md' && 'text-xs',
                        (size === 'lg' || size === 'hero') && 'text-sm',
                    )}
                >
                    {AWIC_BRAND.shortName}
                </span>
            </span>
        </span>
    )
}
