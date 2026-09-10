'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import { Form, FormItem } from '@/components/ui/Form'
import type { GeofenceKind, GeofenceZone } from '../../utils/geofences'
import { getApiErrorMessage } from '../../utils/apiError'

type Option = { value: string; label: string }

const kindOptions: Option[] = [
    { value: 'HUB', label: 'Hub' },
    { value: 'CHECKPOINT', label: 'Checkpoint' },
    { value: 'ZONE', label: 'Zone' },
]

type GeofenceEditorDialogProps = {
    isOpen: boolean
    initial?: GeofenceZone | null
    onClose: () => void
    onSave: (body: Partial<GeofenceZone>) => Promise<void>
}

const empty = {
    code: '',
    name: '',
    kind: 'HUB' as GeofenceKind,
    lat: '14.5995',
    lng: '120.9842',
    radiusM: '900',
    color: '#38bdf8',
    notes: '',
}

export default function GeofenceEditorDialog({
    isOpen,
    initial,
    onClose,
    onSave,
}: GeofenceEditorDialogProps) {
    const [form, setForm] = useState(empty)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) return
        setError(null)
        if (initial) {
            setForm({
                code: initial.code,
                name: initial.name,
                kind: initial.kind,
                lat: String(initial.lat),
                lng: String(initial.lng),
                radiusM: String(initial.radiusM),
                color: initial.color ?? '#38bdf8',
                notes: initial.notes ?? '',
            })
        } else {
            setForm(empty)
        }
    }, [isOpen, initial])

    const submit = async () => {
        setSaving(true)
        setError(null)
        try {
            await onSave({
                code: form.code,
                name: form.name,
                kind: form.kind,
                lat: Number(form.lat),
                lng: Number(form.lng),
                radiusM: Number(form.radiusM),
                color: form.color || null,
                notes: form.notes || null,
                active: true,
            })
            onClose()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to save geofence'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            onRequestClose={onClose}
            width={520}
        >
            <h5 className="mb-4">
                {initial ? 'Edit geofence / hub' : 'Add geofence / hub'}
            </h5>
            <p className="mb-3 text-xs text-gray-500">
                Saved to Postgres and synced to Tile38 (circle + enter/exit
                hook).
            </p>
            {error ? (
                <Alert showIcon type="danger" className="mb-3">
                    {error}
                </Alert>
            ) : null}
            <Form
                onSubmit={(e) => {
                    e.preventDefault()
                    void submit()
                }}
            >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FormItem label="Code">
                        <Input
                            value={form.code}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, code: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Kind">
                        <Select
                            options={kindOptions}
                            value={kindOptions.find(
                                (o) => o.value === form.kind,
                            )}
                            onChange={(option) =>
                                setForm((f) => ({
                                    ...f,
                                    kind: ((option as Option | null)?.value ||
                                        'HUB') as GeofenceKind,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Name" className="md:col-span-2">
                        <Input
                            value={form.name}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, name: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Latitude">
                        <Input
                            value={form.lat}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, lat: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Longitude">
                        <Input
                            value={form.lng}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, lng: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Radius (m)">
                        <Input
                            value={form.radiusM}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    radiusM: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Color">
                        <Input
                            value={form.color}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    color: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                </div>
                <FormItem label="Notes" className="mt-3">
                    <Input
                        textArea
                        value={form.notes}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, notes: e.target.value }))
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
