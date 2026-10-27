'use client'

import Link from 'next/link'
import classNames from 'classnames'

export type Iso9001OutboundStep = 1 | 2 | 3 | 4

const STEPS: Array<{
    step: Iso9001OutboundStep
    title: string
    role: string
    href: string
    summary: string
}> = [
    {
        step: 1,
        title: 'Picking execution',
        role: 'Warehouse Picker',
        href: '/modules/mm/warehouse-management/picking',
        summary: 'Pick list from strategy, scan & confirm bin/material/batch',
    },
    {
        step: 2,
        title: 'Packing operations',
        role: 'Packer / Shipping Clerk',
        href: '/modules/mm/warehouse-management/packing',
        summary: 'Packing list, labels, weight & dimensions for logistics',
    },
    {
        step: 3,
        title: 'Goods issue verification',
        role: 'Warehouse Supervisor',
        href: '/modules/mm/inventory-management/goods-issue',
        summary: 'Verify vs SO/DO, supervisor sign-off before posting',
    },
    {
        step: 4,
        title: 'Inventory & ledger',
        role: 'Inventory Controller / System',
        href: '/modules/mm/inventory-management/inventory-ledger',
        summary: 'GI posts ISSUE to ledger and updates cost layers',
    },
]

type Props = {
    activeStep?: Iso9001OutboundStep
    className?: string
}

export default function Iso9001OutboundWorkflowStrip({
    activeStep,
    className,
}: Props) {
    return (
        <div
            className={classNames(
                'mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40',
                className,
            )}
        >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">
                        ISO 9001 work instruction
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Outbound flow — picking, packing, goods issue &amp; ledger
                    </p>
                </div>
                <Link
                    href="/modules/mm/warehouse-management/picking-rules"
                    className="text-xs font-medium text-primary hover:underline"
                >
                    Pick strategies
                </Link>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {STEPS.map((s) => {
                    const active = activeStep === s.step
                    return (
                        <li key={s.step}>
                            <Link
                                href={s.href}
                                className={classNames(
                                    'block h-full rounded-lg border px-3 py-2.5 transition-colors',
                                    active
                                        ? 'border-primary bg-primary-subtle/70 shadow-sm dark:bg-primary/10'
                                        : 'border-transparent bg-white hover:border-gray-200 dark:bg-gray-900/60 dark:hover:border-gray-600',
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className={classNames(
                                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                            active
                                                ? 'bg-primary text-white'
                                                : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
                                        )}
                                    >
                                        {s.step}
                                    </span>
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                        {s.title}
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">{s.role}</p>
                                <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                                    {s.summary}
                                </p>
                            </Link>
                        </li>
                    )
                })}
            </ol>
        </div>
    )
}
