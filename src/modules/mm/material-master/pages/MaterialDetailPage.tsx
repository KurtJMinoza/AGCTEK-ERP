'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Spinner from '@/components/ui/Spinner'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineCube,
    HiOutlineTag,
    HiOutlineScale,
    HiOutlineShieldCheck,
    HiOutlineTemplate,
    HiOutlineCurrencyDollar,
    HiOutlineClipboardList,
    HiOutlineDocumentText,
    HiOutlineClock,
    HiOutlinePencil,
    HiOutlineCheckCircle,
    HiOutlineBan,
    HiOutlineQrcode,
    HiOutlineCollection,
    HiOutlineKey,
    HiOutlinePlus,
    HiOutlineTrash,
} from 'react-icons/hi'
import { useMaterial } from '../hooks/useMaterial'
import { materialService } from '../services/materialService'
import { barcodeService, batchService, orgService, serialNumberService } from '../services/referenceService'
import { supplierMaterialService } from '@/modules/mm/supplier-management/services/supplierMaterialService'
import { storageBinService } from '@/modules/mm/warehouse/services/storageBinService'
import { useSupplierOptions } from '@/modules/mm/shared/useEntityOptions'
import MaterialFormDialog from '../components/MaterialFormDialog'
import type { Material, MmBarcode, MmBatch, MmSerialNumber, MmMaterialAudit, CreateMaterialPayload } from '../types'
import type { SupplierMaterial } from '@/modules/mm/supplier-management/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    ACTIVE: 'success', DRAFT: 'default', INACTIVE: 'warning', BLOCKED: 'danger',
}

const BATCH_STATUS_OPTS = [
    { value: 'AVAILABLE', label: 'Available' },
    { value: 'QUARANTINE', label: 'Quarantine' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'CLOSED', label: 'Closed' },
]

const SERIAL_STATUS_OPTS = [
    { value: 'AVAILABLE', label: 'Available' },
    { value: 'ISSUED', label: 'Issued' },
    { value: 'RESERVED', label: 'Reserved' },
    { value: 'SCRAPPED', label: 'Scrapped' },
]

type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

function asList<T = any>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[]
    if (res && typeof res === 'object' && Array.isArray((res as any).data)) return (res as any).data
    return []
}

function fmtQty(v: unknown) {
    const n = Number(v ?? 0)
    return Number.isFinite(n) ? n.toLocaleString() : '—'
}

const MaterialDetailPage = () => {
    const params = useParams()
    const router = useRouter()
    const id = params?.id as string
    const { data: material, loading, refresh } = useMaterial(id)
    const breadcrumbItems = useMemo(
        () =>
            buildErpBreadcrumbs(`/modules/mm/material-master/materials-skus/${id}`, {
                detailLabel: material?.materialCode,
            }),
        [id, material?.materialCode],
    )

    const [tab, setTab] = useState('overview')
    const [editOpen, setEditOpen] = useState(false)
    const [confirmAction, setConfirmAction] = useState<'activate' | 'deactivate' | null>(null)

    const handleEditSubmit = useCallback(async (values: CreateMaterialPayload) => {
        try {
            await materialService.update(id, values)
            pushToast('success', 'Saved', 'Material updated successfully.')
            setEditOpen(false)
            refresh()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Update failed')
        }
    }, [id, refresh])

    const handleStatusChange = useCallback(async () => {
        if (!confirmAction) return
        try {
            if (confirmAction === 'activate') await materialService.activate(id)
            else await materialService.deactivate(id)
            pushToast('success', confirmAction === 'activate' ? 'Activated' : 'Deactivated', `Material ${confirmAction}d.`)
            setConfirmAction(null)
            refresh()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Status change failed')
        }
    }, [confirmAction, id, refresh])

    if (loading) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-64 items-center justify-center"><Spinner size={40} /></div>
            </PageContainer>
        )
    }

    if (!material) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-64 flex-col items-center justify-center gap-3">
                    <p className="text-lg font-semibold heading-text">Material not found</p>
                    <Button size="sm" onClick={() => router.push('/modules/mm/material-master/materials-skus')}>View materials</Button>
                </div>
            </PageContainer>
        )
    }

    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: material.currency?.code || 'USD', maximumFractionDigits: 2 })

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />

            <PageHeader
                title={material.materialName}
                description={`${material.materialCode}${material.sku ? ` · SKU: ${material.sku}` : ''}${material.brand ? ` · ${material.brand}` : ''}${material.model ? ` ${material.model}` : ''}`}
                actions={
                    <>
                        {material.status !== 'ACTIVE' && (
                            <Button size="sm" variant="plain" icon={<HiOutlineCheckCircle />} onClick={() => setConfirmAction('activate')}>Activate</Button>
                        )}
                        {material.status === 'ACTIVE' && (
                            <Button size="sm" variant="plain" icon={<HiOutlineBan />} onClick={() => setConfirmAction('deactivate')}>Deactivate</Button>
                        )}
                        <Button size="sm" variant="solid" icon={<HiOutlinePencil />} onClick={() => setEditOpen(true)}>Edit</Button>
                    </>
                }
            />

            <div className="mb-4 flex items-center gap-2">
                <StatusBadge tone={STATUS_TONE[material.status] ?? 'default'}>{material.status}</StatusBadge>
                {material.materialType && <Tag>{material.materialType.name}</Tag>}
                {material.materialCategory && <Tag>{material.materialCategory.name}</Tag>}
            </div>

            <AdaptiveCard>
                <Tabs value={tab} onChange={(v) => setTab(v)}>
                    <Tabs.TabList className="!overflow-x-auto">
                        <Tabs.TabNav value="overview" icon={<HiOutlineTemplate />}>Overview</Tabs.TabNav>
                        <Tabs.TabNav value="inventory" icon={<HiOutlineTag />}>Inventory</Tabs.TabNav>
                        <Tabs.TabNav value="suppliers" icon={<HiOutlineClipboardList />}>Suppliers</Tabs.TabNav>
                        <Tabs.TabNav value="purchasing" icon={<HiOutlineCurrencyDollar />}>Purchasing</Tabs.TabNav>
                        <Tabs.TabNav value="planning" icon={<HiOutlineScale />}>Planning</Tabs.TabNav>
                        <Tabs.TabNav value="valuation" icon={<HiOutlineCurrencyDollar />}>Valuation</Tabs.TabNav>
                        <Tabs.TabNav value="barcodes" icon={<HiOutlineQrcode />}>Barcodes</Tabs.TabNav>
                        <Tabs.TabNav value="batches" icon={<HiOutlineCollection />}>Batches</Tabs.TabNav>
                        <Tabs.TabNav value="serials" icon={<HiOutlineKey />}>Serials</Tabs.TabNav>
                        <Tabs.TabNav value="transactions" icon={<HiOutlineDocumentText />}>Transactions</Tabs.TabNav>
                        <Tabs.TabNav value="documents" icon={<HiOutlineDocumentText />}>Documents</Tabs.TabNav>
                        <Tabs.TabNav value="audit" icon={<HiOutlineClock />}>Audit Trail</Tabs.TabNav>
                    </Tabs.TabList>

                    <div className="p-5">
                        <TabPanel active={tab === 'overview'}><OverviewTab material={material} /></TabPanel>
                        <TabPanel active={tab === 'inventory'}><InventoryTab material={material} /></TabPanel>
                        <TabPanel active={tab === 'suppliers'}><SuppliersTab materialId={material.id} /></TabPanel>
                        <TabPanel active={tab === 'purchasing'}><PurchasingTab material={material} /></TabPanel>
                        <TabPanel active={tab === 'planning'}><PlanningTab material={material} /></TabPanel>
                        <TabPanel active={tab === 'valuation'}><ValuationTab material={material} fmt={fmt} /></TabPanel>
                        <TabPanel active={tab === 'barcodes'}><BarcodesTab material={material} onRefresh={refresh} /></TabPanel>
                        <TabPanel active={tab === 'batches'}><BatchesTab material={material} onRefresh={refresh} /></TabPanel>
                        <TabPanel active={tab === 'serials'}><SerialsTab material={material} onRefresh={refresh} /></TabPanel>
                        <TabPanel active={tab === 'transactions'}><TransactionsTab materialId={material.id} /></TabPanel>
                        <TabPanel active={tab === 'documents'}><DocumentsTab materialId={material.id} /></TabPanel>
                        <TabPanel active={tab === 'audit'}><AuditTab audits={material.audits ?? []} /></TabPanel>
                    </div>
                </Tabs>
            </AdaptiveCard>

            <MaterialFormDialog
                isOpen={editOpen}
                mode="edit"
                material={material}
                onClose={() => setEditOpen(false)}
                onSubmit={handleEditSubmit}
            />

            <ConfirmDialog
                isOpen={Boolean(confirmAction)}
                type={confirmAction === 'activate' ? 'success' : 'warning'}
                title={confirmAction === 'activate' ? 'Activate material?' : 'Deactivate material?'}
                confirmText={confirmAction === 'activate' ? 'Activate' : 'Deactivate'}
                onRequestClose={() => setConfirmAction(null)}
                onCancel={() => setConfirmAction(null)}
                onConfirm={handleStatusChange}
            >
                <p>
                    {confirmAction === 'activate'
                        ? 'This will make the material available for new transactions.'
                        : 'This will prevent the material from being used in new transactions.'}
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

const TabPanel = ({ active, children }: { active: boolean; children: React.ReactNode }) => (
    <div className={active ? 'block' : 'hidden'}>{children}</div>
)

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between border-b border-gray-100 py-2 dark:border-gray-700">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-sm font-medium heading-text">{value}</span>
    </div>
)

const FlagTag = ({ label, active }: { label: string; active: boolean }) => (
    <Tag className={active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}>
        {label}: {active ? 'Yes' : 'No'}
    </Tag>
)

const OverviewTab = ({ material }: { material: Material }) => (
    <div className="grid gap-6 md:grid-cols-2">
        <div>
            <h6 className="mb-3 text-sm font-semibold heading-text">Identity</h6>
            <InfoRow label="Code" value={material.materialCode} />
            <InfoRow label="Name" value={material.materialName} />
            <InfoRow label="SKU" value={material.sku ?? '—'} />
            <InfoRow label="Brand" value={material.brand ?? '—'} />
            <InfoRow label="Model" value={material.model ?? '—'} />
            <InfoRow label="Manufacturer" value={material.manufacturer ?? '—'} />
        </div>
        <div>
            <h6 className="mb-3 text-sm font-semibold heading-text">Classification</h6>
            <InfoRow label="Type" value={material.materialType?.name ?? '—'} />
            <InfoRow label="Category" value={material.materialCategory?.name ?? '—'} />
            <InfoRow label="Status" value={<StatusBadge tone={STATUS_TONE[material.status] ?? 'default'}>{material.status}</StatusBadge>} />
            <h6 className="mb-3 mt-6 text-sm font-semibold heading-text">Physical</h6>
            <InfoRow label="Weight" value={material.weight ? `${material.weight} ${material.weightUom ?? ''}` : '—'} />
            <InfoRow label="Dimensions" value={material.length ? `${material.length}×${material.width}×${material.height} ${material.dimensionUom ?? ''}` : '—'} />
            <InfoRow label="Volume" value={material.volume ? `${material.volume} ${material.volumeUom ?? ''}` : '—'} />
            <InfoRow label="Base UOM" value={material.baseUom?.code ?? '—'} />
            <InfoRow label="Purchase UOM" value={material.purchaseUom?.code ?? '—'} />
            <InfoRow label="Sales UOM" value={material.salesUom?.code ?? '—'} />
        </div>
        {(material.description ?? material.shortDescription) && (
            <div className="md:col-span-2">
                <h6 className="mb-2 text-sm font-semibold heading-text">Description</h6>
                <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                    {material.description ?? material.shortDescription}
                </p>
            </div>
        )}
    </div>
)

const InventoryTab = ({ material }: { material: Material }) => {
    const [balances, setBalances] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        materialService.balances(material.id)
            .then((res) => { if (!cancelled) setBalances(asList(res)) })
            .catch(() => { if (!cancelled) setBalances([]) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [material.id])

    const cols: ColumnDef<any>[] = useMemo(() => [
        {
            header: 'Warehouse',
            id: 'warehouse',
            size: 180,
            cell: ({ row }) => {
                const w = row.original.warehouse
                if (!w) return '—'
                return w.name && w.code ? `${w.code} — ${w.name}` : (w.name ?? w.code ?? '—')
            },
        },
        {
            header: 'Bin',
            id: 'bin',
            size: 120,
            cell: ({ row }) => row.original.storageBin?.code ?? row.original.bin?.code ?? '—',
        },
        {
            header: 'Stock status',
            id: 'stockStatus',
            size: 140,
            cell: ({ row }) => <Tag>{row.original.stockStatus ?? '—'}</Tag>,
        },
        {
            header: 'On hand',
            id: 'onHand',
            size: 110,
            cell: ({ row }) => fmtQty(row.original.onHandQty ?? row.original.quantityOnHand ?? row.original.quantity),
        },
        {
            header: 'Reserved',
            id: 'reserved',
            size: 110,
            cell: ({ row }) => fmtQty(row.original.reservedQty ?? row.original.reservedQuantity),
        },
        {
            header: 'Available',
            id: 'available',
            size: 110,
            cell: ({ row }) => fmtQty(row.original.availableQty ?? row.original.availableQuantity),
        },
    ], [])

    return (
        <div>
            <h6 className="mb-3 text-sm font-semibold heading-text">Tracking flags</h6>
            <div className="mb-6 flex flex-wrap gap-2">
                <FlagTag label="Batch managed" active={material.batchManaged} />
                <FlagTag label="Serial managed" active={material.serialManaged} />
                <FlagTag label="QC required" active={material.qualityInspectionRequired} />
                <FlagTag label="Expiry" active={material.expiryManaged} />
                <FlagTag label="Inventory" active={material.inventoryManaged} />
                <FlagTag label="Purchasable" active={material.purchasable} />
                <FlagTag label="Sellable" active={material.sellable} />
            </div>
            <h6 className="mb-3 text-sm font-semibold heading-text">Stock thresholds</h6>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                <MetricCard label="Min stock" value={Number(material.minimumStock).toLocaleString()} />
                <MetricCard label="Max stock" value={Number(material.maximumStock).toLocaleString()} />
                <MetricCard label="Safety stock" value={Number(material.safetyStock).toLocaleString()} />
                <MetricCard label="Reorder point" value={Number(material.reorderPoint).toLocaleString()} />
            </div>
            <h6 className="mb-3 text-sm font-semibold heading-text">Live balances</h6>
            {loading ? (
                <div className="flex justify-center py-8"><Spinner size={28} /></div>
            ) : balances.length === 0 ? (
                <p className="text-sm text-gray-500">No inventory balances yet.</p>
            ) : (
                <DataTable columns={cols} data={balances} compact />
            )}
        </div>
    )
}

const SuppliersTab = ({ materialId }: { materialId: string }) => {
    const [rows, setRows] = useState<SupplierMaterial[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        supplierMaterialService.list({ materialId, pageSize: 100 })
            .then((res) => { if (!cancelled) setRows(asList<SupplierMaterial>(res)) })
            .catch(() => { if (!cancelled) setRows([]) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [materialId])

    const cols: ColumnDef<SupplierMaterial>[] = useMemo(() => [
        {
            header: 'Supplier',
            id: 'supplier',
            size: 260,
            cell: ({ row }) => {
                const s = row.original.supplier
                if (!s) return '—'
                return `${s.supplierCode} — ${s.supplierName}`
            },
        },
        {
            header: 'Unit price',
            id: 'unitPrice',
            size: 120,
            cell: ({ row }) => {
                const code = row.original.currency?.code
                const price = Number(row.original.unitPrice)
                if (!Number.isFinite(price)) return '—'
                return code ? `${code} ${price.toLocaleString()}` : price.toLocaleString()
            },
        },
        {
            header: 'Lead time',
            id: 'leadTime',
            size: 110,
            cell: ({ row }) => row.original.leadTimeDays != null ? `${row.original.leadTimeDays} days` : '—',
        },
        {
            header: 'MOQ',
            id: 'moq',
            size: 100,
            cell: ({ row }) => row.original.minimumOrderQuantity != null
                ? Number(row.original.minimumOrderQuantity).toLocaleString()
                : '—',
        },
    ], [])

    return (
        <div>
            <div className="mb-4 flex items-center justify-between gap-3">
                <h6 className="text-sm font-semibold heading-text">Supplier links</h6>
                <Link href="/modules/mm/supplier-management/supplier-materials">
                    <Button size="xs" variant="solid">Manage supplier materials</Button>
                </Link>
            </div>
            {loading ? (
                <div className="flex justify-center py-8"><Spinner size={28} /></div>
            ) : rows.length === 0 ? (
                <p className="text-sm text-gray-500">No supplier-material links for this material.</p>
            ) : (
                <DataTable<SupplierMaterial> columns={cols} data={rows} compact />
            )}
        </div>
    )
}

const PurchasingTab = ({ material }: { material: Material }) => (
    <div className="grid gap-6 md:grid-cols-2">
        <div>
            <InfoRow label="Purchase UOM" value={material.purchaseUom?.code ?? '—'} />
            <InfoRow label="Min order qty" value={Number(material.minimumOrderQuantity).toLocaleString()} />
            <InfoRow label="Lead time" value={`${material.leadTimeDays} days`} />
            <InfoRow label="Reorder qty" value={Number(material.reorderQuantity).toLocaleString()} />
            <InfoRow
                label="Preferred supplier"
                value={
                    material.preferredSupplier
                        ? `${material.preferredSupplier.supplierCode} — ${material.preferredSupplier.supplierName}`
                        : '—'
                }
            />
        </div>
    </div>
)

const PlanningTab = ({ material }: { material: Material }) => (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <MetricCard label="Reorder point" value={Number(material.reorderPoint).toLocaleString()} />
        <MetricCard label="Safety stock" value={Number(material.safetyStock).toLocaleString()} />
        <MetricCard label="Min stock" value={Number(material.minimumStock).toLocaleString()} />
        <MetricCard label="Max stock" value={Number(material.maximumStock).toLocaleString()} />
        <MetricCard label="Reorder qty" value={Number(material.reorderQuantity).toLocaleString()} />
        <MetricCard label="Lead time" value={`${material.leadTimeDays} days`} />
        <MetricCard label="Min order qty" value={Number(material.minimumOrderQuantity).toLocaleString()} />
    </div>
)

const ValuationTab = ({ material, fmt }: { material: Material; fmt: Intl.NumberFormat }) => (
    <div className="grid gap-6 md:grid-cols-2">
        <div>
            <InfoRow label="Valuation method" value={material.valuationMethod ?? '—'} />
            <InfoRow label="Standard cost" value={fmt.format(Number(material.standardCost))} />
            <InfoRow label="Currency" value={material.currency ? `${material.currency.code} — ${material.currency.name}` : '—'} />
            <InfoRow label="Valuation class" value={material.valuationClass?.name ?? '—'} />
            <InfoRow label="Company" value={material.company?.name ?? '—'} />
            <InfoRow label="Warehouse" value={material.defaultWarehouse?.name ?? '—'} />
        </div>
    </div>
)

const TransactionsTab = ({ materialId }: { materialId: string }) => {
    const [rows, setRows] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        materialService.transactions(materialId)
            .then((res) => { if (!cancelled) setRows(asList(res)) })
            .catch(() => { if (!cancelled) setRows([]) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [materialId])

    const cols: ColumnDef<any>[] = useMemo(() => [
        {
            header: 'Txn number',
            id: 'txnNumber',
            size: 160,
            cell: ({ row }) => row.original.transactionNumber ?? row.original.txnNumber ?? '—',
        },
        {
            header: 'Movement type',
            id: 'movementType',
            size: 140,
            cell: ({ row }) => <Tag>{row.original.movementType ?? '—'}</Tag>,
        },
        {
            header: 'Qty',
            id: 'qty',
            size: 100,
            cell: ({ row }) => fmtQty(row.original.quantity ?? row.original.qty),
        },
        {
            header: 'UOM',
            id: 'uom',
            size: 80,
            cell: ({ row }) => row.original.uom?.code ?? row.original.uomCode ?? '—',
        },
        {
            header: 'Warehouse',
            id: 'warehouse',
            size: 160,
            cell: ({ row }) => {
                const w = row.original.warehouse
                if (!w) return '—'
                return w.code ?? w.name ?? '—'
            },
        },
        {
            header: 'Posting date',
            id: 'postingDate',
            size: 140,
            cell: ({ row }) => row.original.postingDate
                ? new Date(row.original.postingDate).toLocaleDateString()
                : '—',
        },
        {
            header: 'Status',
            id: 'status',
            size: 120,
            cell: ({ row }) => {
                const status = row.original.status
                    ?? (row.original.reversalOfId ? 'REVERSED' : null)
                    ?? row.original.stockStatus
                    ?? 'POSTED'
                return <Tag>{status}</Tag>
            },
        },
    ], [])

    return (
        <div>
            <h6 className="mb-4 text-sm font-semibold heading-text">Inventory transactions</h6>
            {loading ? (
                <div className="flex justify-center py-8"><Spinner size={28} /></div>
            ) : rows.length === 0 ? (
                <p className="text-sm text-gray-500">No transactions yet.</p>
            ) : (
                <DataTable columns={cols} data={rows} compact />
            )}
        </div>
    )
}

const DocumentsTab = ({ materialId }: { materialId: string }) => {
    const [rows, setRows] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [addOpen, setAddOpen] = useState(false)
    const [fileName, setFileName] = useState('')
    const [fileUrl, setFileUrl] = useState('')
    const [storageKey, setStorageKey] = useState('')
    const [mimeType, setMimeType] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setRows(asList(await materialService.attachments(materialId)))
        } catch {
            setRows([])
        } finally {
            setLoading(false)
        }
    }, [materialId])

    useEffect(() => { load() }, [load])

    const resetForm = () => {
        setFileName(''); setFileUrl(''); setStorageKey(''); setMimeType('')
    }

    const handleAdd = async () => {
        if (!fileName.trim()) {
            pushToast('danger', 'Validation', 'File name is required.')
            return
        }
        try {
            await materialService.addAttachment(materialId, {
                fileName: fileName.trim(),
                fileUrl: fileUrl.trim() || undefined,
                storageKey: storageKey.trim() || undefined,
                mimeType: mimeType.trim() || undefined,
            })
            pushToast('success', 'Added', 'Document attached.')
            setAddOpen(false)
            resetForm()
            load()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Failed to add document')
        }
    }

    const handleDelete = async (attachmentId: string) => {
        try {
            await materialService.removeAttachment(materialId, attachmentId)
            pushToast('success', 'Deleted', 'Document removed.')
            load()
        } catch {
            pushToast('danger', 'Error', 'Failed to delete document')
        }
    }

    const cols: ColumnDef<any>[] = useMemo(() => [
        { header: 'File name', accessorKey: 'fileName', size: 220 },
        {
            header: 'URL',
            id: 'fileUrl',
            size: 220,
            cell: ({ row }) => row.original.fileUrl
                ? <a href={row.original.fileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate block max-w-[200px]">{row.original.fileUrl}</a>
                : '—',
        },
        { header: 'MIME', accessorKey: 'mimeType', size: 120, cell: ({ row }) => row.original.mimeType ?? '—' },
        {
            header: 'Uploaded',
            id: 'uploadedAt',
            size: 160,
            cell: ({ row }) => row.original.uploadedAt
                ? new Date(row.original.uploadedAt).toLocaleString()
                : '—',
        },
        {
            id: 'actions',
            header: '',
            size: 56,
            cell: ({ row }) => (
                <Button
                    size="xs"
                    variant="plain"
                    icon={<HiOutlineTrash className="text-red-500" />}
                    onClick={() => handleDelete(row.original.id)}
                />
            ),
        },
    ], [materialId])

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h6 className="text-sm font-semibold heading-text">Documents</h6>
                <Button size="xs" variant="solid" icon={<HiOutlinePlus />} onClick={() => { resetForm(); setAddOpen(true) }}>Add document</Button>
            </div>
            {loading ? (
                <div className="flex justify-center py-8"><Spinner size={28} /></div>
            ) : rows.length === 0 ? (
                <p className="text-sm text-gray-500">No documents attached.</p>
            ) : (
                <DataTable columns={cols} data={rows} compact />
            )}
            <FormDialog
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                size="sm"
                title="Add document"
                description="Attach document metadata to this material."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleAdd} disabled={!fileName.trim()}>Add</Button>
                    </>
                }
            >
                <FormItem label="File name" asterisk>
                    <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="e.g. datasheet.pdf" />
                </FormItem>
                <FormItem label="File URL">
                    <Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" />
                </FormItem>
                <FormItem label="Storage key">
                    <Input value={storageKey} onChange={(e) => setStorageKey(e.target.value)} placeholder="Optional storage key" />
                </FormItem>
                <FormItem label="MIME type">
                    <Input value={mimeType} onChange={(e) => setMimeType(e.target.value)} placeholder="e.g. application/pdf" />
                </FormItem>
            </FormDialog>
        </div>
    )
}

const BarcodesTab = ({ material, onRefresh }: { material: Material; onRefresh: () => void }) => {
    const barcodes = material.barcodes ?? []
    const [addOpen, setAddOpen] = useState(false)
    const [barcodeType, setBarcodeType] = useState('EAN13')
    const [barcodeValue, setBarcodeValue] = useState('')
    const [isPrimary, setIsPrimary] = useState(false)

    const handleAdd = async () => {
        try {
            await barcodeService.create({ materialId: material.id, barcodeType, barcodeValue, isPrimary })
            pushToast('success', 'Barcode added', `${barcodeValue} added.`)
            setAddOpen(false); setBarcodeValue(''); setIsPrimary(false); onRefresh()
        } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Failed') }
    }

    const handleDelete = async (id: string) => {
        try { await barcodeService.remove(id); pushToast('success', 'Deleted', 'Barcode removed.'); onRefresh() }
        catch { pushToast('danger', 'Error', 'Failed to delete barcode') }
    }

    const cols: ColumnDef<MmBarcode>[] = [
        { header: 'Type', accessorKey: 'barcodeType', size: 120 },
        { header: 'Value', accessorKey: 'barcodeValue', size: 300 },
        { header: 'Primary', accessorKey: 'isPrimary', size: 80, cell: ({ row }) => row.original.isPrimary ? <Tag className="bg-emerald-100 text-emerald-700 text-xs">Yes</Tag> : <span className="text-gray-400">No</span> },
        { id: 'actions', header: '', size: 56, cell: ({ row }) => <Button size="xs" variant="plain" icon={<HiOutlineTrash className="text-red-500" />} onClick={() => handleDelete(row.original.id)} /> },
    ]

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h6 className="text-sm font-semibold heading-text">Barcodes</h6>
                <Button size="xs" variant="solid" icon={<HiOutlinePlus />} onClick={() => setAddOpen(true)}>Add barcode</Button>
            </div>
            <DataTable<MmBarcode> columns={cols} data={barcodes} compact />
            <FormDialog
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                size="sm"
                title="Add barcode"
                description="Attach a barcode to this material."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleAdd} disabled={!barcodeValue.trim()}>Add</Button>
                    </>
                }
            >
                <FormItem label="Barcode type">
                    <Select options={[{ value: 'EAN13', label: 'EAN-13' }, { value: 'UPC', label: 'UPC' }, { value: 'CODE128', label: 'Code 128' }, { value: 'QR', label: 'QR' }]}
                        value={{ value: barcodeType, label: barcodeType }} onChange={(opt: any) => setBarcodeType(opt?.value ?? 'EAN13')} />
                </FormItem>
                <FormItem label="Value"><Input value={barcodeValue} onChange={(e) => setBarcodeValue(e.target.value)} placeholder="Enter barcode value" /></FormItem>
                <Checkbox checked={isPrimary} onChange={(checked) => setIsPrimary(!!checked)}>
                    Primary barcode
                </Checkbox>
            </FormDialog>
        </div>
    )
}

const BatchesTab = ({ material, onRefresh }: { material: Material; onRefresh: () => void }) => {
    const batches = material.batches ?? []
    const [addOpen, setAddOpen] = useState(false)
    const [batchNumber, setBatchNumber] = useState('')
    const [manufacturingDate, setManufacturingDate] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [supplierId, setSupplierId] = useState('')
    const [status, setStatus] = useState('AVAILABLE')
    const { options: supplierOpts } = useSupplierOptions({ enabled: addOpen })

    const resetForm = () => {
        setBatchNumber(''); setManufacturingDate(''); setExpiryDate(''); setSupplierId(''); setStatus('AVAILABLE')
    }

    const handleAdd = async () => {
        try {
            await batchService.create({
                materialId: material.id,
                batchNumber,
                manufacturingDate: manufacturingDate || undefined,
                expiryDate: expiryDate || undefined,
                supplierId: supplierId || undefined,
                status,
            })
            pushToast('success', 'Batch added', `Batch ${batchNumber} created.`)
            setAddOpen(false); resetForm(); onRefresh()
        } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Failed') }
    }

    const cols: ColumnDef<MmBatch>[] = [
        { header: 'Batch #', accessorKey: 'batchNumber', size: 180 },
        { header: 'Status', accessorKey: 'status', size: 120, cell: ({ row }) => <Tag>{row.original.status}</Tag> },
        {
            header: 'Supplier',
            id: 'supplier',
            size: 200,
            cell: ({ row }) => {
                const s = row.original.supplier
                if (!s) return '—'
                return s.supplierName ? `${s.supplierCode} — ${s.supplierName}` : s.supplierCode
            },
        },
        { header: 'Mfg date', accessorKey: 'manufacturingDate', size: 140, cell: ({ row }) => row.original.manufacturingDate ? new Date(row.original.manufacturingDate).toLocaleDateString() : '—' },
        { header: 'Expiry', accessorKey: 'expiryDate', size: 140, cell: ({ row }) => row.original.expiryDate ? new Date(row.original.expiryDate).toLocaleDateString() : '—' },
    ]

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h6 className="text-sm font-semibold heading-text">Batches</h6>
                {material.batchManaged && <Button size="xs" variant="solid" icon={<HiOutlinePlus />} onClick={() => { resetForm(); setAddOpen(true) }}>Add batch</Button>}
            </div>
            {!material.batchManaged ? (
                <p className="text-sm text-gray-500">This material is not batch-managed.</p>
            ) : (
                <DataTable<MmBatch> columns={cols} data={batches} compact />
            )}
            <FormDialog
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                size="md"
                title="Add batch"
                description="Create a batch for this material."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleAdd} disabled={!batchNumber.trim()}>Add</Button>
                    </>
                }
            >
                <FormItem label="Batch number"><Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="e.g. BATCH-001" /></FormItem>
                <FormItem label="Manufacture date">
                    <Input type="date" value={manufacturingDate} onChange={(e) => setManufacturingDate(e.target.value)} />
                </FormItem>
                <FormItem label="Expiry date">
                    <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                </FormItem>
                <FormItem label="Supplier">
                    <Select
                        isClearable
                        isSearchable
                        placeholder="Optional supplier…"
                        options={supplierOpts}
                        value={supplierOpts.find((o) => o.value === supplierId) ?? null}
                        onChange={(opt: any) => setSupplierId(opt?.value ?? '')}
                    />
                </FormItem>
                <FormItem label="Status">
                    <Select
                        options={BATCH_STATUS_OPTS}
                        value={BATCH_STATUS_OPTS.find((o) => o.value === status)}
                        onChange={(opt: any) => setStatus(opt?.value ?? 'AVAILABLE')}
                    />
                </FormItem>
            </FormDialog>
        </div>
    )
}

const SerialsTab = ({ material, onRefresh }: { material: Material; onRefresh: () => void }) => {
    const serials = material.serialNumbers ?? []
    const [addOpen, setAddOpen] = useState(false)
    const [serialNumber, setSerialNumber] = useState('')
    const [batchId, setBatchId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [binId, setBinId] = useState('')
    const [status, setStatus] = useState('AVAILABLE')
    const [batchOpts, setBatchOpts] = useState<Opt[]>([])
    const [warehouseOpts, setWarehouseOpts] = useState<Opt[]>([])
    const [binOpts, setBinOpts] = useState<Opt[]>([])

    useEffect(() => {
        if (!addOpen) return
        const fromMaterial = (material.batches ?? []).map((b) => ({ value: b.id, label: b.batchNumber }))
        if (fromMaterial.length > 0) {
            setBatchOpts(fromMaterial)
        } else {
            batchService.list(material.id)
                .then((list) => setBatchOpts(list.map((b: any) => ({ value: b.id, label: b.batchNumber }))))
                .catch(() => setBatchOpts([]))
        }
        orgService.warehouses()
            .then((list) => setWarehouseOpts(list.map((w: any) => ({ value: w.id, label: `${w.code} — ${w.name}` }))))
            .catch(() => setWarehouseOpts([]))
        storageBinService.list({ limit: 500 } as any)
            .then((r: any) => {
                const list = Array.isArray(r) ? r : r?.data ?? []
                setBinOpts(list.map((b: any) => ({ value: b.id, label: b.code })))
            })
            .catch(() => setBinOpts([]))
    }, [addOpen, material.id, material.batches])

    const resetForm = () => {
        setSerialNumber(''); setBatchId(''); setWarehouseId(''); setBinId(''); setStatus('AVAILABLE')
    }

    const handleAdd = async () => {
        try {
            await serialNumberService.create({
                materialId: material.id,
                serialNumber,
                batchId: batchId || undefined,
                currentWarehouseId: warehouseId || undefined,
                currentBinId: binId || undefined,
                status,
            })
            pushToast('success', 'Serial added', `Serial ${serialNumber} created.`)
            setAddOpen(false); resetForm(); onRefresh()
        } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Failed') }
    }

    const cols: ColumnDef<MmSerialNumber>[] = [
        { header: 'Serial #', accessorKey: 'serialNumber', size: 200 },
        { header: 'Status', accessorKey: 'status', size: 120, cell: ({ row }) => <Tag>{row.original.status}</Tag> },
        { header: 'Batch', accessorKey: 'batchId', size: 140, cell: ({ row }) => row.original.batch?.batchNumber ?? '—' },
        {
            header: 'Warehouse',
            id: 'warehouse',
            size: 140,
            cell: ({ row }) => row.original.currentWarehouse?.code ?? row.original.currentWarehouse?.name ?? '—',
        },
        {
            header: 'Bin',
            id: 'bin',
            size: 100,
            cell: ({ row }) => row.original.currentBin?.code ?? '—',
        },
    ]

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h6 className="text-sm font-semibold heading-text">Serial Numbers</h6>
                {material.serialManaged && <Button size="xs" variant="solid" icon={<HiOutlinePlus />} onClick={() => { resetForm(); setAddOpen(true) }}>Add serial</Button>}
            </div>
            {!material.serialManaged ? (
                <p className="text-sm text-gray-500">This material is not serial-managed.</p>
            ) : (
                <DataTable<MmSerialNumber> columns={cols} data={serials} compact />
            )}
            <FormDialog
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                size="md"
                title="Add serial number"
                description="Register a serial for this material."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleAdd} disabled={!serialNumber.trim()}>Add</Button>
                    </>
                }
            >
                <FormItem label="Serial number"><Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="e.g. SN-00001" /></FormItem>
                <FormItem label="Batch">
                    <Select
                        isClearable
                        isSearchable
                        placeholder="Optional batch…"
                        options={batchOpts}
                        value={batchOpts.find((o) => o.value === batchId) ?? null}
                        onChange={(opt: any) => setBatchId(opt?.value ?? '')}
                    />
                </FormItem>
                <FormItem label="Warehouse">
                    <Select
                        isClearable
                        isSearchable
                        placeholder="Optional warehouse…"
                        options={warehouseOpts}
                        value={warehouseOpts.find((o) => o.value === warehouseId) ?? null}
                        onChange={(opt: any) => setWarehouseId(opt?.value ?? '')}
                    />
                </FormItem>
                <FormItem label="Bin">
                    <Select
                        isClearable
                        isSearchable
                        placeholder="Optional bin…"
                        options={binOpts}
                        value={binOpts.find((o) => o.value === binId) ?? null}
                        onChange={(opt: any) => setBinId(opt?.value ?? '')}
                    />
                </FormItem>
                <FormItem label="Status">
                    <Select
                        options={SERIAL_STATUS_OPTS}
                        value={SERIAL_STATUS_OPTS.find((o) => o.value === status)}
                        onChange={(opt: any) => setStatus(opt?.value ?? 'AVAILABLE')}
                    />
                </FormItem>
            </FormDialog>
        </div>
    )
}

const AuditTab = ({ audits }: { audits: MmMaterialAudit[] }) => {
    const cols: ColumnDef<MmMaterialAudit>[] = [
        { header: 'Action', accessorKey: 'action', size: 140, cell: ({ row }) => <Tag>{row.original.action}</Tag> },
        { header: 'Date', accessorKey: 'performedAt', size: 180, cell: ({ row }) => new Date(row.original.performedAt).toLocaleString() },
        { header: 'Performed by', accessorKey: 'performedBy', size: 140, cell: ({ row }) => row.original.performedBy ?? 'System' },
        {
            header: 'Changes',
            id: 'changes',
            size: 400,
            cell: ({ row }) => {
                const changes = row.original.changes
                if (!changes || typeof changes !== 'object') return <span className="text-gray-400">—</span>
                const entries = Object.entries(changes)
                if (entries.length === 0) return <span className="text-gray-400">—</span>
                return (
                    <div className="flex flex-wrap gap-1">
                        {entries.slice(0, 5).map(([key, val]: [string, any]) => (
                            <Tag key={key} className="text-[10px]">
                                {key}: {String(val?.old ?? '—')} → {String(val?.new ?? '—')}
                            </Tag>
                        ))}
                        {entries.length > 5 && <Tag className="text-[10px]">+{entries.length - 5} more</Tag>}
                    </div>
                )
            },
        },
    ]

    return (
        <div>
            <h6 className="mb-4 text-sm font-semibold heading-text">Audit Trail</h6>
            {audits.length === 0 ? (
                <p className="text-sm text-gray-500">No audit records yet.</p>
            ) : (
                <DataTable<MmMaterialAudit> columns={cols} data={audits} compact />
            )}
        </div>
    )
}

const MetricCard = ({ label, value }: { label: string; value: string }) => (
    <AdaptiveCard>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-1 text-lg font-bold heading-text">{value}</p>
    </AdaptiveCard>
)

export default MaterialDetailPage
