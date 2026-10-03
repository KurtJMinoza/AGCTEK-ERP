'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import { Form, FormItem } from '@/components/ui/Form'
import { apiUpdateDemandPlan } from '../../services/scmApi'
import { getApiErrorMessage } from '../../utils/apiError'
import type { DemandPlanDetail } from '../../types'

type Props = {
    isOpen: boolean
    plan: DemandPlanDetail | null
    onClose: () => void
    onSaved: () => void
}

/** Horizon parameters of the plan version (editable only while DRAFT). */
export default function DemandPlanSettingsDialog({
    isOpen,
    plan,
    onClose,
    onSaved,
}: Props) {
    const [viewLength, setViewLength] = useState('')
    const [freeze, setFreeze] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen || !plan) return
        setViewLength(String(plan.viewLength))
        setFreeze(String(plan.freezeFencePeriods))
        setError(null)
    }, [isOpen, plan])

    if (!plan) return null
    const editable = plan.status === 'DRAFT'
    const unit = plan.bucket.toLowerCase()

    const onSubmit = async () => {
        setSaving(true)
        setError(null)
        try {
            await apiUpdateDemandPlan(plan.id, {
                viewLength: Number(viewLength),
                freezeFencePeriods: Number(freeze),
            })
            onSaved()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to save horizon settings'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            onRequestClose={onClose}
            width={480}
        >
            <h5 className="mb-1">Horizon settings · {plan.code}</h5>
            <p className="mb-4 text-sm text-gray-500">
                {plan.horizonKind.toLowerCase()} horizon · {unit} buckets ·{' '}
                {plan.granularity.toLowerCase()} granularity
            </p>
            {!editable ? (
                <Alert showIcon type="info" className="mb-4">
                    Settings are locked while the plan is {plan.status}.
                </Alert>
            ) : null}
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
                <div className="grid grid-cols-2 gap-4">
                    <FormItem label={`View length (${unit}s)`}>
                        <Input
                            type="number"
                            min={1}
                            value={viewLength}
                            disabled={!editable}
                            onChange={(e) => setViewLength(e.target.value)}
                        />
                    </FormItem>
                    <FormItem label={`Freeze fence (${unit}s)`}>
                        <Input
                            type="number"
                            min={0}
                            value={freeze}
                            disabled={!editable}
                            onChange={(e) => setFreeze(e.target.value)}
                        />
                    </FormItem>
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" onClick={onClose}>
                        Close
                    </Button>
                    {editable ? (
                        <Button variant="solid" type="submit" loading={saving}>
                            Save
                        </Button>
                    ) : null}
                </div>
            </Form>
        </Dialog>
    )
}
