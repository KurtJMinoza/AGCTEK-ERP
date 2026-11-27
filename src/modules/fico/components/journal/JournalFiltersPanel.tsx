'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import FormDialog from '@/components/shared/FormDialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineFilter } from 'react-icons/hi'
import type { FicoJournalListQuery } from '../../types'

type Props = {
    filters: FicoJournalListQuery
    onApply: (next: FicoJournalListQuery) => void
}

const statusOptions = [
    { value: '', label: 'Any status' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'POSTED', label: 'Posted' },
    { value: 'REVERSED', label: 'Reversed' },
]

const originOptions = [
    { value: '', label: 'Any origin' },
    { value: 'MANUAL', label: 'Manual' },
    { value: 'AUTOMATIC', label: 'Automatic' },
    { value: 'REVERSAL', label: 'Reversal' },
    { value: 'SYSTEM_ADJUSTMENT', label: 'System adjustment' },
]

const sourceModuleOptions = [
    { value: '', label: 'Any module' },
    { value: 'MANUAL', label: 'Manual' },
    { value: 'MM', label: 'MM' },
    { value: 'SD', label: 'SD' },
    { value: 'AP', label: 'AP' },
    { value: 'AR', label: 'AR' },
    { value: 'FICO', label: 'FICO' },
    { value: 'PP', label: 'PP' },
]

function stripAdvancedFilters(
    filters: FicoJournalListQuery,
): FicoJournalListQuery {
    return {
        page: 1,
        pageSize: filters.pageSize ?? 25,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        search: filters.search,
    }
}

export default function JournalFiltersPanel({ filters, onApply }: Props) {
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState(filters)

    const openPanel = () => {
        setDraft(filters)
        setOpen(true)
    }

    const apply = () => {
        const next: FicoJournalListQuery = {
            ...stripAdvancedFilters(filters),
            page: 1,
        }
        if (draft.status) next.status = draft.status
        if (draft.postingOrigin) next.postingOrigin = draft.postingOrigin
        if (draft.sourceModule) next.sourceModule = draft.sourceModule
        if (draft.sourceDocumentNumber) next.sourceDocumentNumber = draft.sourceDocumentNumber
        if (draft.dateFrom) next.dateFrom = draft.dateFrom
        if (draft.dateTo) next.dateTo = draft.dateTo
        onApply(next)
        setOpen(false)
    }

    const clear = () => {
        const cleared = stripAdvancedFilters(filters)
        setDraft(cleared)
        onApply(cleared)
        setOpen(false)
    }

    return (
        <>
            <Button
                size="sm"
                variant="twoTone"
                icon={<HiOutlineFilter />}
                onClick={openPanel}
            >
                Filters
            </Button>
            <FormDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                size="sm"
                icon={<HiOutlineFilter />}
                title="Journal filters"
                description="Narrow the list by posting status, source module, or date range."
                footer={
                    <div className="flex w-full justify-end gap-2">
                        <Button size="sm" variant="plain" onClick={clear}>
                            Clear
                        </Button>
                        <Button size="sm" variant="solid" onClick={apply}>
                            Apply
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Posting origin" className="sm:col-span-2">
                        <Select
                            size="sm"
                            options={originOptions}
                            value={
                                originOptions.find(
                                    (o) => o.value === (draft.postingOrigin ?? ''),
                                ) ?? null
                            }
                            onChange={(opt) =>
                                setDraft((p) => ({
                                    ...p,
                                    postingOrigin:
                                        (opt as { value: string })?.value || undefined,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Source module">
                        <Select
                            size="sm"
                            options={sourceModuleOptions}
                            value={
                                sourceModuleOptions.find(
                                    (o) => o.value === (draft.sourceModule ?? ''),
                                ) ?? null
                            }
                            onChange={(opt) =>
                                setDraft((p) => ({
                                    ...p,
                                    sourceModule:
                                        (opt as { value: string })?.value || undefined,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Source document #">
                        <Input
                            size="sm"
                            value={draft.sourceDocumentNumber ?? ''}
                            onChange={(e) =>
                                setDraft((p) => ({
                                    ...p,
                                    sourceDocumentNumber: e.target.value || undefined,
                                }))
                            }
                            placeholder="PO / GR / SO reference"
                        />
                    </FormItem>
                    <FormItem label="Posting status" className="sm:col-span-2">
                        <Select
                            size="sm"
                            options={statusOptions}
                            value={
                                statusOptions.find(
                                    (o) => o.value === (draft.status ?? ''),
                                ) ?? null
                            }
                            onChange={(opt) =>
                                setDraft((p) => ({
                                    ...p,
                                    status:
                                        (opt as { value: string })?.value ||
                                        undefined,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Posting from">
                        <Input
                            size="sm"
                            type="date"
                            value={draft.dateFrom ?? ''}
                            onChange={(e) =>
                                setDraft((p) => ({
                                    ...p,
                                    dateFrom: e.target.value || undefined,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Posting to">
                        <Input
                            size="sm"
                            type="date"
                            value={draft.dateTo ?? ''}
                            onChange={(e) =>
                                setDraft((p) => ({
                                    ...p,
                                    dateTo: e.target.value || undefined,
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>
        </>
    )
}
