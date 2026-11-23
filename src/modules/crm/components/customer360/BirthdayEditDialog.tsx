'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import DatePicker from '@/components/ui/DatePicker'
import Dialog from '@/components/ui/Dialog'

function toIsoDate(value: Date | null): string | null {
    if (!value) return null
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function parseIsoDate(value: string | null | undefined): Date | null {
    if (!value) return null
    const day = value.slice(0, 10)
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
    if (!match) return null
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export default function BirthdayEditDialog({
    isOpen,
    birthDate,
    onClose,
    onSave,
}: {
    isOpen: boolean
    birthDate: string | null
    onClose: () => void
    onSave: (birthDate: string | null) => Promise<void>
}) {
    const [value, setValue] = useState<Date | null>(() => parseIsoDate(birthDate))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (isOpen) {
            setValue(parseIsoDate(birthDate))
            setError(null)
        }
    }, [isOpen, birthDate])

    const handleClose = () => {
        onClose()
    }

    const submit = async () => {
        setSaving(true)
        setError(null)
        try {
            await onSave(toIsoDate(value))
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to save birthday')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog isOpen={isOpen} onClose={handleClose} onRequestClose={handleClose} width={400}>
            <h5 className="mb-3">Birthday</h5>
            <DatePicker
                inputtable
                placeholder="Not set"
                value={value}
                maxDate={new Date()}
                onChange={(date) => setValue(date)}
            />
            <div className="mt-2 flex gap-2">
                <Button size="xs" disabled={!value} onClick={() => setValue(null)}>
                    Clear
                </Button>
            </div>
            {error ? (
                <Alert showIcon type="danger" className="mt-3">
                    {error}
                </Alert>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
                <Button onClick={handleClose}>Cancel</Button>
                <Button variant="solid" loading={saving} onClick={() => void submit()}>
                    Save
                </Button>
            </div>
        </Dialog>
    )
}
