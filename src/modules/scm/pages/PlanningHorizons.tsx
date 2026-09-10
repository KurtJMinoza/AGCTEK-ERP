'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { Form, FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { usePlanningSettings } from '../hooks/usePlanningSettings'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import { getApiErrorMessage } from '../utils/apiError'
import type { PlanningBucketSize } from '../types'

type Option = { value: PlanningBucketSize; label: string }

const bucketOptions: Option[] = [
    { value: 'DAY', label: 'Day' },
    { value: 'WEEK', label: 'Week' },
]

export default function PlanningHorizonsPage() {
    const { settings, loading, saving, error, save } = usePlanningSettings()
    const [horizonWeeks, setHorizonWeeks] = useState('12')
    const [bucketSize, setBucketSize] = useState<PlanningBucketSize>('WEEK')
    const [frozenZoneDays, setFrozenZoneDays] = useState('7')
    const [formError, setFormError] = useState<string | null>(null)
    const [savedOk, setSavedOk] = useState(false)

    useEffect(() => {
        if (!settings) return
        setHorizonWeeks(String(settings.horizonWeeks))
        setBucketSize(settings.bucketSize)
        setFrozenZoneDays(String(settings.frozenZoneDays))
    }, [settings])

    const onSave = async () => {
        setFormError(null)
        setSavedOk(false)
        const weeks = Number(horizonWeeks)
        const frozen = Number(frozenZoneDays)
        if (!Number.isInteger(weeks) || weeks < 1 || weeks > 104) {
            setFormError('Horizon weeks must be an integer from 1 to 104.')
            return
        }
        if (!Number.isInteger(frozen) || frozen < 0 || frozen > 365) {
            setFormError('Frozen zone days must be an integer from 0 to 365.')
            return
        }
        try {
            await save({
                horizonWeeks: weeks,
                bucketSize,
                frozenZoneDays: frozen,
            })
            setSavedOk(true)
        } catch (err) {
            setFormError(
                getApiErrorMessage(err, 'Failed to save planning settings'),
            )
        }
    }

    return (
        <PageContainer>
            <PageHeader
                title="Planning Horizons"
                description="Planning buckets and frozen-zone parameters for demand forecasting."
                breadcrumbs={scmPageBreadcrumbs('Planning Horizons', 'planning')}
            />

            <Alert showIcon type="info" className="mb-4" title="Demand Planning config">
                These settings are saved for Phase 1 Demand Planning. They do
                not affect transportation execution (shipments → trips →
                tracking).
            </Alert>

            {(error || formError) && (
                <Alert showIcon type="danger" className="mb-4">
                    {formError || error}
                </Alert>
            )}
            {savedOk && (
                <Alert showIcon type="success" className="mb-4">
                    Planning horizons saved.
                </Alert>
            )}

            <AdaptiveCard>
                <Form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void onSave()
                    }}
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <FormItem label="Horizon (weeks)">
                            <Input
                                type="number"
                                min={1}
                                max={104}
                                value={horizonWeeks}
                                disabled={loading || saving}
                                onChange={(e) =>
                                    setHorizonWeeks(e.target.value)
                                }
                            />
                        </FormItem>
                        <FormItem label="Bucket size">
                            <Select
                                options={bucketOptions}
                                value={bucketOptions.find(
                                    (o) => o.value === bucketSize,
                                )}
                                isDisabled={loading || saving}
                                onChange={(opt) => {
                                    if (opt) setBucketSize(opt.value)
                                }}
                            />
                        </FormItem>
                        <FormItem label="Frozen zone (days)">
                            <Input
                                type="number"
                                min={0}
                                max={365}
                                value={frozenZoneDays}
                                disabled={loading || saving}
                                onChange={(e) =>
                                    setFrozenZoneDays(e.target.value)
                                }
                            />
                        </FormItem>
                    </div>

                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Near-term days inside the frozen zone are treated as
                        locked once Demand Planning is live.
                    </p>

                    <div className="mt-6 flex flex-wrap gap-2">
                        <Button
                            variant="solid"
                            type="submit"
                            loading={saving}
                            disabled={loading}
                        >
                            Save
                        </Button>
                        <Link href="/scm/demand-planning">
                            <Button type="button">Demand Planning</Button>
                        </Link>
                        <Link href="/scm">
                            <Button type="button">Transportation</Button>
                        </Link>
                    </div>
                </Form>
            </AdaptiveCard>
        </PageContainer>
    )
}
