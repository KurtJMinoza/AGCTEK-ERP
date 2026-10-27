'use client'

import { useCallback, useEffect, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FormDialog from '@/components/shared/FormDialog'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { supportingOpsService } from '../../supporting-ops/services/supportingOpsService'

const ROUTE = '/modules/mm/barcode-rfid/warehouse-devices'

const WarehouseDevicesPage = () => {
    const [companyId, setCompanyId] = useState('')
    const [rows, setRows] = useState<any[]>([])
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

    const columns: ColumnDef<any>[] = [
        { header: 'Code', accessorKey: 'deviceCode' },
        { header: 'Name', accessorKey: 'deviceName' },
        { header: 'Type', accessorKey: 'deviceType' },
        { header: 'Warehouse', accessorKey: 'warehouse.code' },
        { header: 'Status', accessorKey: 'status' },
        {
            header: 'Last active',
            accessorKey: 'lastActiveAt',
            cell: ({ row }) =>
                row.original.lastActiveAt
                    ? new Date(row.original.lastActiveAt).toLocaleString()
                    : '—',
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
                    'Revoked'
                ),
        },
    ]

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Warehouse Devices"
                description="Registered scanners and mobile devices. Revoked devices cannot open scan sessions."
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
                <DataTable columns={columns} data={rows} loading={loading} hidePagination />
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
