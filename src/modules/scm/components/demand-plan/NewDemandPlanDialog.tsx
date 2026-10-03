'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { Form, FormItem } from '@/components/ui/Form'
import { apiCreateDemandPlan } from '../../services/scmApi'
import { getApiErrorMessage } from '../../utils/apiError'
import type {
    DemandHorizonKind,
    DemandHorizonPreset,
    DemandPlanVersion,
} from '../../types'

type Opt<T extends string = string> = { value: T; label: string }

type Props = {
    isOpen: boolean
    presets: DemandHorizonPreset[]
    plans: DemandPlanVersion[]
    onClose: () => void
    onCreated: (plan: DemandPlanVersion) => void
}

export default function NewDemandPlanDialog({
    isOpen,
    presets,
    plans,
    onClose,
    onCreated,
}: Props) {
    const [horizonKind, setHorizonKind] =
        useState<DemandHorizonKind>('OPERATIONAL')
    const [code, setCode] = useState('')
    const [copyFrom, setCopyFrom] = useState('')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) return
        setHorizonKind('OPERATIONAL')
        setCode('')
        setNotes('')
        setError(null)
        setCopyFrom(plans.find((p) => p.status === 'PUBLISHED')?.id ?? '')
    }, [isOpen, plans])

    const horizonOptions: Opt<DemandHorizonKind>[] = presets.map((p) => ({
        value: p.kind,
        label: `${p.label} — ${p.bucket.toLowerCase()} × ${p.granularity.toLowerCase()}, ${p.viewLength} periods`,
    }))
    const copyOptions: Opt[] = plans.map((p) => ({
        value: p.id,
        label: `${p.code} · ${p.status}`,
    }))

    const onSubmit = async () => {
        setSaving(true)
        setError(null)
        try {
            const created = await apiCreateDemandPlan({
                horizonKind,
                code: code.trim() || undefined,
                copyFromVersionId: copyFrom || undefined,
                notes: notes.trim() || undefined,
            })
            onCreated(created)
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to create demand plan'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            onRequestClose={onClose}
            width={560}
        >
            <h5 className="mb-4">New demand plan version</h5>
            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}
            <Form
                onSubmit={(e) => {
                    e.preventDefault()
                    void onSubmit()
                }}
            >
                <FormItem label="Primary horizon">
                    <Select
                        options={horizonOptions}
                        value={horizonOptions.find((o) => o.value === horizonKind)}
                        onChange={(o) => o && setHorizonKind(o.value)}
                    />
                </FormItem>
                <FormItem label="Code" extra="Leave blank for DP-YYYY-MM">
                    <Input
                        value={code}
                        placeholder="DP-2026-10"
                        onChange={(e) => setCode(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Copy lines from">
                    <Select
                        isClearable
                        options={copyOptions}
                        value={copyOptions.find((o) => o.value === copyFrom) ?? null}
                        onChange={(o) => setCopyFrom(o?.value ?? '')}
                    />
                </FormItem>
                <FormItem label="Notes">
                    <Input
                        textArea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </FormItem>
                <div className="flex justify-end gap-2">
                    <Button type="button" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="solid" type="submit" loading={saving}>
                        Create draft
                    </Button>
                </div>
            </Form>
        </Dialog>
    )
}
