'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineTemplate,
    HiOutlineCube,
    HiOutlineCurrencyDollar,
    HiOutlineDocumentText,
    HiOutlineClock,
    HiOutlineShoppingCart,
    HiOutlineReceiptRefund,
    HiOutlineShieldCheck,
    HiOutlineChartBar,
    HiOutlineClipboardList,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineEye,
    HiOutlineCheckCircle,
    HiOutlineBan,
    HiOutlineClipboardCheck,
} from 'react-icons/hi'
import { supplierService } from '../services/supplierService'
import { supplierMaterialService } from '../services/supplierMaterialService'
import { supplierPricingService, type SupplierPrice } from '../services/supplierPricingService'
import { useMaterialOptions } from '@/modules/mm/shared/useEntityOptions'
import { supplierBankService } from '../services/supplierBankService'
import { supplierPerformanceService } from '../../supplier-performance/services/supplierPerformanceService'
import type {
    Supplier,
    SupplierMaterial,
    SupplierBankAccount,
    SupplierAudit,
} from '../types'
import type { SupplierPerformanceDetail } from '../../supplier-performance/types'
import Chart from '@/components/shared/Chart'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    PENDING_REVIEW: 'info',
    APPROVED: 'info',
    ACTIVE: 'success',
    INACTIVE: 'warning',
    BLOCKED: 'danger',
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const SupplierDetailPage = () => {
    const params = useParams()
    const router = useRouter()
    const id = params?.id as string

    const [supplier, setSupplier] = useState<Supplier | null>(null)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState('overview')

    const [materials, setMaterials] = useState<SupplierMaterial[]>([])
    const [materialsLoading, setMaterialsLoading] = useState(false)

    const [bankAccounts, setBankAccounts] = useState<SupplierBankAccount[]>([])
    const [audits, setAudits] = useState<SupplierAudit[]>([])

    const fetchSupplier = useCallback(async () => {
        setLoading(true)
        try {
            const s = await supplierService.get(id)
            setSupplier(s)
        } catch {
            pushToast('danger', 'Error', 'Failed to load supplier')
        } finally {
            setLoading(false)
        }
    }, [id])

    const fetchMaterials = useCallback(async () => {
        setMaterialsLoading(true)
        try {
            const res = await supplierMaterialService.list({ supplierId: id })
            setMaterials(res.data)
        } catch { /* ignore */ } finally {
            setMaterialsLoading(false)
        }
    }, [id])

    const fetchBankAccounts = useCallback(async () => {
        try {
            const accts = await supplierBankService.list(id)
            setBankAccounts(accts)
        } catch { /* ignore */ }
    }, [id])

    const fetchAudits = useCallback(async () => {
        try {
            const a = await supplierService.getAudit(id)
            setAudits(a)
        } catch { /* ignore */ }
    }, [id])

    useEffect(() => { fetchSupplier() }, [fetchSupplier])

    useEffect(() => {
        if (tab === 'materials') fetchMaterials()
        if (tab === 'audit') fetchAudits()
    }, [tab, fetchMaterials, fetchAudits])

    useEffect(() => {
        fetchBankAccounts()
    }, [fetchBankAccounts])

    const handleLifecycle = useCallback(async (action: string) => {
        try {
            let result: Supplier
            switch (action) {
                case 'submit': result = await supplierService.submit(id); break
                case 'approve': result = await supplierService.approve(id); break
                case 'activate': result = await supplierService.activate(id); break
                case 'deactivate': result = await supplierService.deactivate(id); break
                case 'unblock': result = await supplierService.unblock(id); break
                default: return
            }
            pushToast('success', 'Status updated', `Supplier is now ${result.status}`)
            setSupplier(result)
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Action failed')
        }
    }, [id])

    const breadcrumbItems = useMemo(
        () =>
            buildErpBreadcrumbs(
                `/modules/mm/supplier-management/supplier-master/${id}`,
                {
                    detailLabel: supplier
                        ? `${supplier.supplierCode} — ${supplier.supplierName}`
                        : undefined,
                },
            ),
        [id, supplier],
    )

    if (loading) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-96 items-center justify-center"><Spinner size={40} /></div>
            </PageContainer>
        )
    }

    if (!supplier) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-96 flex-col items-center justify-center gap-2">
                    <p className="text-lg font-semibold">Supplier not found</p>
                    <Button onClick={() => router.back()}>Go back</Button>
                </div>
            </PageContainer>
        )
    }

    const lifecycleActions = (
        <div className="flex items-center gap-2">
            {supplier.status === 'DRAFT' && (
                <Button size="sm" variant="solid" icon={<HiOutlineClipboardCheck />} onClick={() => handleLifecycle('submit')}>
                    Submit for Review
                </Button>
            )}
            {supplier.status === 'PENDING_REVIEW' && (
                <Button size="sm" variant="solid" icon={<HiOutlineCheckCircle />} onClick={() => handleLifecycle('approve')}>
                    Approve
                </Button>
            )}
            {(supplier.status === 'APPROVED' || supplier.status === 'INACTIVE') && (
                <Button size="sm" variant="solid" icon={<HiOutlineCheckCircle />} onClick={() => handleLifecycle('activate')}>
                    Activate
                </Button>
            )}
            {supplier.status === 'ACTIVE' && (
                <Button size="sm" icon={<HiOutlineBan />} onClick={() => handleLifecycle('deactivate')}>
                    Deactivate
                </Button>
            )}
            {supplier.status === 'BLOCKED' && (
                <Button size="sm" variant="solid" icon={<HiOutlineCheckCircle />} onClick={() => handleLifecycle('unblock')}>
                    Unblock
                </Button>
            )}
        </div>
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title={
                    <div className="flex items-center gap-3">
                        <span>{supplier.supplierCode} — {supplier.supplierName}</span>
                        <StatusBadge tone={STATUS_TONE[supplier.status] ?? 'default'}>
                            {supplier.status.replace(/_/g, ' ')}
                        </StatusBadge>
                    </div>
                }
                actions={lifecycleActions}
            />

            <AdaptiveCard className="mt-4">
                <Tabs value={tab} onChange={(v) => setTab(v)}>
                    <Tabs.TabList className="!overflow-x-auto">
                        <Tabs.TabNav value="overview" icon={<HiOutlineTemplate />}>Overview</Tabs.TabNav>
                        <Tabs.TabNav value="materials" icon={<HiOutlineCube />}>Materials</Tabs.TabNav>
                        <Tabs.TabNav value="pricing" icon={<HiOutlineCurrencyDollar />}>Pricing</Tabs.TabNav>
                        <Tabs.TabNav value="purchase-orders" icon={<HiOutlineShoppingCart />}>Purchase Orders</Tabs.TabNav>
                        <Tabs.TabNav value="receipts" icon={<HiOutlineClipboardList />}>Receipts</Tabs.TabNav>
                        <Tabs.TabNav value="returns" icon={<HiOutlineReceiptRefund />}>Returns</Tabs.TabNav>
                        <Tabs.TabNav value="quality" icon={<HiOutlineShieldCheck />}>Quality</Tabs.TabNav>
                        <Tabs.TabNav value="performance" icon={<HiOutlineChartBar />}>Performance</Tabs.TabNav>
                        <Tabs.TabNav value="documents" icon={<HiOutlineDocumentText />}>Documents</Tabs.TabNav>
                        <Tabs.TabNav value="audit" icon={<HiOutlineClock />}>Audit</Tabs.TabNav>
                    </Tabs.TabList>

                    <div className="p-5">
                        <TabPanel active={tab === 'overview'}>
                            <OverviewTab supplier={supplier} bankAccounts={bankAccounts} onBankRefresh={fetchBankAccounts} />
                        </TabPanel>
                        <TabPanel active={tab === 'materials'}>
                            <MaterialsTab materials={materials} loading={materialsLoading} onRefresh={fetchMaterials} supplierId={id} />
                        </TabPanel>
                        <TabPanel active={tab === 'pricing'}>
                            <PricingTab supplierId={supplier.id} />
                        </TabPanel>
                        <TabPanel active={tab === 'audit'}>
                            <AuditTab audits={audits} />
                        </TabPanel>
                        <TabPanel active={tab === 'purchase-orders'}><PlaceholderTab name="Purchase Orders" /></TabPanel>
                        <TabPanel active={tab === 'receipts'}><PlaceholderTab name="Receipts" /></TabPanel>
                        <TabPanel active={tab === 'returns'}><PlaceholderTab name="Returns" /></TabPanel>
                        <TabPanel active={tab === 'quality'}><PlaceholderTab name="Quality" /></TabPanel>
                        <TabPanel active={tab === 'performance'}>
                            <PerformanceTab
                                supplierId={id}
                                companyId={supplier.companyId}
                            />
                        </TabPanel>
                        <TabPanel active={tab === 'documents'}>
                            <DocumentsTab supplierId={supplier.id} />
                        </TabPanel>
                    </div>
                </Tabs>
            </AdaptiveCard>
        </PageContainer>
    )
}

const TabPanel = ({ active, children }: { active: boolean; children: React.ReactNode }) =>
    active ? <>{children}</> : null

// ─── Overview Tab ────────────────────────────────────────────────────

const InfoItem = ({ label, value }: { label: string; value?: string | number | null }) => (
    <div>
        <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{value || '—'}</dd>
    </div>
)

const OverviewTab = ({ supplier, bankAccounts, onBankRefresh }: { supplier: Supplier; bankAccounts: SupplierBankAccount[]; onBankRefresh: () => void }) => {
    const [revealedId, setRevealedId] = useState<string | null>(null)
    const [revealedData, setRevealedData] = useState<SupplierBankAccount | null>(null)

    const handleReveal = useCallback(async (acctId: string) => {
        try {
            const full = await supplierBankService.reveal(supplier.id, acctId, 'ui-user')
            setRevealedId(acctId)
            setRevealedData(full)
        } catch {
            // ignore
        }
    }, [supplier.id])

    return (
        <div className="space-y-6">
            <div>
                <h5 className="mb-3 text-sm font-semibold uppercase text-gray-400">Identity</h5>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                    <InfoItem label="Supplier Code" value={supplier.supplierCode} />
                    <InfoItem label="Supplier Name" value={supplier.supplierName} />
                    <InfoItem label="Legal Name" value={supplier.legalName} />
                    <InfoItem label="Type" value={supplier.supplierType} />
                    <InfoItem label="Tax ID" value={supplier.taxId} />
                    <InfoItem label="Category" value={supplier.category?.name} />
                </dl>
            </div>

            <div>
                <h5 className="mb-3 text-sm font-semibold uppercase text-gray-400">Contact</h5>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                    <InfoItem label="Primary Contact" value={supplier.primaryContact} />
                    <InfoItem label="Email" value={supplier.email} />
                    <InfoItem label="Phone" value={supplier.phone} />
                    <InfoItem label="Website" value={supplier.website} />
                </dl>
            </div>

            <div>
                <h5 className="mb-3 text-sm font-semibold uppercase text-gray-400">Address</h5>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                    <InfoItem label="Billing Address" value={supplier.billingAddress} />
                    <InfoItem label="Shipping Address" value={supplier.shippingAddress} />
                    <InfoItem label="Country" value={supplier.country} />
                    <InfoItem label="Region" value={supplier.region} />
                </dl>
            </div>

            <div>
                <h5 className="mb-3 text-sm font-semibold uppercase text-gray-400">Purchasing</h5>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                    <InfoItem label="Currency" value={supplier.currency?.code} />
                    <InfoItem label="Payment Terms" value={supplier.paymentTerms?.name} />
                    <InfoItem label="Delivery Terms" value={supplier.deliveryTerms} />
                    <InfoItem label="Default Warehouse" value={supplier.defaultWarehouse?.name} />
                    <InfoItem label="Lead Time (days)" value={supplier.leadTimeDays} />
                </dl>
            </div>

            <div>
                <h5 className="mb-3 text-sm font-semibold uppercase text-gray-400">Tax</h5>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                    <InfoItem label="Tax Code" value={supplier.taxCode} />
                    <InfoItem label="Tax Status" value={supplier.taxStatus} />
                </dl>
            </div>

            {supplier.status === 'BLOCKED' && supplier.blockReason && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
                    <h5 className="text-sm font-semibold text-red-700 dark:text-red-300">Block Reason</h5>
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{supplier.blockReason}</p>
                </div>
            )}

            <div>
                <h5 className="mb-3 text-sm font-semibold uppercase text-gray-400">Bank Accounts</h5>
                {bankAccounts.length === 0 ? (
                    <p className="text-sm text-gray-500">No bank accounts on file.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-600">
                                    <th className="pb-2 pr-4">Bank</th>
                                    <th className="pb-2 pr-4">Account Name</th>
                                    <th className="pb-2 pr-4">Account Number</th>
                                    <th className="pb-2 pr-4">Primary</th>
                                    <th className="pb-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {bankAccounts.map((acct) => (
                                    <tr key={acct.id} className="border-b border-gray-100 dark:border-gray-700">
                                        <td className="py-2 pr-4 font-medium">{acct.bankName}</td>
                                        <td className="py-2 pr-4">{acct.accountName}</td>
                                        <td className="py-2 pr-4 font-mono text-xs">
                                            {revealedId === acct.id && revealedData ? revealedData.accountNumber : acct.accountNumber}
                                        </td>
                                        <td className="py-2 pr-4">{acct.isPrimary ? 'Yes' : 'No'}</td>
                                        <td className="py-2">
                                            {revealedId !== acct.id && (
                                                <Button size="xs" variant="plain" icon={<HiOutlineEye />} onClick={() => handleReveal(acct.id)}>
                                                    Reveal
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Materials Tab ───────────────────────────────────────────────────

const materialColumns: ColumnDef<SupplierMaterial>[] = [
    {
        header: 'Material',
        accessorKey: 'materialId',
        cell: ({ row }) => {
            const m = row.original.material
            return m ? <span className="text-sm font-medium">{m.materialCode} — {m.materialName}</span> : <span>—</span>
        },
    },
    {
        header: 'Supplier Code',
        accessorKey: 'supplierMaterialCode',
        cell: ({ row }) => <span className="text-sm">{row.original.supplierMaterialCode || '—'}</span>,
    },
    {
        header: 'Unit Price',
        accessorKey: 'unitPrice',
        cell: ({ row }) => <span className="text-sm font-semibold">{Number(row.original.unitPrice).toFixed(2)}</span>,
    },
    {
        header: 'MOQ',
        accessorKey: 'minimumOrderQuantity',
        cell: ({ row }) => <span className="text-sm">{row.original.minimumOrderQuantity ?? '—'}</span>,
    },
    {
        header: 'Lead Time',
        accessorKey: 'leadTimeDays',
        cell: ({ row }) => <span className="text-sm">{row.original.leadTimeDays ? `${row.original.leadTimeDays}d` : '—'}</span>,
    },
    {
        header: 'Preferred',
        accessorKey: 'preferredSupplier',
        cell: ({ row }) => (
            <StatusBadge tone={row.original.preferredSupplier ? 'success' : 'default'}>
                {row.original.preferredSupplier ? 'Yes' : 'No'}
            </StatusBadge>
        ),
    },
    {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => (
            <StatusBadge tone={row.original.status === 'ACTIVE' ? 'success' : 'warning'}>
                {row.original.status}
            </StatusBadge>
        ),
    },
]

const MaterialsTab = ({
    materials,
    loading,
    onRefresh,
    supplierId,
}: {
    materials: SupplierMaterial[]
    loading: boolean
    onRefresh: () => void
    supplierId: string
}) => {
    const [addOpen, setAddOpen] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [lookupHint, setLookupHint] = useState('')
    const [form, setForm] = useState<any>({ materialId: '', unitPrice: '', supplierMaterialCode: '', leadTimeDays: '', minimumOrderQuantity: '' })
    const { options: materialOpts } = useMaterialOptions({ enabled: addOpen })

    useEffect(() => {
        if (!addOpen || !form.materialId || !supplierId) {
            setLookupHint('')
            return
        }
        let cancelled = false
        const t = setTimeout(async () => {
            try {
                const res = await supplierMaterialService.list({
                    supplierId,
                    materialId: form.materialId,
                    page: 1,
                    pageSize: 1,
                })
                if (cancelled) return
                const hit = res.data?.[0]
                if (hit) {
                    setEditId(hit.id)
                    setForm((p: any) => ({
                        ...p,
                        unitPrice: String(hit.unitPrice ?? ''),
                        supplierMaterialCode: hit.supplierMaterialCode || '',
                        leadTimeDays: hit.leadTimeDays != null ? String(hit.leadTimeDays) : '',
                        minimumOrderQuantity: hit.minimumOrderQuantity != null ? String(hit.minimumOrderQuantity) : '',
                    }))
                    setLookupHint('Existing link found — form filled from saved pricing. Saving will update it.')
                } else {
                    setEditId(null)
                    setLookupHint('No existing link. Enter pricing to create one.')
                }
            } catch {
                if (!cancelled) setLookupHint('')
            }
        }, 300)
        return () => {
            cancelled = true
            clearTimeout(t)
        }
    }, [addOpen, form.materialId, supplierId])

    const handleAdd = useCallback(async () => {
        try {
            const payload = {
                supplierId,
                materialId: form.materialId,
                unitPrice: parseFloat(form.unitPrice) || 0,
                supplierMaterialCode: form.supplierMaterialCode || undefined,
                leadTimeDays: form.leadTimeDays ? parseInt(form.leadTimeDays, 10) : undefined,
                minimumOrderQuantity: form.minimumOrderQuantity ? parseFloat(form.minimumOrderQuantity) : undefined,
            }
            if (editId) {
                await supplierMaterialService.update(editId, payload)
                pushToast('success', 'Updated', 'Supplier-material link updated.')
            } else {
                await supplierMaterialService.create(payload)
                pushToast('success', 'Added', 'Supplier-material link created.')
            }
            setAddOpen(false)
            setEditId(null)
            setLookupHint('')
            setForm({ materialId: '', unitPrice: '', supplierMaterialCode: '', leadTimeDays: '', minimumOrderQuantity: '' })
            onRefresh()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Failed to add')
        }
    }, [supplierId, form, onRefresh, editId])

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h5 className="text-sm font-semibold">Supplier Materials</h5>
                <Button size="sm" icon={<HiOutlinePlus />} variant="solid" onClick={() => {
                    setEditId(null)
                    setLookupHint('')
                    setForm({ materialId: '', unitPrice: '', supplierMaterialCode: '', leadTimeDays: '', minimumOrderQuantity: '' })
                    setAddOpen(true)
                }}>
                    Add Material
                </Button>
            </div>
            <DataTable<SupplierMaterial>
                columns={materialColumns}
                data={materials}
                compact
                fit
                loading={loading}
                noData={!loading && materials.length === 0}
            />

            <FormDialog
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                size="md"
                title={editId ? 'Edit Supplier Material' : 'Add Supplier Material'}
                description="Link a material to this supplier with pricing."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button type="button" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button type="button" size="sm" variant="solid" onClick={handleAdd}>{editId ? 'Save' : 'Add'}</Button>
                    </>
                }
            >
                <FormItem label="Material" asterisk>
                    <Select
                        isSearchable
                        placeholder="Search material code or name…"
                        options={materialOpts}
                        value={materialOpts.find((o) => o.value === form.materialId) ?? null}
                        onChange={(opt: any) =>
                            setForm((p: any) => ({
                                ...p,
                                materialId: opt?.value ?? '',
                                unitPrice: '',
                                supplierMaterialCode: '',
                                leadTimeDays: '',
                                minimumOrderQuantity: '',
                            }))
                        }
                    />
                </FormItem>
                {lookupHint && <p className="mb-3 text-xs text-primary">{lookupHint}</p>}
                <FormItem label="Unit Price" asterisk>
                    <Input type="number" placeholder="e.g. 125.00" value={form.unitPrice} onChange={(e) => setForm((p: any) => ({ ...p, unitPrice: e.target.value }))} />
                </FormItem>
                <FormItem label="Supplier Material Code">
                    <Input placeholder="e.g. SUP-SKU-001" value={form.supplierMaterialCode} onChange={(e) => setForm((p: any) => ({ ...p, supplierMaterialCode: e.target.value }))} />
                </FormItem>
                <FormItem label="Lead Time (days)">
                    <Input type="number" placeholder="e.g. 7" value={form.leadTimeDays} onChange={(e) => setForm((p: any) => ({ ...p, leadTimeDays: e.target.value }))} />
                </FormItem>
                <FormItem label="Min Order Qty">
                    <Input type="number" placeholder="e.g. 100" value={form.minimumOrderQuantity} onChange={(e) => setForm((p: any) => ({ ...p, minimumOrderQuantity: e.target.value }))} />
                </FormItem>
            </FormDialog>
        </div>
    )
}

// ─── Pricing Tab ─────────────────────────────────────────────────────

const PricingTab = ({ supplierId }: { supplierId: string }) => {
    const [items, setItems] = useState<SupplierPrice[]>([])
    const [loading, setLoading] = useState(true)
    const [addOpen, setAddOpen] = useState(false)
    const [form, setForm] = useState({
        materialId: '',
        unitPrice: '',
        currencyId: '',
        minimumQuantity: '0',
        effectiveFrom: '',
        effectiveTo: '',
    })
    const { options: materialOpts } = useMaterialOptions({ enabled: addOpen })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setItems(await supplierPricingService.list({ supplierId }))
        } catch {
            setItems([])
        } finally {
            setLoading(false)
        }
    }, [supplierId])

    useEffect(() => { load() }, [load])

    const resetForm = () =>
        setForm({ materialId: '', unitPrice: '', currencyId: '', minimumQuantity: '0', effectiveFrom: '', effectiveTo: '' })

    const handleAdd = useCallback(async () => {
        if (!form.materialId || !form.unitPrice) {
            pushToast('danger', 'Validation', 'Material and unit price are required.')
            return
        }
        try {
            await supplierPricingService.create({
                supplierId,
                materialId: form.materialId,
                unitPrice: Number(form.unitPrice),
                currencyId: form.currencyId || undefined,
                minimumQuantity: Number(form.minimumQuantity || 0),
                effectiveFrom: form.effectiveFrom || undefined,
                effectiveTo: form.effectiveTo || undefined,
            })
            pushToast('success', 'Created', 'Price band created.')
            setAddOpen(false)
            resetForm()
            load()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Failed to create price')
        }
    }, [supplierId, form, load])

    const columns = useMemo<ColumnDef<SupplierPrice>[]>(() => [
        {
            header: 'Material',
            id: 'mat',
            cell: ({ row }) => {
                const m = row.original.material
                return m
                    ? <span className="text-sm font-medium">{m.materialCode} — {m.materialName}</span>
                    : <span className="text-sm">{row.original.materialId}</span>
            },
        },
        {
            header: 'Unit Price',
            accessorKey: 'unitPrice',
            cell: ({ row }) => (
                <span className="text-sm font-semibold">
                    {Number(row.original.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
            ),
        },
        {
            header: 'Currency',
            id: 'cur',
            cell: ({ row }) => <span className="text-sm">{row.original.currency?.code ?? '—'}</span>,
        },
        {
            header: 'Min Qty',
            accessorKey: 'minimumQuantity',
            cell: ({ row }) => <span className="text-sm">{Number(row.original.minimumQuantity).toLocaleString()}</span>,
        },
        {
            header: 'Effective From',
            accessorKey: 'effectiveFrom',
            cell: ({ row }) => <span className="text-sm">{new Date(row.original.effectiveFrom).toLocaleDateString()}</span>,
        },
        {
            header: 'Effective To',
            accessorKey: 'effectiveTo',
            cell: ({ row }) => (
                <span className="text-sm">
                    {row.original.effectiveTo ? new Date(row.original.effectiveTo).toLocaleDateString() : 'Open'}
                </span>
            ),
        },
    ], [])

    return (
        <div>
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <h5 className="text-sm font-semibold">Effective-dated Prices</h5>
                    <p className="mt-0.5 text-xs text-gray-500">
                        Manage full pricing catalog on{' '}
                        <Link href="/modules/mm/supplier-management/supplier-pricing" className="text-primary hover:underline">
                            Supplier Pricing
                        </Link>
                    </p>
                </div>
                <Button
                    size="sm"
                    icon={<HiOutlinePlus />}
                    variant="solid"
                    onClick={() => { resetForm(); setAddOpen(true) }}
                >
                    Add Price
                </Button>
            </div>
            <DataTable<SupplierPrice>
                columns={columns}
                data={items}
                compact
                fit
                loading={loading}
                noData={!loading && items.length === 0}
            />

            <FormDialog
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                size="md"
                title="Add Price Band"
                description="Create an effective-dated price for this supplier."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button type="button" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button type="button" size="sm" variant="solid" onClick={handleAdd}>Add</Button>
                    </>
                }
            >
                <FormItem label="Material" asterisk>
                    <Select
                        isSearchable
                        placeholder="Search material…"
                        options={materialOpts}
                        value={materialOpts.find((o) => o.value === form.materialId) ?? null}
                        onChange={(opt: any) => setForm((p) => ({ ...p, materialId: opt?.value ?? '' }))}
                    />
                </FormItem>
                <FormItem label="Unit Price" asterisk>
                    <Input
                        type="number"
                        placeholder="0.00"
                        value={form.unitPrice}
                        onChange={(e) => setForm((p) => ({ ...p, unitPrice: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Currency ID">
                    <Input
                        placeholder="Optional currency id"
                        value={form.currencyId}
                        onChange={(e) => setForm((p) => ({ ...p, currencyId: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Min Qty">
                    <Input
                        type="number"
                        value={form.minimumQuantity}
                        onChange={(e) => setForm((p) => ({ ...p, minimumQuantity: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Effective From">
                    <Input
                        type="date"
                        value={form.effectiveFrom}
                        onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Effective To">
                    <Input
                        type="date"
                        value={form.effectiveTo}
                        onChange={(e) => setForm((p) => ({ ...p, effectiveTo: e.target.value }))}
                    />
                </FormItem>
            </FormDialog>
        </div>
    )
}

// ─── Documents Tab ───────────────────────────────────────────────────

type SupplierDocRow = {
    id: string
    fileName: string
    fileUrl?: string | null
    storageKey?: string | null
    mimeType?: string | null
    docType?: string | null
    uploadedAt: string
}

const DOC_TYPES = [
    { value: 'CONTRACT', label: 'Contract' },
    { value: 'CERTIFICATE', label: 'Certificate' },
    { value: 'TAX', label: 'Tax document' },
    { value: 'OTHER', label: 'Other' },
]

const DocumentsTab = ({ supplierId }: { supplierId: string }) => {
    const [items, setItems] = useState<SupplierDocRow[]>([])
    const [loading, setLoading] = useState(true)
    const [addOpen, setAddOpen] = useState(false)
    const [form, setForm] = useState({
        fileName: '',
        fileUrl: '',
        storageKey: '',
        mimeType: '',
        docType: 'OTHER',
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setItems((await supplierService.listDocuments(supplierId)) as SupplierDocRow[])
        } catch {
            setItems([])
        } finally {
            setLoading(false)
        }
    }, [supplierId])

    useEffect(() => { load() }, [load])

    const resetForm = () =>
        setForm({ fileName: '', fileUrl: '', storageKey: '', mimeType: '', docType: 'OTHER' })

    const handleAdd = useCallback(async () => {
        if (!form.fileName.trim()) {
            pushToast('danger', 'Validation', 'File name is required.')
            return
        }
        try {
            await supplierService.addDocument(supplierId, {
                fileName: form.fileName.trim(),
                fileUrl: form.fileUrl || undefined,
                storageKey: form.storageKey || undefined,
                mimeType: form.mimeType || undefined,
                docType: form.docType || undefined,
            })
            pushToast('success', 'Added', 'Document metadata saved.')
            setAddOpen(false)
            resetForm()
            load()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Failed to add document')
        }
    }, [supplierId, form, load])

    const handleDelete = useCallback(async (docId: string) => {
        try {
            await supplierService.removeDocument(supplierId, docId)
            pushToast('success', 'Deleted', 'Document removed.')
            load()
        } catch {
            pushToast('danger', 'Error', 'Delete failed')
        }
    }, [supplierId, load])

    const columns = useMemo<ColumnDef<SupplierDocRow>[]>(() => [
        { header: 'File Name', accessorKey: 'fileName', cell: ({ row }) => <span className="text-sm font-medium">{row.original.fileName}</span> },
        { header: 'Type', accessorKey: 'docType', cell: ({ row }) => <span className="text-sm">{row.original.docType || '—'}</span> },
        { header: 'MIME', accessorKey: 'mimeType', cell: ({ row }) => <span className="text-sm">{row.original.mimeType || '—'}</span> },
        {
            header: 'Uploaded',
            accessorKey: 'uploadedAt',
            cell: ({ row }) => <span className="text-xs">{new Date(row.original.uploadedAt).toLocaleString()}</span>,
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
                <Button
                    size="xs"
                    variant="plain"
                    icon={<HiOutlineTrash className="text-red-500" />}
                    onClick={() => handleDelete(row.original.id)}
                />
            ),
        },
    ], [handleDelete])

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h5 className="text-sm font-semibold">Documents</h5>
                <Button
                    size="sm"
                    icon={<HiOutlinePlus />}
                    variant="solid"
                    onClick={() => { resetForm(); setAddOpen(true) }}
                >
                    Add Document
                </Button>
            </div>
            <DataTable<SupplierDocRow>
                columns={columns}
                data={items}
                compact
                fit
                loading={loading}
                noData={!loading && items.length === 0}
            />

            <FormDialog
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                size="md"
                title="Add Document"
                description="Store document metadata for this supplier."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button type="button" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button type="button" size="sm" variant="solid" onClick={handleAdd}>Add</Button>
                    </>
                }
            >
                <FormItem label="File Name" asterisk>
                    <Input
                        placeholder="e.g. contract-2026.pdf"
                        value={form.fileName}
                        onChange={(e) => setForm((p) => ({ ...p, fileName: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Document Type">
                    <Select
                        options={DOC_TYPES}
                        value={DOC_TYPES.find((o) => o.value === form.docType) ?? null}
                        onChange={(opt: any) => setForm((p) => ({ ...p, docType: opt?.value ?? 'OTHER' }))}
                    />
                </FormItem>
                <FormItem label="File URL">
                    <Input
                        placeholder="https://…"
                        value={form.fileUrl}
                        onChange={(e) => setForm((p) => ({ ...p, fileUrl: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Storage Key">
                    <Input
                        placeholder="Optional storage key"
                        value={form.storageKey}
                        onChange={(e) => setForm((p) => ({ ...p, storageKey: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="MIME Type">
                    <Input
                        placeholder="application/pdf"
                        value={form.mimeType}
                        onChange={(e) => setForm((p) => ({ ...p, mimeType: e.target.value }))}
                    />
                </FormItem>
            </FormDialog>
        </div>
    )
}

// ─── Audit Tab ───────────────────────────────────────────────────────

const auditColumns: ColumnDef<SupplierAudit>[] = [
    {
        header: 'Date',
        accessorKey: 'performedAt',
        cell: ({ row }) => <span className="text-xs">{new Date(row.original.performedAt).toLocaleString()}</span>,
    },
    { header: 'Action', accessorKey: 'action' },
    { header: 'Field', accessorKey: 'field', cell: ({ row }) => <span>{row.original.field || '—'}</span> },
    { header: 'Old Value', accessorKey: 'oldValue', cell: ({ row }) => <span className="text-xs">{row.original.oldValue || '—'}</span> },
    { header: 'New Value', accessorKey: 'newValue', cell: ({ row }) => <span className="text-xs">{row.original.newValue || '—'}</span> },
    { header: 'Performed By', accessorKey: 'performedBy', cell: ({ row }) => <span>{row.original.performedBy || '—'}</span> },
]

const AuditTab = ({ audits }: { audits: SupplierAudit[] }) => (
    <DataTable<SupplierAudit>
        columns={auditColumns}
        data={audits}
        compact
        fit
        noData={audits.length === 0}
    />
)

// ─── Performance Tab ─────────────────────────────────────────────────

const PerformanceTab = ({
    supplierId,
    companyId,
}: {
    supplierId: string
    companyId: string
}) => {
    const [detail, setDetail] = useState<SupplierPerformanceDetail | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setLoading(true)
            try {
                const d = await supplierPerformanceService.supplierDetail(supplierId, {
                    companyId,
                    limit: 10,
                })
                if (!cancelled) setDetail(d)
            } catch {
                if (!cancelled) setDetail(null)
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [companyId, supplierId])

    if (loading) {
        return (
            <div className="flex h-40 items-center justify-center">
                <Spinner />
            </div>
        )
    }

    if (!detail) {
        return (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-gray-500">
                <p className="text-sm">Unable to load performance detail.</p>
                <Link href="/modules/mm/supplier-management/supplier-evaluation">
                    <Button size="sm">Go to Evaluation</Button>
                </Link>
            </div>
        )
    }

    const evalRow = detail.score
    const trendCats = detail.trend.map((t) => String(t.periodStart).slice(0, 7))
    const trendSeries = [
        {
            name: 'Overall',
            data: detail.trend.map((t) => Number(Number(t.overallScore).toFixed(1))),
        },
        {
            name: 'Delivery',
            data: detail.trend.map((t) => Number(Number(t.deliveryScore).toFixed(1))),
        },
        {
            name: 'Quality',
            data: detail.trend.map((t) => Number(Number(t.qualityScore).toFixed(1))),
        },
    ]

    const miniCols = <T,>(
        rows: T[],
        columns: ColumnDef<T>[],
        empty: string,
    ) =>
        rows.length ? (
            <DataTable columns={columns} data={rows} compact />
        ) : (
            <p className="text-sm text-gray-500 py-2">{empty}</p>
        )

    return (
        <div className="space-y-6">
            <p className="text-xs text-gray-500">{detail.note}</p>

            {evalRow ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Overall', value: Number(evalRow.overallScore).toFixed(1) },
                        { label: 'Delivery', value: Number(evalRow.deliveryScore).toFixed(1) },
                        { label: 'Quality', value: Number(evalRow.qualityScore).toFixed(1) },
                        {
                            label: 'Returns',
                            value: `${(Number(evalRow.returnRate) * 100).toFixed(1)}%`,
                        },
                        { label: 'Price', value: Number(evalRow.priceScore).toFixed(1) },
                        { label: 'Service', value: Number(evalRow.serviceScore).toFixed(1) },
                        {
                            label: 'Compliance',
                            value: Number(evalRow.complianceScore).toFixed(1),
                        },
                        {
                            label: 'On-time',
                            value: `${(Number(evalRow.onTimePct) * 100).toFixed(1)}%`,
                        },
                    ].map((c) => (
                        <div
                            key={c.label}
                            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        >
                            <div className="text-xs text-gray-500">{c.label}</div>
                            <div className="text-lg font-semibold">{c.value}</div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                    No calculated evaluation yet.{' '}
                    <Link
                        className="text-primary hover:underline"
                        href="/modules/mm/supplier-management/supplier-evaluation"
                    >
                        Run evaluation
                    </Link>
                </div>
            )}

            <div>
                <h6 className="mb-2 font-semibold">Score trend</h6>
                {trendCats.length ? (
                    <Chart type="line" series={trendSeries} xAxis={trendCats} height={240} />
                ) : (
                    <p className="text-sm text-gray-500">No historical trend yet.</p>
                )}
            </div>

            <div>
                <h6 className="mb-2 font-semibold">PO history</h6>
                {miniCols(
                    detail.purchaseOrders,
                    [
                        { header: 'PO', accessorKey: 'poNumber' },
                        { header: 'Status', accessorKey: 'status' },
                        {
                            header: 'Expected',
                            cell: ({ row }) =>
                                row.original.expectedDeliveryDate
                                    ? String(row.original.expectedDeliveryDate).slice(0, 10)
                                    : '—',
                        },
                        {
                            header: 'Amount',
                            cell: ({ row }) =>
                                Number(row.original.totalAmount).toLocaleString(),
                        },
                    ] as ColumnDef<(typeof detail.purchaseOrders)[0]>[],
                    'No purchase orders.',
                )}
            </div>

            <div>
                <h6 className="mb-2 font-semibold">Receipt history</h6>
                {miniCols(
                    detail.goodsReceipts,
                    [
                        { header: 'GR', accessorKey: 'documentNumber' },
                        { header: 'Status', accessorKey: 'status' },
                        {
                            header: 'Promised',
                            cell: ({ row }) =>
                                row.original.promisedDate
                                    ? String(row.original.promisedDate).slice(0, 10)
                                    : '—',
                        },
                        {
                            header: 'Actual',
                            cell: ({ row }) =>
                                String(row.original.actualReceiptDate).slice(0, 10),
                        },
                    ] as ColumnDef<(typeof detail.goodsReceipts)[0]>[],
                    'No goods receipts.',
                )}
            </div>

            <div>
                <h6 className="mb-2 font-semibold">Quality history</h6>
                {miniCols(
                    detail.qualityHistory,
                    [
                        { header: 'QI', accessorKey: 'documentNumber' },
                        { header: 'Result', accessorKey: 'result' },
                        {
                            header: 'Accepted / Received',
                            cell: ({ row }) =>
                                `${row.original.acceptedQuantity} / ${row.original.receivedQuantity}`,
                        },
                        {
                            header: 'Rate',
                            cell: ({ row }) =>
                                row.original.acceptanceRate != null
                                    ? `${(row.original.acceptanceRate * 100).toFixed(1)}%`
                                    : '—',
                        },
                    ] as ColumnDef<(typeof detail.qualityHistory)[0]>[],
                    'No quality inspections.',
                )}
            </div>

            <div>
                <h6 className="mb-2 font-semibold">Returns</h6>
                {miniCols(
                    detail.returns,
                    [
                        { header: 'Return', accessorKey: 'returnNumber' },
                        { header: 'Status', accessorKey: 'status' },
                        { header: 'Reason', accessorKey: 'reason' },
                        {
                            header: 'Qty',
                            cell: ({ row }) => Number(row.original.totalQuantity),
                        },
                    ] as ColumnDef<(typeof detail.returns)[0]>[],
                    'No supplier returns.',
                )}
            </div>

            <div>
                <h6 className="mb-2 font-semibold">Invoice price variance</h6>
                {miniCols(
                    detail.pricing.invoicePriceVariance,
                    [
                        { header: 'Invoice', accessorKey: 'invoiceNumber' },
                        {
                            header: 'Material',
                            cell: ({ row }) => row.original.materialCode ?? '—',
                        },
                        {
                            header: 'PO price',
                            cell: ({ row }) =>
                                row.original.poUnitPrice != null
                                    ? Number(row.original.poUnitPrice).toFixed(2)
                                    : '—',
                        },
                        {
                            header: 'Invoice price',
                            cell: ({ row }) =>
                                Number(row.original.invoiceUnitPrice).toFixed(2),
                        },
                        {
                            header: 'Variance',
                            cell: ({ row }) =>
                                row.original.priceVariancePct != null
                                    ? `${(row.original.priceVariancePct * 100).toFixed(1)}%`
                                    : '—',
                        },
                    ] as ColumnDef<(typeof detail.pricing.invoicePriceVariance)[0]>[],
                    'No invoice price variance rows.',
                )}
            </div>

            <div>
                <h6 className="mb-2 font-semibold">Manual assessments (separate)</h6>
                {miniCols(
                    detail.manualAssessments,
                    [
                        {
                            header: 'Date',
                            cell: ({ row }) =>
                                String(row.original.assessmentDate).slice(0, 10),
                        },
                        {
                            header: 'Overall',
                            cell: ({ row }) => Number(row.original.overallScore).toFixed(1),
                        },
                        { header: 'By', accessorKey: 'assessedBy' },
                        { header: 'Status', accessorKey: 'status' },
                        { header: 'Notes', accessorKey: 'notes' },
                    ] as ColumnDef<(typeof detail.manualAssessments)[0]>[],
                    'No manual assessments.',
                )}
            </div>

            <Link href="/modules/mm/supplier-management/supplier-performance">
                <Button size="sm">Open Performance Dashboard</Button>
            </Link>
        </div>
    )
}

// ─── Placeholder Tab ─────────────────────────────────────────────────

const PlaceholderTab = ({ name }: { name: string }) => (
    <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
        <HiOutlineDocumentText className="text-4xl" />
        <p className="text-sm font-medium">{name} — Coming soon</p>
    </div>
)

export default SupplierDetailPage
