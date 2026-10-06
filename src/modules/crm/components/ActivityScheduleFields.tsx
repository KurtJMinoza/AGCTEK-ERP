'use client'

import type { Dispatch, SetStateAction } from 'react'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import type { StatusTone } from '@/components/shared/StatusBadge'
import CrmSelect from './CrmSelect'
import { enumOptions } from '../utils/format'
import {
    ACTIVITY_TYPES,
    type Activity,
    type ActivityType,
    type CreateActivityInput,
} from '../types'

export const activityDueTone: Record<Activity['dueStatus'], StatusTone> = {
    OVERDUE: 'danger',
    DUE_TODAY: 'warning',
    UPCOMING: 'info',
    DONE: 'success',
}

export type ScheduleForm = { type: ActivityType; summary: string; dueAt: string }

const pad = (n: number) => String(n).padStart(2, '0')

/** `datetime-local` value for tomorrow 09:00 in the browser's time zone. */
function defaultDueInput() {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`
}

export const emptyScheduleForm = (): ScheduleForm => ({
    type: 'CALL',
    summary: '',
    dueAt: defaultDueInput(),
})

/** null when required fields are missing. The assignee defaults to the caller server-side. */
export function toActivityInput(form: ScheduleForm): CreateActivityInput | null {
    if (!form.summary.trim() || !form.dueAt) return null
    return {
        type: form.type,
        summary: form.summary.trim(),
        dueAt: new Date(form.dueAt).toISOString(),
    }
}

type ActivityScheduleFieldsProps = {
    form: ScheduleForm
    setForm: Dispatch<SetStateAction<ScheduleForm>>
    summaryPlaceholder?: string
}

export default function ActivityScheduleFields({
    form,
    setForm,
    summaryPlaceholder = 'e.g. Call to confirm next step',
}: ActivityScheduleFieldsProps) {
    return (
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
            <FormItem label="Type">
                <CrmSelect
                    options={enumOptions(ACTIVITY_TYPES)}
                    value={form.type}
                    onChange={(value) =>
                        setForm((f) => ({ ...f, type: (value ?? f.type) as ActivityType }))
                    }
                />
            </FormItem>
            <FormItem label="Due" asterisk className="md:col-span-2">
                <Input
                    type="datetime-local"
                    value={form.dueAt}
                    onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
                />
            </FormItem>
            <FormItem label="Summary" asterisk className="md:col-span-3">
                <Input
                    maxLength={500}
                    placeholder={summaryPlaceholder}
                    value={form.summary}
                    onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                />
            </FormItem>
        </div>
    )
}
