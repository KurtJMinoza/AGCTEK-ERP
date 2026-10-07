'use client'

import { useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import ActivityScheduleFields, {
    activityDueTone,
    emptyScheduleForm,
    toActivityInput,
    type ScheduleForm,
} from '../ActivityScheduleFields'
import { formatEnumLabel, formatUserName } from '../../utils/format'
import {
    OPPORTUNITY_OPEN_STAGES,
    type Activity,
    type CreateActivityInput,
    type Opportunity,
} from '../../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

const OPEN_STAGES: ReadonlySet<string> = new Set(OPPORTUNITY_OPEN_STAGES)

type OpportunityActivityPanelProps = {
    opportunity: Opportunity
    activities: Activity[]
    loading: boolean
    error: string | null
    canCreate: boolean
    canUpdate: boolean
    create: (body: CreateActivityInput) => Promise<void>
    complete: (activityId: string, next?: CreateActivityInput) => Promise<void>
    /** Refresh the opportunity's next-activity badge after any change. */
    onChanged: () => void
}

/** Dialog target: a fresh activity, or the follow-up scheduled while completing one. */
type ScheduleTarget = { completing: Activity | null }

function ActivityLine({ activity }: { activity: Activity }) {
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <StatusBadge>{formatEnumLabel(activity.type)}</StatusBadge>
                <StatusBadge tone={activityDueTone[activity.dueStatus]}>
                    {formatEnumLabel(activity.dueStatus)}
                </StatusBadge>
            </div>
            <p className="mt-1 font-medium">{activity.summary}</p>
            <p className="text-xs text-gray-500">
                Due {new Date(activity.dueAt).toLocaleString()} · {formatUserName(activity.assignee)}
            </p>
        </>
    )
}

export default function OpportunityActivityPanel({
    opportunity,
    activities,
    loading,
    error,
    canCreate,
    canUpdate,
    create,
    complete,
    onChanged,
}: OpportunityActivityPanelProps) {
    const [target, setTarget] = useState<ScheduleTarget | null>(null)
    const [form, setForm] = useState<ScheduleForm>(emptyScheduleForm)
    const [busy, setBusy] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [formError, setFormError] = useState<string | null>(null)

    const acceptsActivities = OPEN_STAGES.has(opportunity.stage)
    /** API order: open first by earliest due — the first open row is the badge's activity. */
    const open = activities.filter((a) => !a.doneAt)
    const [next, ...laterOpen] = open

    const openSchedule = (completing: Activity | null) => {
        setForm(emptyScheduleForm())
        setFormError(null)
        setTarget({ completing })
    }

    const markDone = async (activity: Activity) => {
        setBusy(activity.id)
        setActionError(null)
        try {
            await complete(activity.id)
            onChanged()
        } catch (err) {
            setActionError(getApiErrorMessage(err, 'Failed to complete activity'))
        } finally {
            setBusy(null)
        }
    }

    const submitSchedule = async () => {
        if (!target) return
        const input = toActivityInput(form)
        if (!input) {
            setFormError('Summary and due date are required')
            return
        }
        setBusy('form')
        setFormError(null)
        try {
            if (target.completing) await complete(target.completing.id, input)
            else await create(input)
            setTarget(null)
            onChanged()
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'Failed to schedule activity'))
        } finally {
            setBusy(null)
        }
    }

    return (
        <AdaptiveCard>
            <div className="mb-3 flex items-center justify-between gap-2">
                <h5>Next activity</h5>
                {acceptsActivities && canCreate && next ? (
                    <Button size="sm" onClick={() => openSchedule(null)}>
                        Schedule activity
                    </Button>
                ) : null}
            </div>

            {error ? (
                <Alert showIcon type="danger" className="mb-3">
                    {error}
                </Alert>
            ) : null}
            {actionError ? (
                <Alert showIcon type="danger" className="mb-3">
                    {actionError}
                </Alert>
            ) : null}

            {loading && activities.length === 0 ? (
                <div className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
            ) : next ? (
                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <ActivityLine activity={next} />
                    {canUpdate ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                loading={busy === next.id}
                                disabled={Boolean(busy)}
                                onClick={() => void markDone(next)}
                            >
                                Mark done
                            </Button>
                            {acceptsActivities && canCreate ? (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    disabled={Boolean(busy)}
                                    onClick={() => openSchedule(next)}
                                >
                                    Done & schedule next
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : acceptsActivities ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center dark:border-gray-600">
                    <p className="text-sm text-gray-500">
                        No activity is scheduled. Plan the next step so this deal does not stall.
                    </p>
                    {canCreate ? (
                        <Button
                            size="sm"
                            variant="solid"
                            className="mt-3"
                            onClick={() => openSchedule(null)}
                        >
                            Schedule activity
                        </Button>
                    ) : null}
                </div>
            ) : (
                <p className="text-sm text-gray-500">
                    This opportunity is closed. Reopen it from the stage bar to plan new activities.
                </p>
            )}

            {laterOpen.length > 0 ? (
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Also planned</p>
                    <ul className="flex flex-col gap-2">
                        {laterOpen.map((activity) => (
                            <li
                                key={activity.id}
                                className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 p-3 text-sm dark:border-gray-700"
                            >
                                <div className="min-w-0">
                                    <ActivityLine activity={activity} />
                                </div>
                                {canUpdate ? (
                                    <Button
                                        size="xs"
                                        loading={busy === activity.id}
                                        disabled={Boolean(busy)}
                                        onClick={() => void markDone(activity)}
                                    >
                                        Done
                                    </Button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <FormDialog
                isOpen={Boolean(target)}
                onClose={() => setTarget(null)}
                title={
                    target?.completing
                        ? `Follow-up after “${target.completing.summary}”`
                        : 'Schedule activity'
                }
                description={
                    target?.completing
                        ? 'The current activity is marked done and the follow-up is scheduled together.'
                        : 'The activity is assigned to you.'
                }
                confirmText={target?.completing ? 'Complete & schedule' : 'Schedule'}
                confirmLoading={busy === 'form'}
                onSubmit={() => void submitSchedule()}
            >
                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}
                <ActivityScheduleFields form={form} setForm={setForm} />
            </FormDialog>
        </AdaptiveCard>
    )
}
