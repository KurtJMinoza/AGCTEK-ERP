'use client'

import Link from 'next/link'
import classNames from 'classnames'

export type Iso9001ReturnsStep = 1 | 2 | 3 | 4

const STEPS: Array<{
    step: Iso9001ReturnsStep
    title: string
    role: string
    href: string
    summary: string
}> = [
    {
        step: 1,
        title: 'Customer return intake',
        role: 'Returns Specialist',
        href: '/modules/mm/returns-disposal/customer-return-intake',
        summary: 'Physical receipt → return inspection stock (not sellable)',
    },
    {
        step: 2,
        title: 'Damaged & expired stock',
        role: 'Quality Assurance',
        href: '/modules/mm/returns-disposal/damaged-stock',
        summary: 'Block, quarantine, and formal disposition',
    },
    {
        step: 3,
        title: 'Scrap & disposal execution',
        role: 'Warehouse Manager',
        href: '/modules/mm/returns-disposal/scrap',
        summary: 'Approve → witness execution → inventory posting',
    },
    {
        step: 4,
        title: 'Supplier returns',
        role: 'Inventory Controller',
        href: '/modules/mm/returns-disposal/supplier-returns',
        summary: 'Pick from quarantine → return GI → supplier memo',
    },
]

type Props = {
    activeStep?: Iso9001ReturnsStep
    className?: string
}

export default function Iso9001ReturnsDisposalWorkflowStrip({
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
                        ISO 9001-aligned returns & disposal
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Controls and evidence — not automatic certification
                    </p>
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((s) => {
                    const active = activeStep === s.step
                    return (
                        <Link
                            key={s.step}
                            href={s.href}
                            className={classNames(
                                'block rounded-lg border p-3 transition-colors',
                                active
                                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                    : 'border-gray-200 bg-white hover:border-primary/40 dark:border-gray-700 dark:bg-gray-800/50',
                            )}
                        >
                            <span className="text-xs font-semibold text-gray-500">
                                Step {s.step} · {s.role}
                            </span>
                            <p className="mt-1 text-sm font-semibold heading-text">{s.title}</p>
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                                {s.summary}
                            </p>
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
