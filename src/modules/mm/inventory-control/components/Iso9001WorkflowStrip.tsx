'use client'

import Link from 'next/link'
import classNames from 'classnames'

export type Iso9001InventoryStep = 1 | 2 | 3 | 4

const STEPS: Array<{
    step: Iso9001InventoryStep
    title: string
    role: string
    href: string
    summary: string
}> = [
    {
        step: 1,
        title: 'Cycle counting',
        role: 'Inventory Auditor / Clerk',
        href: '/modules/mm/inventory-control/cycle-counting',
        summary: 'Documented plan, execution, and system comparison',
    },
    {
        step: 2,
        title: 'Physical inventory',
        role: 'Warehouse Manager / Auditor',
        href: '/modules/mm/inventory-control/physical-inventory',
        summary: 'Full warehouse count with mandatory recount on discrepancy',
    },
    {
        step: 3,
        title: 'Variance analysis',
        role: 'Inventory Controller',
        href: '/modules/mm/inventory-control/variance-analysis',
        summary: 'Root cause investigation and formal variance report',
    },
    {
        step: 4,
        title: 'Adjustment approval',
        role: 'Finance Controller / Warehouse Manager',
        href: '/modules/mm/inventory-control/adjustment-approval',
        summary: 'Management approval before ledger posting',
    },
]

type Props = {
    activeStep?: Iso9001InventoryStep
    className?: string
}

export default function Iso9001WorkflowStrip({ activeStep, className }: Props) {
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
                        Inventory control — cycle counting &amp; variance analysis
                    </p>
                </div>
                <Link
                    href="/modules/mm/inventory-control/count-planning"
                    className="text-xs font-medium text-primary hover:underline"
                >
                    Count planning &amp; policies
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
                                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
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
                                <p className="mt-1 pl-9 text-[11px] font-medium text-gray-500">
                                    {s.role}
                                </p>
                                <p className="mt-0.5 pl-9 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
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
