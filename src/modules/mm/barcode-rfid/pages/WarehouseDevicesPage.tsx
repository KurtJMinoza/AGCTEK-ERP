'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import BarcodeResponsiveTable, { type ColumnDef } from '../components/BarcodeResponsiveTable'
import {
    BC_DEVICE_STATUS,
    BcAnimatedStatus,
    BcDateCell,
    BcMethodTag,
    BcPlainCell,
    BcScanIdCell,
    bcStatusTone,
} from '../components/barcodeTableUi'
import { barcodeParentBreadcrumbs } from '../utils/barcodePageUi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FormDialog from '@/components/shared/FormDialog'
import { FormItem } from '@/components/ui/Form'
import { supportingOpsService } from '../../supporting-ops/services/supportingOpsService'

const ROUTE = '/modules/mm/barcode-rfid/warehouse-devices'

type DeviceRow = {
    id?: string
    deviceCode: string
    deviceName?: string
    deviceType?: string
    status?: string
    revokedAt?: string | null
    lastActiveAt?: string | null
    warehouse?: { code?: string; name?: string }
}

const WarehouseDevicesPage = () => {
    const parentBreadcrumbs = barcodeParentBreadcrumbs(ROUTE)
    const [companyId, setCompanyId] = useState('')
    const [rows, setRows] = useState<DeviceRow[]>([])
    const [loading, setLoading] = useState(false)
    const [registerOpen, setRegisterOpen] = useState(false)
    const [form, setForm] = useState({
        deviceCode: '',
        deviceName: '',
        deviceType: 'HANDHELD_SCANNER',
        companyId: '',
        warehouseId: '',
        userId: '',
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await supportingOpsService.listDevices({
                companyId: companyId.trim() || undefined,
            })
            setRows(Array.isArray(res) ? res : [])
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<DeviceRow>[] = useMemo(
        () => [
            {
                header: 'Device',
                cell: ({ row }) => (
                    <BcScanIdCell
                        icon="device"
                        primary={row.original.deviceCode}
                        secondary={row.original.deviceName}
                    />
                ),
            },
            {
                header: 'Type',
                cell: ({ row }) => (
                    <BcMethodTag label={row.original.deviceType} />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <BcPlainCell mono>
                        {row.original.warehouse?.code ??
                            row.original.warehouse?.name ??
                            '—'}
                    </BcPlainCell>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => {
                    const status = row.original.revokedAt
                        ? 'REVOKED'
                        : row.original.status ?? 'ACTIVE'
                    return (
                        <BcAnimatedStatus
                            status={status}
                            tone={bcStatusTone(status, BC_DEVICE_STATUS)}
                        />
                    )
                },
            },
            {
                header: 'Last active',
                cell: ({ row }) => <BcDateCell iso={row.original.lastActiveAt} />,
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) =>
                    !row.original.revokedAt ? (
                        <Button
                            size="xs"
                            onClick={async () => {
                                await supportingOpsService.revokeDevice(row.original.deviceCode)
                                load()
                            }}
                        >
                            Revoke
                        </Button>
                    ) : (
                        <BcPlainCell muted>Revoked</BcPlainCell>
                    ),
            },
        ],
        [load],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Warehouse Devices"
                description="Registered scanners and mobile devices. Revoked devices cannot open scan sessions."
                breadcrumbs={parentBreadcrumbs}
                actions={
                    <Button
                        variant="solid"
                        onClick={() => {
                            setForm((f) => ({ ...f, companyId: companyId.trim() }))
                            setRegisterOpen(true)
                        }}
                    >
                        Register device
                    </Button>
                }
            />
            <AdaptiveCard>
                <Input
                    className="mb-4 max-w-md"
                    placeholder="Filter by company ID (optional)"
                    value={companyId}
                    onChange={(e: any) => setCompanyId(e.target.value)}
                />
                <BarcodeResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id ?? row.deviceCode}
                    hidePagination
                    tableMinWidthClass="min-w-[960px]"
                />
            </AdaptiveCard>
            <FormDialog
                isOpen={registerOpen}
                onClose={() => setRegisterOpen(false)}
                title="Register warehouse device"
                footer={
                    <>
                        <Button size="sm" onClick={() => setRegisterOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            onClick={async () => {
                                await supportingOpsService.registerDevice(form)
                                setRegisterOpen(false)
                                load()
                            }}
                        >
                            Register
                        </Button>
                    </>
                }
            >
                <FormItem label="Device code">
                    <Input
                        value={form.deviceCode}
                        onChange={(e: any) => setForm((f) => ({ ...f, deviceCode: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Device name">
                    <Input
                        value={form.deviceName}
                        onChange={(e: any) => setForm((f) => ({ ...f, deviceName: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Company ID">
                    <Input
                        value={form.companyId}
                        onChange={(e: any) => setForm((f) => ({ ...f, companyId: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Warehouse ID">
                    <Input
                        value={form.warehouseId}
                        onChange={(e: any) => setForm((f) => ({ ...f, warehouseId: e.target.value }))}
                    />
                </FormItem>
            </FormDialog>
        </PageContainer>
    )
}

export default WarehouseDevicesPage
