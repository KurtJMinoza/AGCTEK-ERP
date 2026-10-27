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

const ROUTE = '/modules/mm/barcode-rfid/barcode-registry'

const BarcodeRegistryPage = () => {
    const [rows, setRows] = useState<any[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [createOpen, setCreateOpen] = useState(false)
    const [form, setForm] = useState({
        materialId: '',
        barcodeType: 'EAN13',
        barcodeValue: '',
        isPrimary: false,
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await supportingOpsService.listBarcodes({
                search: search || undefined,
                pageSize: 50,
            })
            setRows(res.data)
            setTotal(res.total)
        } finally {
            setLoading(false)
        }
    }, [search])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<any>[] = [
        { header: 'Value', accessorKey: 'barcodeValue' },
        { header: 'Type', accessorKey: 'barcodeType' },
        { header: 'Material', accessorKey: 'material.materialCode' },
        { header: 'Entity', accessorKey: 'entityType' },
        { header: 'Status', accessorKey: 'status' },
        { header: 'Primary', accessorKey: 'isPrimary', cell: ({ row }) => (row.original.isPrimary ? 'Yes' : '') },
    ]

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Barcode Registry"
                description="Central registry — archived barcodes cannot be used for new movements."
                actions={
                    <Button variant="solid" onClick={() => setCreateOpen(true)}>
                        Register barcode
                    </Button>
                }
            />
            <AdaptiveCard>
                <Input
                    className="mb-4 max-w-sm"
                    placeholder="Search barcode or material…"
                    value={search}
                    onChange={(e: any) => setSearch(e.target.value)}
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
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Register barcode"
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            onClick={async () => {
                                await supportingOpsService.createBarcode(form)
                                setCreateOpen(false)
                                load()
                            }}
                        >
                            Save
                        </Button>
                    </>
                }
            >
                <FormItem label="Material ID">
                    <Input
                        value={form.materialId}
                        onChange={(e: any) =>
                            setForm((p) => ({ ...p, materialId: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Barcode type" className="mt-2">
                    <Input
                        value={form.barcodeType}
                        onChange={(e: any) =>
                            setForm((p) => ({ ...p, barcodeType: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Barcode value" className="mt-2">
                    <Input
                        value={form.barcodeValue}
                        onChange={(e: any) =>
                            setForm((p) => ({ ...p, barcodeValue: e.target.value }))
                        }
                    />
                </FormItem>
            </FormDialog>
        </PageContainer>
    )
}

export default BarcodeRegistryPage
