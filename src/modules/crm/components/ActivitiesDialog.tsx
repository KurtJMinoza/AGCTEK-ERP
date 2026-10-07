'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import ActivityScheduleFields, {
    activityDueTone as dueTone,
    emptyScheduleForm as emptyForm,
    toActivityInput,
    type ScheduleForm,
} from './ActivityScheduleFields'
import { useActivities } from '../hooks/useOpportunityActivities'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { formatEnumLabel, formatUserName } from '../utils/format'
import type { Activity, ActivityParent } from '../types'

const assigneeName = (activity: Activity) => formatUserName(activity.assignee)

export type ActivitiesDialogProps = {
    /** null closes the dialog. */
    parent: ActivityParent | null
    title: string
    description?: string
    headerExtra?: ReactNode
    /** Whether the parent still accepts new activities (server enforces the same rule). */
    acceptsActivities: boolean
    /** Shown instead of the schedule form when the parent no longer accepts activities. */
    closedHint: string
    summaryPlaceholder?: string
    canCreate: boolean
    canUpdate: boolean
    onClose: () => void
    /** Called after any change so callers can refresh next-activity badges. */
    onChanged?: () => void
}

/** Activity timeline + scheduling for any activity parent (opportunity or ticket). */
export default function ActivitiesDialog({
    parent,
    title,
    description,
    headerExtra,
    acceptsActivities: isOpenStage,
    closedHint,
    summaryPlaceholder = 'e.g. Call to confirm next step',
    canCreate,
    canUpdate,
    onClose,
    onChanged,
}: ActivitiesDialogProps) {
    const { activities, loading, error, create, complete } = useActivities(parent)
    const [form, setForm] = useState<ScheduleForm>(emptyForm)
    /** Set while "Done & schedule next" is pending: the form schedules the follow-up. */
    const [completing, setCompleting] = useState<Activity | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [formError, setFormError] = useState<string | null>(null)

    const canSchedule = isOpenStage && (completing ? canUpdate && canCreate : canCreate)

    useEffect(() => {
        setForm(emptyForm())
        setCompleting(null)
        setFormError(null)
    }, [parent?.kind, parent?.id])

    const run = async (key: string, action: () => Promise<unknown>, fallback: string) => {
        setBusy(key)
        setFormError(null)
        try {
            await action()
            onChanged?.()
            return true
        } catch (err) {
            setFormError(getApiErrorMessage(err, fallback))
            return false
        } finally {
            setBusy(null)
        }
    }

    const markDone = (activity: Activity) =>
        run(activity.id, () => complete(activity.id), 'Failed to complete activity')

    const submit = async () => {
        const input = toActivityInput(form)
        if (!input) {
            setFormError('Summary and due date are required')
            return
        }
        const ok = completing
            ? await run('form', () => complete(completing.id, input), 'Failed to complete activity')
            : await run('form', () => create(input), 'Failed to schedule activity')
        if (ok) {
            setForm(emptyForm())
            setCompleting(null)
        }
    }

    return (
        <FormDialog
            isOpen={Boolean(parent)}
            onClose={onClose}
            size="lg"
            title={title}
            description={description}
            headerExtra={headerExtra}
            footer={<Button onClick={onClose}>Close</Button>}
        >
            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}
            {formError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {formError}
                </Alert>
            ) : null}

            <h6 className="mb-2">Activities</h6>
            {loading && activities.length === 0 ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : activities.length === 0 ? (
                <p className="text-sm text-gray-500">No activities yet.</p>
            ) : (
                <ul className="mb-4 flex flex-col gap-2">
                    {activities.map((activity) => {
                        const open = !activity.doneAt
                        return (
                            <li
                                key={activity.id}
                                className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 md:flex-row md:items-center dark:border-gray-700"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge>{formatEnumLabel(activity.type)}</StatusBadge>
                                        <StatusBadge tone={dueTone[activity.dueStatus]}>
                                            {formatEnumLabel(activity.dueStatus)}
                                        </StatusBadge>
                                        <span
                                            className={
                                                open
                                                    ? 'text-sm font-medium'
                                                    : 'text-sm text-gray-500 line-through'
                                            }
                                        >
                                            {activity.summary}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">
                                        Due {new Date(activity.dueAt).toLocaleString()} ·{' '}
                                        {assigneeName(activity)}
                                        {activity.doneAt
                                            ? ` · Done ${new Date(activity.doneAt).toLocaleString()}`
                                            : ''}
                                    </p>
                                </div>
                                {open && canUpdate ? (
                                    <div className="flex shrink-0 gap-2">
                                        <Button
                                            size="xs"
                                            loading={busy === activity.id}
                                            disabled={Boolean(busy)}
                                            onClick={() => void markDone(activity)}
                                        >
                                            Done
                                        </Button>
                                        {isOpenStage && canCreate ? (
                                            <Button
                                                size="xs"
                                                variant="solid"
                                                disabled={Boolean(busy)}
                                                onClick={() => {
                                                    setCompleting(activity)
                                                    setFormError(null)
                                                }}
                                            >
                                                Done & schedule next
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </li>
                        )
                    })}
                </ul>
            )}

            {canSchedule ? (
                <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <h6>
                            {completing
                                ? `Follow-up after “${completing.summary}”`
                                : 'Schedule activity'}
                        </h6>
                        {completing ? (
                            <Button size="xs" variant="plain" onClick={() => setCompleting(null)}>
                                Cancel
                            </Button>
                        ) : null}
                    </div>
                    <ActivityScheduleFields
                        form={form}
                        setForm={setForm}
                        summaryPlaceholder={summaryPlaceholder}
                    />
                    <div className="flex justify-end">
                        <Button
                            size="sm"
                            variant="solid"
                            loading={busy === 'form'}
                            disabled={Boolean(busy) || !form.summary.trim()}
                            onClick={() => void submit()}
                        >
                            {completing ? 'Complete & schedule' : 'Schedule'}
                        </Button>
                    </div>
                </div>
            ) : parent && !isOpenStage ? (
                <p className="mt-4 text-xs text-gray-500">{closedHint}</p>
            ) : null}
        </FormDialog>
    )
}
