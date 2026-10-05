'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import Spinner from '@/components/ui/Spinner'
import { Form, FormItem } from '@/components/ui/Form'
import type { GeofenceKind, GeofenceZone } from '../../utils/geofences'
import { getApiErrorMessage } from '../../utils/apiError'
import type { GeofenceDraft } from './GeofenceDrawLayer'

const GeofenceDrawMap = dynamic(() => import('./GeofenceDrawMap'), {
    ssr: false,
    loading: () => (
        <div className="flex h-64 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700">
            <Spinner size={28} />
        </div>
    ),
})

type Option = { value: string; label: string }

const kindOptions: Option[] = [
    { value: 'HUB', label: 'Hub' },
    { value: 'CHECKPOINT', label: 'Checkpoint' },
    { value: 'ZONE', label: 'Zone' },
]

type GeofenceEditorDialogProps = {
    isOpen: boolean
    initial?: GeofenceZone | null
    existingGeofences?: GeofenceZone[]
    draft: GeofenceDraft | null
    onDraftChange: (draft: GeofenceDraft) => void
    onClose: () => void
    onSave: (body: Partial<GeofenceZone>) => Promise<void>
}

const emptyMeta = {
    code: '',
    name: '',
    kind: 'HUB' as GeofenceKind,
    color: '#38bdf8',
    notes: '',
}

export default function GeofenceEditorDialog({
    isOpen,
    initial,
    existingGeofences = [],
    draft,
    onDraftChange,
    onClose,
    onSave,
}: GeofenceEditorDialogProps) {
    const [meta, setMeta] = useState(emptyMeta)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) return
        setError(null)
        if (initial) {
            setMeta({
                code: initial.code,
                name: initial.name,
                kind: initial.kind,
                color: initial.color ?? '#38bdf8',
                notes: initial.notes ?? '',
            })
        } else {
            setMeta(emptyMeta)
        }
    }, [isOpen, initial])

    const submit = async () => {
        if (!draft) {
            setError('Click and drag on the map to place the geofence circle.')
            return
        }
        setSaving(true)
        setError(null)
        try {
            await onSave({
                name: meta.name,
                kind: meta.kind,
                lat: draft.lat,
                lng: draft.lng,
                radiusM: draft.radiusM,
                color: meta.color || null,
                notes: meta.notes || null,
                active: true,
            })
            onClose()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to save geofence'))
        } finally {
            setSaving(false)
        }
    }

    const patchDraft = (patch: Partial<GeofenceDraft>) => {
        const base = draft ?? {
            lat: 14.5995,
            lng: 120.9842,
            radiusM: 900,
            color: meta.color,
        }
        onDraftChange({
            ...base,
            ...patch,
            color: meta.color,
        })
    }

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            onRequestClose={onClose}
            width={640}
        >
            <h5 className="mb-2">
                {initial ? 'Edit geofence / hub' : 'Add geofence / hub'}
            </h5>
            <p className="mb-3 text-xs text-gray-500">
                Click the map to set the center, then drag the circle edge to
                set the radius. Drag empty map area to pan. Saves to Postgres
                and Tile38.
            </p>
            {error ? (
                <Alert showIcon type="danger" className="mb-3">
                    {error}
                </Alert>
            ) : null}

            <div className="mb-3">
                <GeofenceDrawMap
                    draft={draft}
                    onDraftChange={onDraftChange}
                    existing={existingGeofences}
                    editingId={initial?.id ?? null}
                />
            </div>

            {draft ? (
                <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    Center {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)} ·{' '}
                    <span className="font-medium">{draft.radiusM} m</span>{' '}
                    radius
                </p>
            ) : null}

            <Form
                onSubmit={(e) => {
                    e.preventDefault()
                    void submit()
                }}
            >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {initial ? (
                        <FormItem label="Code">
                            <Input value={meta.code} disabled />
                        </FormItem>
                    ) : (
                        <FormItem label="Code">
                            <Input
                                value="Auto-generated on save"
                                disabled
                            />
                        </FormItem>
                    )}
                    <FormItem label="Kind">
                        <Select
                            options={kindOptions}
                            value={kindOptions.find(
                                (o) => o.value === meta.kind,
                            )}
                            onChange={(option) =>
                                setMeta((f) => ({
                                    ...f,
                                    kind: ((option as Option | null)?.value ||
                                        'HUB') as GeofenceKind,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Name" className="md:col-span-2">
                        <Input
                            value={meta.name}
                            onChange={(e) =>
                                setMeta((f) => ({ ...f, name: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Latitude">
                        <Input
                            value={draft ? String(draft.lat) : ''}
                            placeholder="Set on map"
                            onChange={(e) => {
                                const lat = Number(e.target.value)
                                if (Number.isFinite(lat)) patchDraft({ lat })
                            }}
                        />
                    </FormItem>
                    <FormItem label="Longitude">
                        <Input
                            value={draft ? String(draft.lng) : ''}
                            placeholder="Set on map"
                            onChange={(e) => {
                                const lng = Number(e.target.value)
                                if (Number.isFinite(lng)) patchDraft({ lng })
                            }}
                        />
                    </FormItem>
                    <FormItem label="Radius (m)">
                        <Input
                            value={draft ? String(draft.radiusM) : ''}
                            placeholder="Drag on map"
                            onChange={(e) => {
                                const radiusM = Number(e.target.value)
                                if (Number.isFinite(radiusM) && radiusM > 0) {
                                    patchDraft({ radiusM: Math.round(radiusM) })
                                }
                            }}
                        />
                    </FormItem>
                    <FormItem label="Color">
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
                                    if (draft) {
                                        onDraftChange({ ...draft, color })
                                    }
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
                </div>
                <FormItem label="Notes" className="mt-3">
                    <Input
                        textArea
                        value={meta.notes}
                        onChange={(e) =>
                            setMeta((f) => ({ ...f, notes: e.target.value }))
                        }
                    />
                </FormItem>
                <div className="mt-4 flex justify-end gap-2">
                    <Button type="button" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="solid" loading={saving}>
                        Save
                    </Button>
                </div>
            </Form>
        </Dialog>
    )
}
