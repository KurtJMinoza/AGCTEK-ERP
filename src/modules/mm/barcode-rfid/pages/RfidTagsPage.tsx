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

const ROUTE = '/modules/mm/barcode-rfid/rfid-tags'

const RfidTagsPage = () => {
    const [companyId, setCompanyId] = useState('')
    const [rows, setRows] = useState<any[]>([])
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

    const columns: ColumnDef<any>[] = [
        { header: 'EPC / Tag', accessorKey: 'tagValue' },
        { header: 'Status', accessorKey: 'status' },
        { header: 'Entity', accessorKey: 'entityType' },
        { header: 'Material', accessorKey: 'material.materialCode' },
        { header: 'Last read', accessorKey: 'lastReadAt', cell: ({ row }) =>
            row.original.lastReadAt ? new Date(row.original.lastReadAt).toLocaleString() : '—' },
        { header: 'Warehouse', accessorKey: 'lastKnownWarehouse.code' },
    ]

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="RFID Tags"
                description="Tag registry — reads validate context and do not post inventory by themselves."
                actions={
                    <Button variant="solid" onClick={() => {
                        setForm((f) => ({ ...f, companyId: companyId.trim() }))
                        setAssignOpen(true)
                    }}>
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
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    pagingData={{ total, pageIndex: 1, pageSize: 50 }}
                    hidePagination={total <= 50}
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
