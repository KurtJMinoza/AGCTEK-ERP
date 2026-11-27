'use client'

import { useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { notifyError } from '../FicoCompanySelect'
import { ficoAccountDeterminationRuleService } from '../../services/accountDeterminationService'
import type { DeterminationSimulationResult } from '../../accountDeterminationTypes'
import Tag from '@/components/ui/Tag'

type Props = {
    companyId: string
    modules: Array<{ code: string; label: string }>
}

const MODES = [
    { value: 'SINGLE_KEY', label: 'Single transaction key' },
    { value: 'MULTI_KEY', label: 'Multiple keys' },
    { value: 'SOURCE_DOCUMENT', label: 'Source document (accounting event)' },
]

export default function DeterminationSimulationWorkbench({ companyId, modules }: Props) {
    const [mode, setMode] = useState('SINGLE_KEY')
    const [sourceModule, setSourceModule] = useState('MM')
    const [transactionKey, setTransactionKey] = useState('')
    const [multiKeys, setMultiKeys] = useState('')
    const [postingDate, setPostingDate] = useState(
        () => new Date().toISOString().slice(0, 10),
    )
    const [valuationClassId, setValuationClassId] = useState('')
    const [sourceDocumentType, setSourceDocumentType] = useState('GOODS_ISSUE')
    const [sourceDocumentId, setSourceDocumentId] = useState('')
    const [result, setResult] = useState<DeterminationSimulationResult | null>(null)
    const [running, setRunning] = useState(false)

    const run = async () => {
        if (!companyId) return
        setRunning(true)
        try {
            const payload: Record<string, unknown> = {
                mode,
                companyId,
                sourceModule,
                postingDate,
                dimensions: {
                    valuationClassId: valuationClassId || undefined,
                },
            }
            if (mode === 'MULTI_KEY') {
                payload.transactionKeys = multiKeys
                    .split(/[,\\s]+/)
                    .map((key) => key.trim())
                    .filter(Boolean)
            } else if (mode === 'SOURCE_DOCUMENT') {
                payload.sourceDocumentType = sourceDocumentType
                payload.sourceDocumentId = sourceDocumentId
            } else {
                payload.transactionKey = transactionKey
            }
            const data = await ficoAccountDeterminationRuleService.simulate(payload)
            setResult(data)
        } catch (error) {
            setResult(null)
            notifyError(error, 'Simulation failed.')
        } finally {
            setRunning(false)
        }
    }

    return (
        <AdaptiveCard className="mt-4">
            <p className="mb-3 text-xs text-amber-800 dark:text-amber-200">
                Simulation is read-only — no journals, balances, document numbers, or accounting
                events are changed.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                <FormItem label="Simulation mode" className="mb-0">
                    <Select
                        options={MODES}
                        value={MODES.find((row) => row.value === mode) ?? MODES[0]}
                        onChange={(opt) =>
                            setMode((opt as { value: string } | null)?.value ?? 'SINGLE_KEY')
                        }
                    />
                </FormItem>
                <FormItem label="Source module" className="mb-0">
                    <Select
                        options={modules.map((entry) => ({
                            value: entry.code,
                            label: entry.code,
                        }))}
                        value={
                            modules
                                .map((entry) => ({ value: entry.code, label: entry.code }))
                                .find((option) => option.value === sourceModule) ?? null
                        }
                        onChange={(opt) =>
                            setSourceModule(
                                (opt as { value: string } | null)?.value ?? 'MM',
                            )
                        }
                    />
                </FormItem>
                <FormItem label="Posting date" className="mb-0">
                    <Input
                        type="date"
                        value={postingDate}
                        onChange={(event) => setPostingDate(event.target.value)}
                    />
                </FormItem>
                {mode === 'SINGLE_KEY' ? (
                    <FormItem label="Transaction key" className="mb-0">
                        <Input
                            value={transactionKey}
                            onChange={(event) =>
                                setTransactionKey(event.target.value.toUpperCase())
                            }
                        />
                    </FormItem>
                ) : null}
                {mode === 'MULTI_KEY' ? (
                    <FormItem label="Transaction keys (comma-separated)" className="mb-0 md:col-span-2">
                        <Input
                            value={multiKeys}
                            onChange={(event) => setMultiKeys(event.target.value)}
                            placeholder="GI_COGS, PAYMENT_CLEARING"
                        />
                    </FormItem>
                ) : null}
                {mode === 'SOURCE_DOCUMENT' ? (
                    <>
                        <FormItem label="Document type" className="mb-0">
                            <Input
                                value={sourceDocumentType}
                                onChange={(event) =>
                                    setSourceDocumentType(event.target.value.toUpperCase())
                                }
                            />
                        </FormItem>
                        <FormItem label="Document id" className="mb-0">
                            <Input
                                value={sourceDocumentId}
                                onChange={(event) => setSourceDocumentId(event.target.value)}
                            />
                        </FormItem>
                    </>
                ) : null}
                <FormItem label="Valuation class id (optional)" className="mb-0">
                    <Input
                        value={valuationClassId}
                        onChange={(event) => setValuationClassId(event.target.value)}
                    />
                </FormItem>
            </div>
            <div className="mt-3">
                <Button variant="solid" size="sm" loading={running} onClick={() => void run()}>
                    Run simulation
                </Button>
            </div>

            {result ? (
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-700">
                    <div className="flex flex-wrap gap-2 text-xs">
                        <Tag className="bg-gray-100 dark:bg-gray-800">Dry run only</Tag>
                        {result.chartOfAccountsCode ? (
                            <Tag>COA {result.chartOfAccountsCode}</Tag>
                        ) : null}
                        {result.selectedRule ? (
                            <Tag className="bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30">
                                Selected {result.selectedRule.determinationCode}
                            </Tag>
                        ) : (
                            <Tag className="bg-red-50 text-red-800">No rule selected</Tag>
                        )}
                    </div>
                    {result.configurationErrors.length ? (
                        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
                            {result.configurationErrors.map((line) => (
                                <p key={line}>{line}</p>
                            ))}
                        </div>
                    ) : null}
                    {result.batchItems?.length ? (
                        <ul className="space-y-1 text-xs">
                            {result.batchItems.map((item) => (
                                <li key={item.transactionKey}>
                                    {item.transactionKey}:{' '}
                                    {item.ok ? 'Resolved' : item.message ?? 'Failed'}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    <div className="overflow-auto rounded-lg border border-gray-100 dark:border-gray-700">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="px-2 py-1.5">Rule</th>
                                    <th className="px-2 py-1.5">Eligible</th>
                                    <th className="px-2 py-1.5">Priority</th>
                                    <th className="px-2 py-1.5">Specificity</th>
                                    <th className="px-2 py-1.5">Unmatched</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.candidates.map((row) => (
                                    <tr
                                        key={row.ruleId}
                                        className="border-t border-gray-100 dark:border-gray-800"
                                    >
                                        <td className="px-2 py-1.5 font-mono">
                                            {row.determinationCode}
                                        </td>
                                        <td className="px-2 py-1.5">
                                            {row.eligible ? 'Yes' : 'No'}
                                        </td>
                                        <td className="px-2 py-1.5">{row.priority}</td>
                                        <td className="px-2 py-1.5">{row.specificity}</td>
                                        <td className="px-2 py-1.5 text-gray-500">
                                            {row.unmatchedConditions
                                                .map(
                                                    (u) =>
                                                        `${u.dimension}: ${u.ruleValue ?? '∅'} ≠ ${u.inputValue ?? '∅'}`,
                                                )
                                                .join('; ') || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {result.validationWarnings.length ? (
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                            Resolved lines: {result.validationWarnings.join(' · ')}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </AdaptiveCard>
    )
}