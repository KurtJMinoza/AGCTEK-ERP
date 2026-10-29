'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import BarcodeResponsiveTable, { type ColumnDef } from '../components/BarcodeResponsiveTable'
import {
    BC_RFID_STATUS,
    BcAnimatedStatus,
    BcDateCell,
    BcMaterialCell,
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

const ROUTE = '/modules/mm/barcode-rfid/rfid-tags'

type RfidRow = {
    id?: string
    tagValue: string
    status?: string
    entityType?: string
    lastReadAt?: string | null
    material?: { materialCode?: string; materialName?: string }
    lastKnownWarehouse?: { code?: string; name?: string }
}

const RfidTagsPage = () => {
    const parentBreadcrumbs = barcodeParentBreadcrumbs(ROUTE)
    const [companyId, setCompanyId] = useState('')
    const [rows, setRows] = useState<RfidRow[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [assignOpen, setAssignOpen] = useState(false)
    const [form, setForm] = useState({
        companyId: '',
        tagValue: '',
        entityType: 'MATERIAL',
        entityId: '',
        materialId: '',
        serialNumberId: '',
    })

    const load = useCallback(async () => {
        if (!companyId.trim()) return
        setLoading(true)
        try {
            const res = await supportingOpsService.listRfid({
                companyId: companyId.trim(),
                pageSize: 50,
            })
            setRows(res.data)
            setTotal(res.total)
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<RfidRow>[] = useMemo(
        () => [
            {
                header: 'EPC / Tag',
                cell: ({ row }) => (
                    <BcScanIdCell
                        icon="rfid"
                        primary={row.original.tagValue}
                        secondary={row.original.entityType}
                    />
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) =>
                    row.original.status ? (
                        <BcAnimatedStatus
                            status={row.original.status}
                            tone={bcStatusTone(row.original.status, BC_RFID_STATUS)}
                        />
                    ) : (
                        <BcPlainCell muted>—</BcPlainCell>
                    ),
            },
            {
                header: 'Material',
                cell: ({ row }) => (
                    <BcMaterialCell
                        code={row.original.material?.materialCode}
                        name={row.original.material?.materialName}
                    />
                ),
            },
            {
                header: 'Last read',
                cell: ({ row }) => <BcDateCell iso={row.original.lastReadAt} />,
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <BcPlainCell mono>
                        {row.original.lastKnownWarehouse?.code ??
                            row.original.lastKnownWarehouse?.name ??
                            '—'}
                    </BcPlainCell>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="RFID Tags"
                description="Tag registry — reads validate context and do not post inventory by themselves."
                breadcrumbs={parentBreadcrumbs}
                actions={
                    <Button
                        variant="solid"
                        onClick={() => {
                            setForm((f) => ({ ...f, companyId: companyId.trim() }))
                            setAssignOpen(true)
                        }}
                    >
                        Assign tag
                    </Button>
                }
            />
            <AdaptiveCard>
                <Input
                    className="mb-4 max-w-md"
                    placeholder="Company ID (required)"
                    value={companyId}
                    onChange={(e: any) => setCompanyId(e.target.value)}
                />
                <BarcodeResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row, index) => row.id ?? `${row.tagValue}-${index}`}
                    pagingData={{ total, pageIndex: 1, pageSize: 50 }}
                    hidePagination={total <= 50}
                    tableMinWidthClass="min-w-[920px]"
                />
            </AdaptiveCard>
            <FormDialog
                isOpen={assignOpen}
                onClose={() => setAssignOpen(false)}
                title="Assign RFID tag"
                footer={
                    <>
                        <Button size="sm" onClick={() => setAssignOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            onClick={async () => {
                                await supportingOpsService.assignRfid(form)
                                setAssignOpen(false)
                                load()
                            }}
                        >
                            Save
                        </Button>
                    </>
                }
            >
                <FormItem label="Company ID">
                    <Input
                        value={form.companyId}
                        onChange={(e: any) => setForm((f) => ({ ...f, companyId: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Tag value (EPC)">
                    <Input
                        value={form.tagValue}
                        onChange={(e: any) => setForm((f) => ({ ...f, tagValue: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Material ID">
                    <Input
                        value={form.materialId}
                        onChange={(e: any) => setForm((f) => ({ ...f, materialId: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Serial number ID (serialized items)">
                    <Input
                        value={form.serialNumberId}
                        onChange={(e: any) =>
                            setForm((f) => ({ ...f, serialNumberId: e.target.value }))
                        }
                    />
                </FormItem>
            </FormDialog>
        </PageContainer>
    )
}

export default RfidTagsPage
