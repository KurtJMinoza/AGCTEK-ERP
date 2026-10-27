'use client'

import Link from 'next/link'
import classNames from 'classnames'

const STEPS = [
    {
        step: 1,
        title: 'Goods receipt',
        role: 'Receiving Clerk',
        href: '/modules/mm/inventory-management/goods-receipt',
        summary: 'Submit, verify, post — no stock until posted',
    },
    {
        step: 2,
        title: 'Inspection',
        role: 'QA Inspector',
        href: '/modules/mm/receiving/receiving-inspection',
        summary: 'Lots, sampling, mandatory characteristics',
    },
    {
        step: 3,
        title: 'Usage decision',
        role: 'QA Inspector',
        href: '/modules/mm/receiving/usage-decisions',
        summary: 'Pass, partial pass, fail — QI to unrestricted/blocked',
    },
    {
        step: 4,
        title: 'Supplier return',
        role: 'Returns Specialist',
        href: '/modules/mm/returns-disposal/supplier-returns',
        summary: 'Blocked stock return, approve, post GI, finance event',
    },
] as const

type Props = { activeStep?: 1 | 2 | 3 | 4; className?: string }

export default function Iso9001ReceivingWorkflowStrip({ activeStep, className }: Props) {
    return (
        <div
            className={classNames(
                'mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40',
                className,
            )}
        >
            <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    ISO 9001-aligned receiving &amp; quality
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Controls and records — not a certification claim
                </p>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {STEPS.map((s) => (
                    <li key={s.step}>
                        <Link
                            href={s.href}
                            className={classNames(
                                'block h-full rounded-lg border px-3 py-2.5 transition-colors',
                                activeStep === s.step
                                    ? 'border-primary bg-primary-subtle/70 dark:bg-primary/10'
                                    : 'border-transparent bg-white hover:border-gray-200 dark:bg-gray-900/60',
                            )}
                        >
                            <p className="text-sm font-semibold">
                                {s.step}. {s.title}
                            </p>
                            <p className="text-xs text-gray-500">{s.role}</p>
                            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                                {s.summary}
                            </p>
                        </Link>
                    </li>
                ))}
            </ol>
        </div>
    )
}
