'use client'

import { useCallback, useEffect, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { inventoryControlService } from '../services/inventoryControlService'

const ROUTE = '/modules/mm/inventory-control/count-configuration'

const CountConfigurationPage = () => {
    const [companyId, setCompanyId] = useState('')
    const [form, setForm] = useState<any>({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
        if (!companyId.trim()) return
        setLoading(true)
        try {
            const cfg = await inventoryControlService.getCountConfiguration(companyId.trim())
            setForm(cfg)
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const save = async () => {
        setSaving(true)
        try {
            await inventoryControlService.saveCountConfiguration({
                companyId: companyId.trim(),
                blindCountingEnabled: form.blindCountingEnabled,
                separationOfDutiesEnabled: form.separationOfDutiesEnabled,
                movementControlPolicy: form.movementControlPolicy,
                financeApprovalValueThreshold: Number(form.financeApprovalValueThreshold ?? 0),
                absoluteQtyTolerance: Number(form.absoluteQtyTolerance ?? 0),
                percentTolerance: Number(form.percentTolerance ?? 0),
                requireRootCauseAnalysis: form.requireRootCauseAnalysis,
                differentRecountWorkerRequired: form.differentRecountWorkerRequired,
            })
            load()
        } finally {
            setSaving(false)
        }
    }

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Count Configuration"
                description="Company-scoped ISO inventory count controls (blind count, SoD, movement freeze, tolerances)."
            />
            <AdaptiveCard>
                <Input
                    className="mb-4 max-w-md"
                    placeholder="Company ID"
                    value={companyId}
                    onChange={(e: any) => setCompanyId(e.target.value)}
                />
                {loading && <p className="text-sm">Loading…</p>}
                {form.id && (
                    <div className="grid gap-4 max-w-lg">
                        <FormItem label="Blind counting">
                            <Checkbox
                                checked={!!form.blindCountingEnabled}
                                onChange={(c) =>
                                    setForm((f: any) => ({ ...f, blindCountingEnabled: c }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Separation of duties">
                            <Checkbox
                                checked={!!form.separationOfDutiesEnabled}
                                onChange={(c) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        separationOfDutiesEnabled: c,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Movement control">
                            <Select
                                options={[
                                    { value: 'NONE', label: 'None' },
                                    { value: 'SOFT', label: 'Soft (reconcile movements)' },
                                    { value: 'HARD', label: 'Hard freeze' },
                                ]}
                                value={
                                    [
                                        { value: 'NONE', label: 'None' },
                                        { value: 'SOFT', label: 'Soft (reconcile movements)' },
                                        { value: 'HARD', label: 'Hard freeze' },
                                    ].find((o) => o.value === form.movementControlPolicy) ?? null
                                }
                                onChange={(o: any) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        movementControlPolicy: o?.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Finance approval threshold (value)">
                            <Input
                                value={String(form.financeApprovalValueThreshold ?? 0)}
                                onChange={(e: any) =>
                                    setForm((f: any) => ({
                                        ...f,
                                        financeApprovalValueThreshold: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <Button variant="solid" loading={saving} onClick={save}>
                            Save configuration
                        </Button>
                    </div>
                )}
            </AdaptiveCard>
        </PageContainer>
    )
}

export default CountConfigurationPage
