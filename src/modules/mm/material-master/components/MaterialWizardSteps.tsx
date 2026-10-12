'use client'

import { Fragment, type ReactNode } from 'react'
import classNames from 'classnames'
import { HiCheck, HiOutlineExclamationCircle } from 'react-icons/hi'

export type WizardStep = {
    value: string
    label: string
    icon: ReactNode
}

type Props = {
    steps: WizardStep[]
    currentIndex: number
    /** Field-error counts per step value (drives the error badge). */
    errorCounts?: Record<string, number>
    onSelect: (index: number) => void
}

const badgeBase =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-base transition-colors'

const badgeStatus = (state: 'active' | 'complete' | 'pending' | 'error') =>
    classNames(
        badgeBase,
        state === 'active' &&
            'border-primary bg-primary text-white shadow-sm shadow-primary/30 dark:bg-primary',
        state === 'complete' &&
            'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-400',
        state === 'pending' &&
            'border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-400',
        state === 'error' &&
            'border-red-500/40 bg-red-500/10 text-red-600 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-400',
    )

const labelStatus = (state: 'active' | 'complete' | 'pending' | 'error') =>
    classNames(
        'truncate text-xs transition-colors',
        state === 'active' && 'font-semibold text-gray-900 dark:text-gray-100',
        state === 'complete' && 'font-medium text-gray-600 dark:text-gray-300',
        state === 'pending' && 'font-medium text-gray-400 dark:text-gray-500',
        state === 'error' && 'font-medium text-red-600 dark:text-red-400',
    )

/**
 * Responsive Material Master wizard header: desktop shows a single row of
 * numbered icon badges with connectors and truncating labels (never scrolls);
 * small screens collapse into a wrapping grid of chips with an explicit
 * "Step X of N" caption. Completed steps render a check badge; steps with
 * field errors are highlighted red.
 */
const MaterialWizardSteps = ({
    steps,
    currentIndex,
    errorCounts = {},
    onSelect,
}: Props) => {
    const stateOf = (index: number): 'active' | 'complete' | 'pending' | 'error' => {
        if (errorCounts[steps[index]?.value ?? ''] > 0) return 'error'
        if (index === currentIndex) return 'active'
        if (index < currentIndex) return 'complete'
        return 'pending'
    }

    return (
        <div className="w-full">
            {/* Mobile caption — keeps orientation clear without a horizontal track */}
            <div className="mb-2 flex items-baseline justify-between gap-2 text-xs sm:hidden">
                <span className="shrink-0 font-semibold text-gray-700 dark:text-gray-200">
                    Step {currentIndex + 1}{' '}
                    <span className="font-normal text-gray-400 dark:text-gray-500">
                        of {steps.length}
                    </span>
                </span>
                <span className="truncate text-right font-medium text-primary-deep dark:text-primary-light">
                    {steps[currentIndex]?.label}
                </span>
            </div>

            {/* Mobile — wrapping grid of chips, no scroll */}
            <div className="grid grid-cols-2 gap-2 sm:hidden">
                {steps.map((step, index) => {
                    const state = stateOf(index)
                    return (
                        <button
                            key={step.value}
                            type="button"
                            onClick={() => onSelect(index)}
                            aria-label={`${state === 'complete' ? 'Completed: ' : ''}${step.label}`}
                            className={classNames(
                                'flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                                state === 'active' &&
                                    'border-primary/50 bg-primary-subtle/70 dark:border-primary/40 dark:bg-primary/10',
                                state === 'complete' &&
                                    'border-emerald-300/50 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/5',
                                state === 'pending' &&
                                    'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40',
                                state === 'error' &&
                                    'border-red-300/60 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/5',
                            )}
                        >
                            <span
                                className={classNames(
                                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
                                    state === 'active' &&
                                        'border-primary bg-primary text-white dark:bg-primary',
                                    state === 'complete' &&
                                        'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-400',
                                    state === 'pending' &&
                                        'border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-700/60',
                                    state === 'error' &&
                                        'border-red-500/40 bg-red-500/10 text-red-600 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-400',
                                )}
                            >
                                {state === 'complete' ? (
                                    <HiCheck />
                                ) : state === 'error' ? (
                                    <HiOutlineExclamationCircle />
                                ) : (
                                    step.icon
                                )}
                            </span>
                            <span
                                className={classNames(
                                    'min-w-0 truncate text-xs font-medium',
                                    state === 'active'
                                        ? 'text-gray-900 dark:text-gray-100'
                                        : state === 'error'
                                          ? 'text-red-600 dark:text-red-400'
                                          : state === 'complete'
                                            ? 'text-gray-600 dark:text-gray-300'
                                            : 'text-gray-500 dark:text-gray-400',
                                )}
                            >
                                {step.label}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* Desktop — one flexible row, connectors aligned to badge centres */}
            <div className="hidden w-full items-start sm:flex">
                {steps.map((step, index) => {
                    const state = stateOf(index)
                    return (
                        <Fragment key={step.value}>
                            <button
                                type="button"
                                onClick={() => onSelect(index)}
                                aria-label={`${state === 'complete' ? 'Completed: ' : ''}${step.label}`}
                                aria-current={state === 'active' ? 'step' : undefined}
                                title={
                                    state === 'error'
                                        ? `${errorCounts[step.value] ?? 0} field(s) need attention`
                                        : step.label
                                }
                                className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-md py-0.5 focus:outline-none"
                            >
                                <span className={badgeStatus(state)}>
                                    {state === 'complete' ? (
                                        <HiCheck className="text-sm" />
                                    ) : (
                                        step.icon
                                    )}
                                </span>
                                <span className={labelStatus(state)}>{step.label}</span>
                            </button>
                            {index < steps.length - 1 ? (
                                <div
                                    aria-hidden
                                    className={classNames(
                                        'mt-[15px] h-0.5 flex-1 rounded-full',
                                        index < currentIndex
                                            ? 'bg-emerald-400/60 dark:bg-emerald-500/50'
                                            : 'bg-gray-200 dark:bg-gray-700',
                                    )}
                                />
                            ) : null}
                        </Fragment>
                    )
                })}
            </div>
        </div>
    )
}

export default MaterialWizardSteps