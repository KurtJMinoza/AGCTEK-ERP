'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import { Form, FormItem } from '@/components/ui/Form'
import type { GeofenceKind, GeofenceZone } from '../../utils/geofences'
import { getApiErrorMessage } from '../../utils/apiError'
import type { GeofenceDraft } from './GeofenceDrawLayer'

type Option = { value: string; label: string }

const kindOptions: Option[] = [
    { value: 'HUB', label: 'Hub' },
    { value: 'CHECKPOINT', label: 'Checkpoint' },
    { value: 'ZONE', label: 'Zone' },
]

type GeofenceEditPanelProps = {
    initial?: GeofenceZone | null
    draft: GeofenceDraft | null
    onDraftChange: (draft: GeofenceDraft) => void
    onCancel: () => void
    onSave: (body: Partial<GeofenceZone>) => Promise<void>
}

const emptyMeta = {
    name: '',
    kind: 'HUB' as GeofenceKind,
    color: '#38bdf8',
    notes: '',
}

/**
 * Inline geofence form for Live Tracking — draw on the main map, fill details here.
 */
export default function GeofenceEditPanel({
    initial,
    draft,
    onDraftChange,
    onCancel,
    onSave,
}: GeofenceEditPanelProps) {
    const [meta, setMeta] = useState(emptyMeta)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setError(null)
        if (initial) {
            setMeta({
                name: initial.name,
                kind: initial.kind,
                color: initial.color ?? '#38bdf8',
                notes: initial.notes ?? '',
            })
        } else {
            setMeta(emptyMeta)
        }
    }, [initial])

    const submit = async () => {
        if (!draft) {
            setError('Click the map to set the center, then drag the edge.')
            return
        }
        if (!meta.name.trim()) {
            setError('Name is required.')
            return
        }
        setSaving(true)
        setError(null)
        try {
            await onSave({
                name: meta.name.trim(),
                kind: meta.kind,
                lat: draft.lat,
                lng: draft.lng,
                radiusM: draft.radiusM,
                color: meta.color || null,
                notes: meta.notes || null,
                active: true,
            })
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to save geofence'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex h-full flex-col">
            <div className="mb-3">
                <h6 className="text-sm font-semibold">
                    {initial ? 'Edit geofence' : 'Add geofence'}
                </h6>
                <p className="mt-1 text-xs text-gray-500">
                    Draw on the map: click center, drag the circle edge for
                    radius. Code is auto-generated.
                </p>
            </div>

            {error ? (
                <Alert showIcon type="danger" className="mb-3">
                    {error}
                </Alert>
            ) : null}

            {draft ? (
                <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
                    {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)} ·{' '}
                    <span className="font-medium">{draft.radiusM} m</span>
                </p>
            ) : (
                <Alert showIcon type="info" className="mb-3">
                    Waiting for map placement…
                </Alert>
            )}

            {initial ? (
                <p className="mb-2 text-xs text-gray-500">
                    Code <span className="font-medium">{initial.code}</span>
                </p>
            ) : null}

            <Form
                className="flex flex-1 flex-col"
                onSubmit={(e) => {
                    e.preventDefault()
                    void submit()
                }}
            >
                <FormItem label="Name">
                    <Input
                        value={meta.name}
                        placeholder="e.g. North hub"
                        onChange={(e) =>
                            setMeta((f) => ({ ...f, name: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Kind" className="mt-2">
                    <Select
                        options={kindOptions}
                        value={kindOptions.find((o) => o.value === meta.kind)}
                        onChange={(option) =>
                            setMeta((f) => ({
                                ...f,
                                kind: ((option as Option | null)?.value ||
                                    'HUB') as GeofenceKind,
                            }))
                        }
                    />
                </FormItem>
                <FormItem label="Color" className="mt-2">
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            aria-label="Geofence color"
                            value={
                                /^#[0-9A-Fa-f]{6}$/.test(meta.color)
                                    ? meta.color
                                    : '#38bdf8'
                            }
                            className="h-10 w-12 cursor-pointer rounded-md border border-gray-300 bg-transparent p-1 dark:border-gray-600"
                            onChange={(e) => {
                                const color = e.target.value
                                setMeta((f) => ({ ...f, color }))
                                if (draft) onDraftChange({ ...draft, color })
                            }}
                        />
                        <Input
                            className="flex-1 font-mono uppercase"
                            value={meta.color}
                            placeholder="#38BDF8"
                            onChange={(e) => {
                                const color = e.target.value
                                setMeta((f) => ({ ...f, color }))
                                if (
                                    draft &&
                                    /^#[0-9A-Fa-f]{6}$/.test(color)
                                ) {
                                    onDraftChange({ ...draft, color })
                                }
                            }}
                        />
                    </div>
                </FormItem>
                <FormItem label="Notes" className="mt-2">
                    <Input
                        textArea
                        value={meta.notes}
                        onChange={(e) =>
                            setMeta((f) => ({ ...f, notes: e.target.value }))
                        }
                    />
                </FormItem>
                <div className="mt-auto flex gap-2 pt-4">
                    <Button
                        type="button"
                        className="flex-1"
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="solid"
                        className="flex-1"
                        loading={saving}
                    >
                        Save
                    </Button>
                </div>
            </Form>
        </div>
    )
}
