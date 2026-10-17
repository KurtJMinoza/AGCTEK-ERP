'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import { useConsignments } from '../hooks/useConsignments'
import ConsignmentDetailDialog from '../components/couriers/ConsignmentDetailDialog'
import { apiGetCarriers } from '../services/scmApi'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import { formatStatusLabel, statusTone } from '../utils/status'
import type { CourierConsignment } from '../types'

type Option = { value: string; label: string }

const statusOptions: Option[] = [
    { value: '', label: 'All statuses' },
    ...[
        'BOOKED',
        'PICKED_UP',
        'IN_TRANSIT',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'EXCEPTION',
        'RETURNED',
        'CANCELLED',
    ].map((value) => ({ value, label: formatStatusLabel(value) })),
]

const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString() : '—'

export default function ConsignmentsPage() {
    const { data, total, page, pageSize, loading, error, params, setParams, reload } =
        useConsignments()
    const { canUpdate } = useResourceAccess('scm.consignments')
    const [openId, setOpenId] = useState<string | null>(null)
    const [carrierOptions, setCarrierOptions] = useState<Option[]>([
        { value: '', label: 'All couriers' },
    ])

    useEffect(() => {
        apiGetCarriers({ pageSize: 100 })
            .then((res) =>
                setCarrierOptions([
                    { value: '', label: 'All couriers' },
                    ...res.data.map((c) => ({ value: c.id, label: c.name })),
                ]),
            )
            .catch(() => undefined)
    }, [])

    const columns = useMemo<ColumnDef<CourierConsignment>[]>(
        () => [
            {
                header: 'Tracking no.',
                cell: ({ row }) =>
                    row.original.trackingUrl ? (
                        <a
                            href={row.original.trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-primary underline"
                        >
                            {row.original.trackingNumber}
                        </a>
                    ) : (
                        <span className="font-medium">
                            {row.original.trackingNumber ?? '—'}
                        </span>
                    ),
            },
            {
                header: 'Courier',
                cell: ({ row }) => row.original.carrier.name,
            },
            {
                header: 'Shipment',
                cell: ({ row }) => (
                    <div>
                        <p>{row.original.shipment?.reference ?? '—'}</p>
                        <p className="text-xs text-gray-500">
                            {row.original.shipment?.customerName ?? ''}
                        </p>
                    </div>
                ),
            },
            {
                header: 'Ship-to',
                cell: ({ row }) => (
                    <span className="line-clamp-2 text-sm">
                        {row.original.shipment?.destAddress ?? '—'}
                    </span>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={statusTone(row.original.status)}>
                        {formatStatusLabel(row.original.status)}
                    </StatusBadge>
                ),
            },
            {
                header: 'Booked',
                cell: ({ row }) => formatDate(row.original.bookedAt),
            },
            {
                header: 'Delivered',
                cell: ({ row }) => formatDate(row.original.deliveredAt),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <Button size="xs" onClick={() => setOpenId(row.original.id)}>
                            {canUpdate ? 'Open' : 'View'}
                        </Button>
                    </div>
                ),
            },
        ],
        [canUpdate],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Consignments"
                description="Shipments handed to third-party couriers. Update the courier status here — Picked Up issues the stock, Delivered completes the sales order."
                breadcrumbs={scmPageBreadcrumbs('Consignments')}
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {error}
                </Alert>
            ) : null}

            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                        className="md:max-w-xs"
                        placeholder="Search tracking no., shipment, customer…"
                        value={params.search ?? ''}
                        onChange={(e) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                search: e.target.value,
                            }))
                        }
                    />
                    <Select
                        className="md:w-56"
                        options={statusOptions}
                        value={
                            statusOptions.find(
                                (option) => option.value === (params.status ?? ''),
                            ) ?? statusOptions[0]
                        }
                        onChange={(option) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                status: (option as Option | null)?.value || undefined,
                            }))
                        }
                    />
                    <Select
                        className="md:w-56"
                        options={carrierOptions}
                        value={
                            carrierOptions.find(
                                (option) => option.value === (params.carrierId ?? ''),
                            ) ?? carrierOptions[0]
                        }
                        onChange={(option) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                carrierId: (option as Option | null)?.value || undefined,
                            }))
                        }
                    />
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    noData={!loading && data.length === 0}
                    pagingData={{ total, pageIndex: page, pageSize }}
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
                {!loading && data.length === 0 && !error ? (
                    <p className="px-4 pb-4 text-center text-sm text-gray-500">
                        No consignments yet. Book one from Shipments with
                        &ldquo;Ship with courier&rdquo;.
                    </p>
                ) : null}
            </AdaptiveCard>

            <ConsignmentDetailDialog
                consignmentId={openId}
                canUpdate={canUpdate}
                onClose={() => setOpenId(null)}
                onChanged={() => void reload()}
            />
        </PageContainer>
    )
}
