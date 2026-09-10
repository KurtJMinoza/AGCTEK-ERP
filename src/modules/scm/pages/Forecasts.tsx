'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Dialog from '@/components/ui/Dialog'
import Alert from '@/components/ui/Alert'
import { Form, FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { useForecasts } from '../hooks/useForecasts'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import { getApiErrorMessage } from '../utils/apiError'
import type { DemandForecast } from '../types'

const emptyForm = {
    productCode: '',
    locationCode: '',
    periodStart: '',
    periodEnd: '',
    quantity: '',
    unit: 'EA',
    source: '',
}

export default function ForecastsPage() {
    const {
        data,
        total,
        page,
        pageSize,
        loading,
        error,
        params,
        setParams,
        create,
        remove,
    } = useForecasts()

    const [createOpen, setCreateOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [form, setForm] = useState(emptyForm)

    const columns = useMemo<ColumnDef<DemandForecast>[]>(
        () => [
            {
                header: 'Material',
                accessorKey: 'productCode',
            },
            {
                header: 'Location',
                accessorKey: 'locationCode',
            },
            {
                header: 'Period',
                cell: ({ row }) =>
                    `${new Date(row.original.periodStart).toLocaleDateString()} – ${new Date(row.original.periodEnd).toLocaleDateString()}`,
            },
            {
                header: 'Predicted qty',
                cell: ({ row }) =>
                    `${row.original.quantity.toLocaleString()} ${row.original.unit}`,
            },
            {
                header: 'Notes',
                cell: ({ row }) => row.original.source || '—',
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        variant="plain"
                        className="text-red-600"
                        onClick={() => void remove(row.original.id)}
                    >
                        Delete
                    </Button>
                ),
            },
        ],
        [remove],
    )

    const onCreate = async () => {
        setSaving(true)
        setFormError(null)
        try {
            await create({
                productCode: form.productCode,
                locationCode: form.locationCode,
                periodStart: new Date(form.periodStart).toISOString(),
                periodEnd: new Date(form.periodEnd).toISOString(),
                quantity: Number(form.quantity),
                unit: form.unit || 'EA',
                source: form.source || null,
            })
            setCreateOpen(false)
            setForm(emptyForm)
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'Failed to create forecast'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <PageContainer>
            <PageHeader
                title="Demand forecasts"
                description="Planning stub — external SD/MM feeds later. Manual entry only; does not drive load building."
                breadcrumbs={scmPageBreadcrumbs('Forecasts', 'planning')}
                actions={
                    <Button
                        variant="solid"
                        onClick={() => {
                            setForm(emptyForm)
                            setFormError(null)
                            setCreateOpen(true)
                        }}
                    >
                        Add forecast
                    </Button>
                }
            />

            <Alert showIcon type="info" className="mb-4" title="Planning stub">
                Forecasts are stored for planning reference only. Warehouse
                release and trip planning still use READY shipments.
            </Alert>

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {error}
                </Alert>
            ) : null}

            <AdaptiveCard className="mb-4">
                <Input
                    className="md:max-w-xs"
                    placeholder="Search material, location, notes…"
                    value={params.search ?? ''}
                    onChange={(e) =>
                        setParams((current) => ({
                            ...current,
                            page: 1,
                            search: e.target.value,
                        }))
                    }
                />
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    pagingData={{
                        total,
                        pageIndex: page,
                        pageSize,
                    }}
                    onPaginationChange={(nextPage) =>
                        setParams((current) => ({ ...current, page: nextPage }))
                    }
                    onSelectChange={(nextSize) =>
                        setParams((current) => ({
                            ...current,
                            page: 1,
                            pageSize: nextSize,
                        }))
                    }
                />
            </AdaptiveCard>

            <Dialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                onRequestClose={() => setCreateOpen(false)}
                width={520}
            >
                <h5 className="mb-4">Add forecast</h5>
                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}
                <Form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void onCreate()
                    }}
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormItem label="Material code">
                            <Input
                                value={form.productCode}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        productCode: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Location code">
                            <Input
                                value={form.locationCode}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        locationCode: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Period start">
                            <Input
                                type="date"
                                value={form.periodStart}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        periodStart: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Period end">
                            <Input
                                type="date"
                                value={form.periodEnd}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        periodEnd: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Predicted qty">
                            <Input
                                value={form.quantity}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        quantity: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Unit">
                            <Input
                                value={form.unit}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        unit: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                    </div>
                    <FormItem label="Notes">
                        <Input
                            textArea
                            value={form.source}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    source: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            type="button"
                            onClick={() => setCreateOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button variant="solid" type="submit" loading={saving}>
                            Create
                        </Button>
                    </div>
                </Form>
            </Dialog>
        </PageContainer>
    )
}
