'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import BarcodeResponsiveTable, { type ColumnDef } from '../components/BarcodeResponsiveTable'
import {
    BC_REGISTRY_STATUS,
    BcAnimatedStatus,
    BcMaterialCell,
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

const ROUTE = '/modules/mm/barcode-rfid/barcode-registry'

type BarcodeRow = {
    id?: string
    barcodeValue: string
    barcodeType: string
    entityType?: string
    status?: string
    isPrimary?: boolean
    material?: { materialCode?: string; materialName?: string }
}

const BarcodeRegistryPage = () => {
    const parentBreadcrumbs = barcodeParentBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<BarcodeRow[]>([])
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

    const columns: ColumnDef<BarcodeRow>[] = useMemo(
        () => [
            {
                header: 'Barcode',
                cell: ({ row }) => (
                    <BcScanIdCell
                        primary={row.original.barcodeValue}
                        secondary={row.original.barcodeType}
                        icon="barcode"
                    />
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
                header: 'Entity',
                cell: ({ row }) => (
                    <BcMethodTag label={row.original.entityType} />
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) =>
                    row.original.status ? (
                        <BcAnimatedStatus
                            status={row.original.status}
                            tone={bcStatusTone(row.original.status, BC_REGISTRY_STATUS)}
                        />
                    ) : (
                        <BcPlainCell muted>—</BcPlainCell>
                    ),
            },
            {
                header: 'Primary',
                cell: ({ row }) => (
                    <BcPlainCell>{row.original.isPrimary ? 'Yes' : ''}</BcPlainCell>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Barcode Registry"
                description="Central registry — archived barcodes cannot be used for new movements."
                breadcrumbs={parentBreadcrumbs}
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
                <BarcodeResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row, index) =>
                        row.id ?? `${row.barcodeValue}-${index}`
                    }
                    pagingData={{ total, pageIndex: 1, pageSize: 50 }}
                    hidePagination={total <= 50}
                    tableMinWidthClass="min-w-[880px]"
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
