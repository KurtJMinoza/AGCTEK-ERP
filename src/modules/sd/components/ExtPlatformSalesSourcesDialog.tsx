'use client'

import { useCallback, useEffect, useState } from 'react'
import { HiOutlineCog } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { SourceBadge } from './extPlatformUi'
import { fetchSalesSources, updateSalesSource } from '../services/extPlatformService'
import type { SalesSource, SdSaleTaxPolicy } from '../types/extPlatform'

const TAX_POLICY_OPTIONS: Array<{ value: SdSaleTaxPolicy; label: string }> = [
    {
        value: 'FOLLOW_MATERIAL',
        label: 'Follow material master tax (marketplace VAT)',
    },
    {
        value: 'NON_VAT_OUTPUT',
        label: 'Non-VAT output (ignore material tax on this channel)',
    },
]

type Props = {
    isOpen: boolean
    onClose: () => void
    onSaved?: (sources: SalesSource[]) => void
}

export default function ExtPlatformSalesSourcesDialog({
    isOpen,
    onClose,
    onSaved,
}: Props) {
    const [sources, setSources] = useState<SalesSource[]>([])
    const [loading, setLoading] = useState(false)
    const [savingId, setSavingId] = useState<string | null>(null)
    const [draft, setDraft] = useState<Record<string, SdSaleTaxPolicy>>({})

    const load = useCallback(() => {
        setLoading(true)
        fetchSalesSources()
            .then((rows) => {
                setSources(rows)
                setDraft(
                    Object.fromEntries(
                        rows.map((s) => [s.id, s.saleTaxPolicy ?? 'FOLLOW_MATERIAL']),
                    ),
                )
            })
            .catch(() => {
                toast.push(
                    <Notification type="danger" title="Error">
                        Unable to load sales channels.
                    </Notification>,
                )
            })
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        if (isOpen) load()
    }, [isOpen, load])

    const handleSave = async (source: SalesSource) => {
        const next = draft[source.id]
        if (!next || next === source.saleTaxPolicy) return
        setSavingId(source.id)
        try {
            const updated = await updateSalesSource(source.id, { saleTaxPolicy: next })
            setSources((prev) => {
                const next = prev.map((s) => (s.id === updated.id ? updated : s))
                onSaved?.(next)
                return next
            })
            toast.push(
                <Notification type="success" title="Saved">
                    {source.name} tax policy updated.
                </Notification>,
            )
        } catch (err) {
            toast.push(
                <Notification type="danger" title="Error">
                    {err instanceof Error ? err.message : 'Unable to save channel tax policy.'}
                </Notification>,
            )
        } finally {
            setSavingId(null)
        }
    }

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            width={640}
            icon={<HiOutlineCog />}
            title="Marketplace channel tax"
            description="Each sales channel decides whether outbound tax follows the MM material (typical for Shopee, Lazada, TikTok) or is treated as non-VAT output. POS non-VAT is set under company accounting."
            footer={null}
        >
            {loading ? (
                <p className="text-sm text-gray-500">Loading channels…</p>
            ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {sources.map((source) => {
                        const value = draft[source.id] ?? 'FOLLOW_MATERIAL'
                        const dirty = value !== (source.saleTaxPolicy ?? 'FOLLOW_MATERIAL')
                        return (
                            <li
                                key={source.id}
                                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="min-w-0">
                                    <SourceBadge source={source} />
                                    {source.description ? (
                                        <p className="mt-1 text-xs text-gray-500">{source.description}</p>
                                    ) : null}
                                </div>
                                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[280px]">
                                    <Select
                                        size="sm"
                                        options={TAX_POLICY_OPTIONS}
                                        value={TAX_POLICY_OPTIONS.find((o) => o.value === value)}
                                        onChange={(opt) =>
                                            opt?.value &&
                                            setDraft((prev) => ({
                                                ...prev,
                                                [source.id]: opt.value as SdSaleTaxPolicy,
                                            }))
                                        }
                                    />
                                    {dirty ? (
                                        <Button
                                            size="xs"
                                            variant="solid"
                                            loading={savingId === source.id}
                                            onClick={() => void handleSave(source)}
                                        >
                                            Save
                                        </Button>
                                    ) : null}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}
        </FormDialog>
    )
}