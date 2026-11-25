'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import Tag from '@/components/ui/Tag'
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
    HiOutlineLibrary,
    HiOutlineOfficeBuilding,
    HiOutlineMail,
    HiOutlineLocationMarker,
    HiOutlineCash,
    HiOutlineCollection,
} from 'react-icons/hi'
import SupplierDocumentsPanel from '../components/SupplierDocumentsPanel'
import {
    SupplierComingSoonPanel,
    SupplierDetailSummaryStrip,
    SupplierSectionCard,
    SupplierTabPanel,
    SupplierTabToolbar,
    SupplierWorkbenchShell,
} from '../components/SupplierDetailChrome'
import {
    SmCodeNameCell,
    SmPlainCell,
    SmSupplierLinkCodeCell,
    smTableRowEnterClass,
} from '../components/SupplierTableCells'
import { supplierService } from '../services/supplierService'
import { supplierMaterialService } from '../services/supplierMaterialService'
import { supplierPricingService, type SupplierPrice } from '../services/supplierPricingService'
import { useMaterialOptions } from '@/modules/mm/shared/useEntityOptions'
import { supplierBankService } from '../services/supplierBankService'
import { supplierPerformanceService } from '../../supplier-performance/services/supplierPerformanceService'
import { ficoJournalService } from '@/modules/fico/services/ficoService'
import type { FicoJournalEntryListItem } from '@/modules/fico/types'
import usePermissions from '@/utils/hooks/usePermissions'
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
    const { can } = usePermissions()
    const canReadJournals = can('fico.journal-entries', 'read')

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
        fetchMaterials()
        fetchBankAccounts()
    }, [fetchMaterials, fetchBankAccounts])

    useEffect(() => {
        if (tab === 'audit') fetchAudits()
    }, [tab, fetchAudits])

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
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-primary">
                            {supplier.supplierCode}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                        <span>{supplier.supplierName}</span>
                        <StatusBadge tone={STATUS_TONE[supplier.status] ?? 'default'}>
                            {supplier.status.replace(/_/g, ' ')}
                        </StatusBadge>
                        {supplier.supplierType ? (
                            <Tag className="border-0 bg-gray-100 text-xs font-semibold dark:bg-gray-800">
                                {supplier.supplierType.replace(/_/g, ' ')}
                            </Tag>
                        ) : null}
                    </div>
                }
                description={
                    supplier.legalName
                        ? `Legal entity · ${supplier.legalName}`
                        : 'Supplier master profile, commercial links, and FICO partner journals'
                }
                actions={lifecycleActions}
            />

            <SupplierDetailSummaryStrip>
                <StatCard
                    className="animate-mm-row-in motion-reduce:animate-none"
                    label="Currency"
                    value={supplier.currency?.code ?? '—'}
                    icon={<HiOutlineCash />}
                    tone="info"
                />
                <StatCard
                    className="animate-mm-row-in motion-reduce:animate-none [animation-delay:40ms]"
                    label="Lead time"
                    value={
                        supplier.leadTimeDays != null
                            ? `${supplier.leadTimeDays} days`
                            : '—'
                    }
                    icon={<HiOutlineClock />}
                />
                <StatCard
                    className="animate-mm-row-in motion-reduce:animate-none [animation-delay:80ms]"
                    label="Bank accounts"
                    value={bankAccounts.length}
                    icon={<HiOutlineLibrary />}
                    tone={bankAccounts.length ? 'success' : 'default'}
                />
                <StatCard
                    className="animate-mm-row-in motion-reduce:animate-none [animation-delay:120ms]"
                    label="Linked materials"
                    value={materials.length || '—'}
                    icon={<HiOutlineCollection />}
                    tone="info"
                />
            </SupplierDetailSummaryStrip>

            <SupplierWorkbenchShell
                tabList={
                    <Tabs value={tab} onChange={(v) => setTab(v)} variant="pill">
                        <Tabs.TabList className="!gap-1 !overflow-x-auto !border-0 pb-2">
                            <Tabs.TabNav value="overview" icon={<HiOutlineTemplate />}>
                                Overview
                            </Tabs.TabNav>
                            <Tabs.TabNav value="materials" icon={<HiOutlineCube />}>
                                Materials
                            </Tabs.TabNav>
                            <Tabs.TabNav
                                value="pricing"
                                icon={<HiOutlineCurrencyDollar />}
                            >
                                Pricing
                            </Tabs.TabNav>
                            <Tabs.TabNav
                                value="purchase-orders"
                                icon={<HiOutlineShoppingCart />}
                            >
                                Purchase Orders
                            </Tabs.TabNav>
                            <Tabs.TabNav
                                value="receipts"
                                icon={<HiOutlineClipboardList />}
                            >
                                Receipts
                            </Tabs.TabNav>
                            <Tabs.TabNav
                                value="returns"
                                icon={<HiOutlineReceiptRefund />}
                            >
                                Returns
                            </Tabs.TabNav>
                            <Tabs.TabNav
                                value="quality"
                                icon={<HiOutlineShieldCheck />}
                            >
                                Quality
                            </Tabs.TabNav>
                            <Tabs.TabNav
                                value="performance"
                                icon={<HiOutlineChartBar />}
                            >
                                Performance
                            </Tabs.TabNav>
                            <Tabs.TabNav
                                value="documents"
                                icon={<HiOutlineDocumentText />}
                            >
                                Documents
                            </Tabs.TabNav>
                            {canReadJournals ? (
                                <Tabs.TabNav
                                    value="journals"
                                    icon={<HiOutlineLibrary />}
                                >
                                    Journals
                                </Tabs.TabNav>
                            ) : null}
                            <Tabs.TabNav value="audit" icon={<HiOutlineClock />}>
                                Audit
                            </Tabs.TabNav>
                        </Tabs.TabList>
                    </Tabs>
                }
            >
                <SupplierTabPanel active={tab === 'overview'} panelKey="overview">
                    <OverviewTab
                        supplier={supplier}
                        bankAccounts={bankAccounts}
                        onBankRefresh={fetchBankAccounts}
                    />
                </SupplierTabPanel>
                <SupplierTabPanel active={tab === 'materials'} panelKey="materials">
                    <MaterialsTab
                        materials={materials}
                        loading={materialsLoading}
                        onRefresh={fetchMaterials}
                        supplierId={id}
                    />
                </SupplierTabPanel>
                <SupplierTabPanel active={tab === 'pricing'} panelKey="pricing">
                    <PricingTab supplierId={supplier.id} />
                </SupplierTabPanel>
                <SupplierTabPanel active={tab === 'audit'} panelKey="audit">
                    <AuditTab audits={audits} />
                </SupplierTabPanel>
                <SupplierTabPanel
                    active={tab === 'purchase-orders'}
                    panelKey="purchase-orders"
                >
                    <SupplierComingSoonPanel
                        name="Purchase Orders"
                        icon={<HiOutlineShoppingCart className="text-2xl" />}
                        blurb="PO history for this supplier will appear here — open, confirmed, and closed orders with drill-through to procurement."
                    />
                </SupplierTabPanel>
                <SupplierTabPanel active={tab === 'receipts'} panelKey="receipts">
                    <SupplierComingSoonPanel
                        name="Goods Receipts"
                        icon={<HiOutlineClipboardList className="text-2xl" />}
                        blurb="Inbound receipts linked to this supplier will surface GR documents, quantities, and posting status."
                    />
                </SupplierTabPanel>
                <SupplierTabPanel active={tab === 'returns'} panelKey="returns">
                    <SupplierComingSoonPanel
                        name="Supplier Returns"
                        icon={<HiOutlineReceiptRefund className="text-2xl" />}
                        blurb="Return-to-vendor documents and disposition status for this partner will be listed in this workspace."
                    />
                </SupplierTabPanel>
                <SupplierTabPanel active={tab === 'quality'} panelKey="quality">
                    <SupplierComingSoonPanel
                        name="Quality"
                        icon={<HiOutlineShieldCheck className="text-2xl" />}
                        blurb="Inspection lots, usage decisions, and acceptance rates for this supplier will land here."
                    />
                </SupplierTabPanel>
                <SupplierTabPanel
                    active={tab === 'performance'}
                    panelKey="performance"
                >
                    <PerformanceTab
                        supplierId={id}
                        companyId={supplier.companyId}
                    />
                </SupplierTabPanel>
                <SupplierTabPanel active={tab === 'documents'} panelKey="documents">
                    <SupplierDocumentsPanel
                        supplierId={supplier.id}
                        compact
                    />
                </SupplierTabPanel>
                {canReadJournals ? (
                    <SupplierTabPanel
                        active={tab === 'journals'}
                        panelKey="journals"
                    >
                        <JournalsTab
                            supplierId={supplier.id}
                            companyId={supplier.companyId}
                            active={tab === 'journals'}
                        />
                    </SupplierTabPanel>
                ) : null}
            </SupplierWorkbenchShell>
        </PageContainer>
    )
}

// ─── Overview Tab ────────────────────────────────────────────────────

const InfoItem = ({
    label,
    value,
}: {
    label: string
    value?: string | number | null
}) => (
    <div className="rounded-lg bg-white/70 px-3 py-2 dark:bg-gray-900/40">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {label}
        </dt>
        <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {value || '—'}
        </dd>
    </div>
)

const OverviewTab = ({
    supplier,
    bankAccounts,
}: {
    supplier: Supplier
    bankAccounts: SupplierBankAccount[]
    onBankRefresh: () => void
}) => {
    const [revealedId, setRevealedId] = useState<string | null>(null)
    const [revealedData, setRevealedData] = useState<SupplierBankAccount | null>(
        null,
    )

    const handleReveal = useCallback(
        async (acctId: string) => {
            try {
                const full = await supplierBankService.reveal(
                    supplier.id,
                    acctId,
                    'ui-user',
                )
                setRevealedId(acctId)
                setRevealedData(full)
            } catch {
                // ignore
            }
        },
        [supplier.id],
    )

    const bankColumns = useMemo<ColumnDef<SupplierBankAccount>[]>(
        () => [
            {
                header: 'Bank',
                cell: ({ row }) => (
                    <SmPlainCell>{row.original.bankName}</SmPlainCell>
                ),
            },
            {
                header: 'Account name',
                cell: ({ row }) => (
                    <SmPlainCell>{row.original.accountName}</SmPlainCell>
                ),
            },
            {
                header: 'Account number',
                cell: ({ row }) => (
                    <span className="font-mono text-xs tabular-nums">
                        {revealedId === row.original.id && revealedData
                            ? revealedData.accountNumber
                            : row.original.accountNumber}
                    </span>
                ),
            },
            {
                header: 'Primary',
                cell: ({ row }) => (
                    <StatusBadge
                        tone={row.original.isPrimary ? 'success' : 'default'}
                    >
                        {row.original.isPrimary ? 'Primary' : 'Secondary'}
                    </StatusBadge>
                ),
            },
            {
                header: '',
                id: 'reveal',
                cell: ({ row }) =>
                    revealedId === row.original.id ? null : (
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiOutlineEye />}
                            onClick={() => handleReveal(row.original.id)}
                        >
                            Reveal
                        </Button>
                    ),
            },
        ],
        [handleReveal, revealedData, revealedId],
    )

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <SupplierSectionCard
                title="Identity"
                description="Master codes and classification"
                icon={<HiOutlineOfficeBuilding className="text-lg" />}
                delayMs={0}
            >
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <InfoItem label="Supplier Code" value={supplier.supplierCode} />
                    <InfoItem label="Supplier Name" value={supplier.supplierName} />
                    <InfoItem label="Legal Name" value={supplier.legalName} />
                    <InfoItem label="Type" value={supplier.supplierType} />
                    <InfoItem label="Tax ID" value={supplier.taxId} />
                    <InfoItem label="Category" value={supplier.category?.name} />
                </dl>
            </SupplierSectionCard>

            <SupplierSectionCard
                title="Contact"
                description="People and channels"
                icon={<HiOutlineMail className="text-lg" />}
                delayMs={40}
            >
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <InfoItem
                        label="Primary Contact"
                        value={supplier.primaryContact}
                    />
                    <InfoItem label="Email" value={supplier.email} />
                    <InfoItem label="Phone" value={supplier.phone} />
                    <InfoItem label="Website" value={supplier.website} />
                </dl>
            </SupplierSectionCard>

            <SupplierSectionCard
                title="Address"
                description="Billing and shipping footprint"
                icon={<HiOutlineLocationMarker className="text-lg" />}
                delayMs={80}
            >
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <InfoItem
                        label="Billing Address"
                        value={supplier.billingAddress}
                    />
                    <InfoItem
                        label="Shipping Address"
                        value={supplier.shippingAddress}
                    />
                    <InfoItem label="Country" value={supplier.country} />
                    <InfoItem label="Region" value={supplier.region} />
                </dl>
            </SupplierSectionCard>

            <SupplierSectionCard
                title="Purchasing & tax"
                description="Commercial defaults"
                icon={<HiOutlineCash className="text-lg" />}
                delayMs={120}
            >
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <InfoItem label="Currency" value={supplier.currency?.code} />
                    <InfoItem
                        label="Payment Terms"
                        value={supplier.paymentTerms?.name}
                    />
                    <InfoItem
                        label="Delivery Terms"
                        value={supplier.deliveryTerms}
                    />
                    <InfoItem
                        label="Default Warehouse"
                        value={supplier.defaultWarehouse?.name}
                    />
                    <InfoItem
                        label="Lead Time (days)"
                        value={supplier.leadTimeDays}
                    />
                    <InfoItem label="Tax Code" value={supplier.taxCode} />
                    <InfoItem label="Tax Status" value={supplier.taxStatus} />
                </dl>
            </SupplierSectionCard>

            {supplier.status === 'BLOCKED' && supplier.blockReason ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 lg:col-span-2 dark:border-red-500/30 dark:bg-red-500/10">
                    <h5 className="text-sm font-semibold text-red-700 dark:text-red-300">
                        Block reason
                    </h5>
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {supplier.blockReason}
                    </p>
                </div>
            ) : null}

            <SupplierSectionCard
                title="Bank accounts"
                description="Settlement accounts on file"
                icon={<HiOutlineLibrary className="text-lg" />}
                className="lg:col-span-2"
                delayMs={160}
            >
                {bankAccounts.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        No bank accounts on file.
                    </p>
                ) : (
                    <DataTable
                        columns={bankColumns}
                        data={bankAccounts}
                        compact
                        fit
                        rowClassName={(_, index) => smTableRowEnterClass(index)}
                    />
                )}
            </SupplierSectionCard>
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
            return m ? (
                <SmCodeNameCell code={m.materialCode} name={m.materialName} />
            ) : (
                <span className="text-sm text-gray-400">—</span>
            )
        },
    },
    {
        header: 'Supplier code',
        accessorKey: 'supplierMaterialCode',
        cell: ({ row }) => (
            <SmSupplierLinkCodeCell code={row.original.supplierMaterialCode} />
        ),
    },
    {
        header: 'Unit price',
        accessorKey: 'unitPrice',
        cell: ({ row }) => (
            <span className="text-sm font-semibold tabular-nums">
                {Number(row.original.unitPrice).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}
            </span>
        ),
    },
    {
        header: 'MOQ',
        accessorKey: 'minimumOrderQuantity',
        cell: ({ row }) => (
            <SmPlainCell mono>
                {row.original.minimumOrderQuantity ?? ''}
            </SmPlainCell>
        ),
    },
    {
        header: 'Lead time',
        accessorKey: 'leadTimeDays',
        cell: ({ row }) => (
            <SmPlainCell>
                {row.original.leadTimeDays
                    ? `${row.original.leadTimeDays}d`
                    : ''}
            </SmPlainCell>
        ),
    },
    {
        header: 'Preferred',
        accessorKey: 'preferredSupplier',
        cell: ({ row }) => (
            <StatusBadge
                tone={row.original.preferredSupplier ? 'success' : 'default'}
            >
                {row.original.preferredSupplier ? 'Yes' : 'No'}
            </StatusBadge>
        ),
    },
    {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => (
            <StatusBadge
                tone={row.original.status === 'ACTIVE' ? 'success' : 'warning'}
            >
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
    const [form, setForm] = useState<any>({ materialId: '', unitPrice: '', leadTimeDays: '', minimumOrderQuantity: '' })
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
            setForm({ materialId: '', unitPrice: '', leadTimeDays: '', minimumOrderQuantity: '' })
            onRefresh()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Failed to add')
        }
    }, [supplierId, form, onRefresh, editId])

    return (
        <div>
            <SupplierTabToolbar
                title="Supplier materials"
                description="Materials linked to this partner with commercial pricing and lead times."
                actions={
                    <Button
                        size="sm"
                        icon={<HiOutlinePlus />}
                        variant="solid"
                        onClick={() => {
                            setEditId(null)
                            setLookupHint('')
                            setForm({
                                materialId: '',
                                unitPrice: '',
                                leadTimeDays: '',
                                minimumOrderQuantity: '',
                            })
                            setAddOpen(true)
                        }}
                    >
                        Add material
                    </Button>
                }
            />
            <DataTable<SupplierMaterial>
                columns={materialColumns}
                data={materials}
                compact
                fit
                loading={loading}
                noData={!loading && materials.length === 0}
                rowClassName={(_, index) => smTableRowEnterClass(index)}
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
                {editId && materials.find((m) => m.id === editId)?.supplierMaterialCode ? (
                    <FormItem label="Supplier material code">
                        <Input
                            value={materials.find((m) => m.id === editId)?.supplierMaterialCode ?? ''}
                            disabled
                            readOnly
                            className="font-mono text-sm"
                        />
                    </FormItem>
                ) : (
                    <p className="mb-2 text-xs text-gray-500">
                        Supplier material code is generated automatically when you save.
                    </p>
                )}
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

    const columns = useMemo<ColumnDef<SupplierPrice>[]>(
        () => [
            {
                header: 'Material',
                id: 'mat',
                cell: ({ row }) => {
                    const m = row.original.material
                    return m ? (
                        <SmCodeNameCell
                            code={m.materialCode}
                            name={m.materialName}
                        />
                    ) : (
                        <SmPlainCell mono>{row.original.materialId}</SmPlainCell>
                    )
                },
            },
            {
                header: 'Unit price',
                accessorKey: 'unitPrice',
                cell: ({ row }) => (
                    <span className="text-sm font-semibold tabular-nums">
                        {Number(row.original.unitPrice).toLocaleString(
                            undefined,
                            { minimumFractionDigits: 2 },
                        )}
                    </span>
                ),
            },
            {
                header: 'Currency',
                id: 'cur',
                cell: ({ row }) => (
                    <SmPlainCell>
                        {row.original.currency?.code ?? ''}
                    </SmPlainCell>
                ),
            },
            {
                header: 'Min qty',
                accessorKey: 'minimumQuantity',
                cell: ({ row }) => (
                    <span className="text-sm tabular-nums">
                        {Number(row.original.minimumQuantity).toLocaleString()}
                    </span>
                ),
            },
            {
                header: 'Effective from',
                accessorKey: 'effectiveFrom',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-xs tabular-nums text-gray-700 dark:text-gray-300">
                        {new Date(
                            row.original.effectiveFrom,
                        ).toLocaleDateString()}
                    </span>
                ),
            },
            {
                header: 'Effective to',
                accessorKey: 'effectiveTo',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-xs tabular-nums text-gray-700 dark:text-gray-300">
                        {row.original.effectiveTo
                            ? new Date(
                                  row.original.effectiveTo,
                              ).toLocaleDateString()
                            : 'Open'}
                    </span>
                ),
            },
        ],
        [],
    )

    return (
        <div>
            <SupplierTabToolbar
                title="Effective-dated prices"
                description={
                    <>
                        Manage the full pricing catalog on{' '}
                        <Link
                            href="/modules/mm/supplier-management/supplier-pricing"
                            className="font-medium text-primary hover:underline"
                        >
                            Supplier Pricing
                        </Link>
                        .
                    </>
                }
                actions={
                    <Button
                        size="sm"
                        icon={<HiOutlinePlus />}
                        variant="solid"
                        onClick={() => {
                            resetForm()
                            setAddOpen(true)
                        }}
                    >
                        Add price
                    </Button>
                }
            />
            <DataTable<SupplierPrice>
                columns={columns}
                data={items}
                compact
                fit
                loading={loading}
                noData={!loading && items.length === 0}
                rowClassName={(_, index) => smTableRowEnterClass(index)}
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
    <div>
        <SupplierTabToolbar
            title="Audit trail"
            description="Lifecycle and field-level changes recorded for this supplier master."
        />
        <DataTable<SupplierAudit>
            columns={auditColumns}
            data={audits}
            compact
            fit
            noData={audits.length === 0}
            rowClassName={(_, index) => smTableRowEnterClass(index)}
        />
    </div>
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
            <div>
                <SupplierTabToolbar
                    title="Performance"
                    description="Delivery, quality, and commercial scorecards for this supplier."
                />
                <div className="flex h-40 items-center justify-center">
                    <Spinner />
                </div>
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
            <DataTable
                columns={columns}
                data={rows}
                compact
                fit
                rowClassName={(_, index) => smTableRowEnterClass(index)}
            />
        ) : (
            <p className="py-2 text-sm text-gray-500">{empty}</p>
        )

    return (
        <div className="space-y-6">
            <SupplierTabToolbar
                title="Performance"
                description={
                    detail.note ||
                    'Delivery, quality, and commercial scorecards for this supplier.'
                }
            />

            {evalRow ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
                    ].map((c, index) => (
                        <div
                            key={c.label}
                            className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 transition-shadow hover:shadow-sm animate-mm-row-in motion-reduce:animate-none dark:border-gray-800 dark:bg-gray-800/30"
                            style={{ animationDelay: `${index * 35}ms` }}
                        >
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                {c.label}
                            </div>
                            <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                {c.value}
                            </div>
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

// ─── Journals Tab (FICO partner reference) ────────────────────────────

function JournalsTab({
    supplierId,
    companyId,
    active,
}: {
    supplierId: string
    companyId: string
    active: boolean
}) {
    const [items, setItems] = useState<FicoJournalEntryListItem[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!active || !companyId || !supplierId) return
        let cancelled = false
        setLoading(true)
        setError(null)
        ficoJournalService
            .list({
                companyId,
                supplierId,
                page: 1,
                pageSize: 50,
                sortBy: 'postingDate',
                sortDir: 'desc',
            })
            .then((res) => {
                if (!cancelled) setItems(res.items ?? [])
            })
            .catch(() => {
                if (!cancelled) {
                    setItems([])
                    setError('Unable to load FICO journals for this supplier.')
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [active, companyId, supplierId])

    const formatMoney = (currency: string, amount: string | number) =>
        `${currency} ${Number(amount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`

    const columns = useMemo<ColumnDef<FicoJournalEntryListItem>[]>(
        () => [
            {
                header: 'Document',
                cell: ({ row }) => (
                    <Link
                        href={`/modules/fico/journal-entries/${row.original.id}`}
                        className="font-mono text-sm font-semibold text-primary hover:underline"
                    >
                        {row.original.documentNumber ?? 'Draft'}
                    </Link>
                ),
            },
            {
                header: 'Posting date',
                cell: ({ row }) =>
                    String(row.original.postingDate).slice(0, 10),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge
                        tone={
                            row.original.status === 'POSTED'
                                ? 'success'
                                : row.original.status === 'REVERSED'
                                  ? 'info'
                                  : 'default'
                        }
                    >
                        {row.original.status.replace(/_/g, ' ')}
                    </StatusBadge>
                ),
            },
            {
                header: 'Source',
                cell: ({ row }) =>
                    row.original.sourceModule
                        ? row.original.sourceModule
                        : 'Manual',
            },
            {
                header: 'Debit',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm tabular-nums">
                        {formatMoney(
                            row.original.currencyCode,
                            row.original.totalAmount,
                        )}
                    </span>
                ),
            },
            {
                header: 'Credit',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm tabular-nums">
                        {formatMoney(
                            row.original.currencyCode,
                            row.original.totalAmount,
                        )}
                    </span>
                ),
            },
            {
                header: 'Posted by',
                cell: ({ row }) => {
                    if (
                        row.original.status !== 'POSTED' &&
                        row.original.status !== 'REVERSED'
                    ) {
                        return '—'
                    }
                    return row.original.postedByName ?? 'System'
                },
            },
            {
                header: 'Description',
                cell: ({ row }) => row.original.description ?? '—',
            },
        ],
        [],
    )

    const toolbar = (
        <SupplierTabToolbar
            title="FICO journals"
            description="Journals with this supplier as the partner reference. Open a document number to view the entry."
        />
    )

    if (loading) {
        return (
            <div>
                {toolbar}
                <div className="flex h-40 items-center justify-center">
                    <Spinner />
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div>
                {toolbar}
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
        )
    }

    if (!items.length) {
        return (
            <div>
                {toolbar}
                <p className="text-sm text-gray-500">
                    No FICO journals linked to this supplier yet. Manual journals
                    can select the supplier on create; automatic MM postings will
                    appear here once they carry the partner reference.
                </p>
            </div>
        )
    }

    return (
        <div>
            {toolbar}
            <DataTable
                columns={columns}
                data={items}
                compact
                fit
                rowClassName={(_, index) => smTableRowEnterClass(index)}
            />
        </div>
    )
}

export default SupplierDetailPage
