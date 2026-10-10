'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import { useShipments } from '../hooks/useShipments'
import DamageReportDialog from '../components/shipments/DamageReportDialog'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import {
    formatMovementLabel,
    formatStatusLabel,
    statusTone,
} from '../utils/status'
import type { Shipment } from '../types'

type Option = { value: string; label: string }

const statusOptions: Option[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'READY', label: 'Ready' },
    { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'IN_TRANSIT', label: 'In Transit' },
    { value: 'DELIVERED', label: 'Delivered' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

const movementFilterOptions: Option[] = [
    { value: '', label: 'All movements' },
    { value: 'DELIVERY', label: 'Shipping' },
    { value: 'PICKUP', label: 'Pickup' },
]

export default function ShipmentsPage() {
    const { data, total, page, pageSize, loading, error, params, setParams } =
        useShipments()
    const { canCreate } = useResourceAccess('scm.shipments')
    const [reportFor, setReportFor] = useState<Shipment | null>(null)

    const columns = useMemo<ColumnDef<Shipment>[]>(
        () => [
            {
                header: 'Reference',
                accessorKey: 'reference',
            },
            {
                header: 'Customer',
                cell: ({ row }) => row.original.customerName || '—',
            },
            {
                header: 'Type',
                cell: ({ row }) => (
                    <StatusBadge
                        tone={
                            row.original.movementType === 'PICKUP'
                                ? 'warning'
                                : 'info'
                        }
                    >
                        {formatMovementLabel(row.original.movementType)}
                    </StatusBadge>
                ),
            },
            {
                header: 'Ship-to / return',
                accessorKey: 'destAddress',
            },
            {
                header: 'Material',
                cell: ({ row }) => row.original.materialCode || '—',
            },
            {
                header: 'Ext. order / pkg',
                cell: ({ row }) =>
                    row.original.externalOrderId ||
                    (row.original.packageId
                        ? row.original.packageId.slice(0, 8)
                        : '—'),
            },
            {
                header: 'Quantity',
                cell: ({ row }) =>
                    (row.original.quantity ?? 0).toLocaleString(),
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
                header: 'Updated',
                cell: ({ row }) =>
                    new Date(row.original.updatedAt).toLocaleString(),
            },
            {
                id: 'damage',
                header: '',
                cell: ({ row }) =>
                    canCreate &&
                    (row.original.status === 'DELIVERED' ||
                        row.original.status === 'EXCEPTION_HOLD') ? (
                        <Button
                            size="xs"
                            onClick={() => setReportFor(row.original)}
                        >
                            Report damage
                        </Button>
                    ) : null,
            },
        ],
        [canCreate],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Shipments"
                description="Shipments released from MM packing. READY shipment lines are put on vehicles in Load Building."
                breadcrumbs={scmPageBreadcrumbs('Shipments')}
            />

            {error ? (
                <Alert
                    showIcon
                    type="danger"
                    className="mb-4"
                    title="API error"
                >
                    {error}
                </Alert>
            ) : null}

            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                        className="md:max-w-xs"
                        placeholder="Search reference, customer, address…"
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
                                (option) =>
                                    option.value === (params.status ?? 'READY'),
                            ) ?? statusOptions[1]
                        }
                        onChange={(option) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                status:
                                    (option as Option | null)?.value ||
                                    undefined,
                            }))
                        }
                    />
                    <Select
                        className="md:w-48"
                        options={movementFilterOptions}
                        value={
                            movementFilterOptions.find(
                                (option) =>
                                    option.value ===
                                    (params.movementType ?? ''),
                            ) ?? movementFilterOptions[0]
                        }
                        onChange={(option) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                movementType:
                                    (option as Option | null)?.value ||
                                    undefined,
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

            <DamageReportDialog
                shipment={reportFor}
                canCreate={canCreate}
                onClose={() => setReportFor(null)}
            />
        </PageContainer>
    )
}
