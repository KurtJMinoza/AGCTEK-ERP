'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineCube,
    HiOutlineSearch,
    HiOutlinePlus,
    HiOutlineEye,
    HiOutlineCheckCircle,
    HiOutlineLockClosed,
    HiOutlineTruck,
    HiOutlineTrash,
    HiOutlineMap,
} from 'react-icons/hi'
import { packingService } from '../services/packingService'
import PackagePackingWorkspace from '../components/PackagePackingWorkspace'
import {
    useMmFilterRefs,
    useLazyMaterialEntities,
    useLazyWarehouseEntities,
} from '@/modules/mm/shared/useLazyMmRefs'
import type {
    WmPackage,
    PackageQueryParams,
    CreatePackagePayload,
} from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import Iso9001OutboundWorkflowStrip from '@/modules/mm/shared/components/Iso9001OutboundWorkflowStrip'
import InfoCard from '../../shared/InfoCard'
import {
    WmAnimatedStatus,
    WmDocNumberCell,
    WmItemCountBadge,
    WmPartyCell,
    WmProgressQtyCell,
    WmSalesOrderChip,
    wmTableRowEnterClass,
} from '../components/WarehouseTableCells'
import dynamic from 'next/dynamic'

const ShipToMapDialog = dynamic(
    () => import('../components/ShipToMapDialog'),
    { ssr: false },
)

const ROUTE = '/modules/mm/warehouse-management/packing'

const STATUS_TONE: Record<
    string,
    'success' | 'default' | 'warning' | 'danger'
> = {
    OPEN: 'default',
    PACKING: 'warning',
    VERIFIED: 'success',
    SEALED: 'success',
    READY_FOR_DISPATCH: 'success',
    DISPATCHED: 'success',
    CANCELLED: 'danger',
}

const STATUS_TABS = [
    'All',
    'OPEN',
    'PACKING',
    'VERIFIED',
    'SEALED',
    'READY_FOR_DISPATCH',
    'DISPATCHED',
    'CANCELLED',
] as const

type FilterOption = { value: string; label: string }

function pushToast(
    type: 'success' | 'danger' | 'warning',
    title: string,
    msg: string,
) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

/** Backend validation message (possibly an array) from an axios failure. */
function packageExpectedTotal(pkg: WmPackage): number {
    if (pkg.totalItemQuantity != null) return Number(pkg.totalItemQuantity) || 0
    return (pkg.items ?? []).reduce(
        (sum, item) => sum + (Number(item.expectedQty) || 0),
        0,
    )
}

function packageScannedTotal(pkg: WmPackage): number {
    return (pkg.items ?? []).reduce(
        (sum, item) => sum + (Number(item.scannedQty) || 0),
        0,
    )
}

function apiErrorMessage(err: unknown, fallback: string): string {
    const response = (err as { response?: { data?: { message?: unknown } } })
        ?.response?.data
    const message = response?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message) return message
    return fallback
}

const PackingPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [search, setSearch] = useState('')
    const [warehouseFilter, setWarehouseFilter] = useState('')
    const [statusTab, setStatusTab] = useState('All')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    const [packages, setPackages] = useState<WmPackage[]>([])
    const [meta, setMeta] = useState({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
    })
    const [loading, setLoading] = useState(true)

    const { warehouses: warehouseFilterOpts } = useMmFilterRefs('warehouses')
    const { ensure: ensureWarehouses, rows: warehouses } =
        useLazyWarehouseEntities()
    const { ensure: ensureMaterials, rows: materials } =
        useLazyMaterialEntities()

    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)

    const [createOpen, setCreateOpen] = useState(false)
    const [createForm, setCreateForm] = useState<{
        warehouseId: string
        orderNumber: string
        packageType: string
        items: { materialId: string; expectedQty: number }[]
    }>({ warehouseId: '', orderNumber: '', packageType: '', items: [] })

    const [detailOpen, setDetailOpen] = useState(false)
    const [detailPkg, setDetailPkg] = useState<WmPackage | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)

    const [sealWeight, setSealWeight] = useState('')
    const [sealLength, setSealLength] = useState('')
    const [sealWidth, setSealWidth] = useState('')
    const [sealHeight, setSealHeight] = useState('')

    const [dispatchCarrier, setDispatchCarrier] = useState('')
    const [dispatchTracking, setDispatchTracking] = useState('')
    const [shipToName, setShipToName] = useState('')
    const [shipToAddress, setShipToAddress] = useState('')
    const [shipToLat, setShipToLat] = useState('')
    const [shipToLng, setShipToLng] = useState('')
    const [shipToMapOpen, setShipToMapOpen] = useState(false)

    const queryParams = useMemo<PackageQueryParams>(
        () => ({
            page,
            limit: pageSize,
            search: search || undefined,
            warehouseId: warehouseFilter || undefined,
            status: statusTab === 'All' ? undefined : statusTab,
            sortBy: 'createdAt',
            sortOrder: 'desc',
        }),
        [page, pageSize, search, warehouseFilter, statusTab],
    )

    const fetchPackages = useCallback(async () => {
        setLoading(true)
        try {
            const res = await packingService.list(queryParams)
            setPackages(res.data)
            setMeta(res.meta)
        } catch {
            pushToast('danger', 'Error', 'Failed to load packages')
        } finally {
            setLoading(false)
        }
    }, [queryParams])

    useEffect(() => {
        fetchPackages()
    }, [fetchPackages])

    const warehouseOptions = useMemo<FilterOption[]>(
        () => [{ value: '', label: 'All warehouses' }, ...warehouseFilterOpts],
        [warehouseFilterOpts],
    )

    const materialOptions = useMemo<FilterOption[]>(
        () =>
            materials.map((m) => ({
                value: m.id,
                label: `${m.materialCode} — ${m.materialName}`,
            })),
        [materials],
    )

    const openCreate = useCallback(async () => {
        await Promise.all([ensureWarehouses(), ensureMaterials()])
        setCreateForm({
            warehouseId: '',
            orderNumber: '',
            packageType: '',
            items: [],
        })
        setCreateOpen(true)
    }, [ensureWarehouses, ensureMaterials])

    const addItem = useCallback(() => {
        setCreateForm((prev) => ({
            ...prev,
            items: [...prev.items, { materialId: '', expectedQty: 1 }],
        }))
    }, [])

    const removeItem = useCallback((idx: number) => {
        setCreateForm((prev) => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== idx),
        }))
    }, [])

    const updateItem = useCallback(
        (
            idx: number,
            field: 'materialId' | 'expectedQty',
            value: string | number,
        ) => {
            setCreateForm((prev) => ({
                ...prev,
                items: prev.items.map((item, i) =>
                    i === idx ? { ...item, [field]: value } : item,
                ),
            }))
        },
        [],
    )

    const handleCreateSave = useCallback(async () => {
        try {
            const payload: CreatePackagePayload = {
                warehouseId: createForm.warehouseId,
                orderNumber: createForm.orderNumber || undefined,
                packageType: createForm.packageType || undefined,
                items: createForm.items.filter(
                    (it) => it.materialId && it.expectedQty > 0,
                ),
            }
            const pkg = await packingService.create(payload)
            pushToast(
                'success',
                'Package created',
                `Package ${pkg.packageNumber} created.`,
            )
            setCreateOpen(false)
            fetchPackages()
        } catch (err) {
            pushToast(
                'danger',
                'Error',
                apiErrorMessage(err, 'An error occurred'),
            )
        }
    }, [createForm, fetchPackages])

    const openDetail = useCallback(
        async (pkg: WmPackage) => {
            setDetailOpen(true)
            setDetailLoading(true)
            setSealWeight('')
            setSealLength('')
            setSealWidth('')
            setSealHeight('')
            setDispatchCarrier('')
            setDispatchTracking('')
            setShipToName(pkg.shipToName ?? '')
            setShipToAddress(pkg.shipToAddress ?? '')
            setShipToLat(
                pkg.shipToLat != null ? String(pkg.shipToLat) : '',
            )
            setShipToLng(
                pkg.shipToLng != null ? String(pkg.shipToLng) : '',
            )
            try {
                const full = await packingService.get(pkg.id)
                setDetailPkg(full)
                // Ship-to comes from the customer's order (via the picking task);
                // fall back to whatever is already stored on the package.
                const so = full.salesOrder ?? full.pickingTask?.salesOrder
                const composedAddress = [
                    so?.shipToAddressLine1,
                    so?.shipToCity,
                    so?.shipToRegion,
                    so?.shipToPostalCode,
                    so?.shipToCountry,
                ]
                    .filter(Boolean)
                    .join(', ')
                setShipToName(
                    full.shipToName ?? so?.shipToName ?? so?.customerName ?? '',
                )
                setShipToAddress(full.shipToAddress ?? composedAddress ?? '')
                // Delivery pin from the customer's registered e-commerce
                // address, prefilled for the operator to confirm before SCM release.
                if (
                    (pkg.shipToLat == null || pkg.shipToLng == null) &&
                    full.suggestedShipTo
                ) {
                    setShipToLat(String(full.suggestedShipTo.lat))
                    setShipToLng(String(full.suggestedShipTo.lng))
                }
                // Weight / L × W × H prefilled from the Material Master physical fields.
                const sm = full.suggestedMeasurements
                setSealWeight(sm?.weightKg ? String(sm.weightKg) : '')
                setSealLength(sm?.length ? String(sm.length) : '')
                setSealWidth(sm?.width ? String(sm.width) : '')
                setSealHeight(sm?.height ? String(sm.height) : '')
            } catch {
                pushToast('danger', 'Error', 'Failed to load package details')
                setDetailOpen(false)
            } finally {
                setDetailLoading(false)
            }
        },
        [],
    )

    const refreshDetail = useCallback(async () => {
        if (!detailPkg) return
        try {
            const full = await packingService.get(detailPkg.id)
            setDetailPkg(full)
        } catch {
            pushToast('danger', 'Error', 'Failed to refresh package details')
        }
    }, [detailPkg])

    const handleSeal = useCallback(async () => {
        if (!detailPkg) return
        try {
            await packingService.seal(detailPkg.id, {
                weight: sealWeight.trim() ? Number(sealWeight) : undefined,
                length: sealLength.trim() ? Number(sealLength) : undefined,
                width: sealWidth.trim() ? Number(sealWidth) : undefined,
                height: sealHeight.trim() ? Number(sealHeight) : undefined,
            })
            pushToast(
                'success',
                'Sealed',
                `Package ${detailPkg.packageNumber} sealed.`,
            )
            await refreshDetail()
            fetchPackages()
        } catch (err) {
            pushToast(
                'danger',
                'Error',
                apiErrorMessage(err, 'Seal failed'),
            )
        }
    }, [
        detailPkg,
        sealWeight,
        sealLength,
        sealWidth,
        sealHeight,
        refreshDetail,
        fetchPackages,
    ])

    const handleReadyForDispatch = useCallback(async () => {
        if (!detailPkg) return
        if (!shipToAddress.trim()) {
            pushToast(
                'danger',
                'Ship-to required',
                'Enter a ship-to address before Ready for Dispatch (SCM release).',
            )
            return
        }
        const lat = Number(shipToLat)
        const lng = Number(shipToLng)
        const hasPin =
            shipToLat.trim() !== '' &&
            shipToLng.trim() !== '' &&
            Number.isFinite(lat) &&
            Number.isFinite(lng)
        try {
            const result = await packingService.readyForDispatch(detailPkg.id, {
                shipToName: shipToName.trim() || undefined,
                shipToAddress: shipToAddress.trim(),
                ...(hasPin ? { shipToLat: lat, shipToLng: lng } : {}),
            })
            if (result.scmReleaseError) {
                pushToast(
                    'warning',
                    'Ready — SCM release failed',
                    `${result.scmReleaseError}. Use Retry SCM release.`,
                )
            } else if (result.scmShipment) {
                pushToast(
                    'success',
                    'Ready + SCM shipment',
                    `Package ready. Shipment ${result.scmShipment.reference} created.`,
                )
            } else {
                pushToast(
                    'success',
                    'Ready',
                    `Package ${detailPkg.packageNumber} ready for dispatch.`,
                )
            }
            await refreshDetail()
            fetchPackages()
        } catch (err) {
            pushToast(
                'danger',
                'Error',
                apiErrorMessage(err, 'Ready-for-dispatch failed'),
            )
        }
    }, [detailPkg, shipToName, shipToAddress, shipToLat, shipToLng, refreshDetail, fetchPackages])

    const openShipToMap = useCallback(() => {
        setShipToMapOpen(true)
    }, [])

    const confirmShipToPin = useCallback((lat: number, lng: number) => {
        setShipToLat(String(lat))
        setShipToLng(String(lng))
        setShipToMapOpen(false)
        pushToast(
            'success',
            'Pin set',
            `Delivery pin updated (${lat.toFixed(5)}, ${lng.toFixed(5)}).`,
        )
    }, [])

    const handleRetryScmRelease = useCallback(async () => {
        if (!detailPkg) return
        try {
            const result = await packingService.retryScmRelease(detailPkg.id)
            pushToast(
                'success',
                'SCM released',
                result.scmShipment
                    ? `Shipment ${result.scmShipment.reference}`
                    : 'Release OK',
            )
            await refreshDetail()
            fetchPackages()
        } catch (err) {
            pushToast(
                'danger',
                'SCM release failed',
                apiErrorMessage(err, 'Retry failed'),
            )
        }
    }, [detailPkg, refreshDetail, fetchPackages])

    const handleDispatch = useCallback(async () => {
        if (!detailPkg) return
        try {
            await packingService.dispatch(detailPkg.id)
            pushToast(
                'success',
                'Dispatched',
                `Package ${detailPkg.packageNumber} dispatched.`,
            )
            await refreshDetail()
            fetchPackages()
        } catch (err) {
            pushToast(
                'danger',
                'Error',
                apiErrorMessage(err, 'Dispatch failed'),
            )
        }
    }, [detailPkg, refreshDetail, fetchPackages])

    const handleCheckBoxChange = useCallback(
        (checked: boolean, row: WmPackage) => {
            setSelectedRows((prev) => {
                const next = new Set(prev)
                checked ? next.add(row.id) : next.delete(row.id)
                return next
            })
        },
        [],
    )
    const handleSelectAllChange = useCallback(
        (checked: boolean, rows: { original: WmPackage }[]) => {
            setSelectedRows((prev) => {
                const next = new Set(prev)
                for (const r of rows) {
                    checked
                        ? next.add(r.original.id)
                        : next.delete(r.original.id)
                }
                return next
            })
        },
        [],
    )
    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            await Promise.all(
                Array.from(selectedRows).map((id) => packingService.get(id)),
            )
            pushToast(
                'success',
                'Bulk delete',
                `${selectedRows.size} package(s) deleted.`,
            )
            setSelectedRows(new Set())
            setBulkDeleteOpen(false)
            fetchPackages()
        } catch {
            pushToast('danger', 'Error', 'Some deletions failed')
        } finally {
            setBulkDeleting(false)
        }
    }, [selectedRows, fetchPackages])

    const columns = useMemo<ColumnDef<WmPackage>[]>(
        () => [
            {
                header: 'Package',
                accessorKey: 'packageNumber',
                size: 160,
                minSize: 140,
                cell: ({ row }) => (
                    <WmDocNumberCell
                        primary={row.original.packageNumber}
                        secondary={
                            row.original.packageType
                                ? row.original.packageType
                                : row.original.warehouse?.code ?? undefined
                        }
                        icon="pack"
                        onClick={() => openDetail(row.original)}
                    />
                ),
            },
            {
                header: 'Sales order',
                id: 'orderNumber',
                size: 130,
                minSize: 110,
                cell: ({ row }) => {
                    const order =
                        row.original.salesOrder ??
                        row.original.pickingTask?.salesOrder
                    const orderNo =
                        row.original.orderNumber ??
                        order?.orderNumber ??
                        null
                    return <WmSalesOrderChip orderNumber={orderNo} />
                },
            },
            {
                header: 'Customer',
                id: 'customer',
                size: 180,
                minSize: 140,
                cell: ({ row }) => {
                    const order =
                        row.original.salesOrder ??
                        row.original.pickingTask?.salesOrder
                    const name =
                        order?.customerName ||
                        order?.shipToName ||
                        row.original.shipToName ||
                        null
                    return (
                        <WmPartyCell
                            name={name}
                            subtitle={order?.shipToCity ?? undefined}
                        />
                    )
                },
            },
            {
                header: 'Pack progress',
                id: 'packProgress',
                size: 128,
                minSize: 108,
                cell: ({ row }) => {
                    const expected = packageExpectedTotal(row.original)
                    const scanned = packageScannedTotal(row.original)
                    return (
                        <WmProgressQtyCell
                            done={scanned}
                            total={expected}
                            label="Scanned"
                            tone="pack"
                        />
                    )
                },
            },
            {
                header: 'Lines',
                id: 'totalItems',
                size: 100,
                minSize: 88,
                cell: ({ row }) => (
                    <WmItemCountBadge
                        count={(row.original.items ?? []).length}
                        label={
                            (row.original.items ?? []).length === 1
                                ? 'line'
                                : 'lines'
                        }
                    />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 140,
                minSize: 120,
                cell: ({ row }) => (
                    <WmAnimatedStatus
                        status={row.original.status}
                        tone={STATUS_TONE[row.original.status] ?? 'default'}
                    />
                ),
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 56,
                cell: ({ row }) => {
                    const p = row.original
                    return (
                        <Dropdown
                            renderTitle={<EllipsisButton />}
                            placement="bottom-end"
                        >
                            <Dropdown.Item
                                eventKey="view"
                                onClick={() => openDetail(p)}
                            >
                                <HiOutlineEye className="text-base" />
                                <span>View</span>
                            </Dropdown.Item>
                            {(p.status === 'OPEN' ||
                                p.status === 'PACKING') && (
                                <Dropdown.Item
                                    eventKey="verify"
                                    onClick={() => {
                                        openDetail(p)
                                    }}
                                >
                                    <HiOutlineCheckCircle className="text-base" />
                                    <span>Verify</span>
                                </Dropdown.Item>
                            )}
                            {p.status === 'VERIFIED' && (
                                <Dropdown.Item
                                    eventKey="seal"
                                    onClick={() => {
                                        openDetail(p)
                                    }}
                                >
                                    <HiOutlineLockClosed className="text-base" />
                                    <span>Seal</span>
                                </Dropdown.Item>
                            )}
                            {p.status === 'SEALED' && (
                                <Dropdown.Item
                                    eventKey="dispatch"
                                    onClick={() => {
                                        openDetail(p)
                                    }}
                                >
                                    <HiOutlineTruck className="text-base" />
                                    <span>Dispatch</span>
                                </Dropdown.Item>
                            )}
                        </Dropdown>
                    )
                },
            },
        ],
        [openDetail],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Packing"
                description="Manage order-level packages — scan, verify, seal. Quantity mismatch blocks finalization."
                actions={
                    <Button
                        variant="solid"
                        size="sm"
                        icon={<HiOutlinePlus />}
                        onClick={openCreate}
                    >
                        Add Package
                    </Button>
                }
            />
            <Iso9001OutboundWorkflowStrip activeStep={2} />

            <AdaptiveCard className="mt-4">
                <Tabs
                    value={statusTab}
                    onChange={(val) => {
                        setStatusTab(val as string)
                        setPage(1)
                    }}
                >
                    <Tabs.TabList>
                        {STATUS_TABS.map((t) => (
                            <Tabs.TabNav key={t} value={t}>
                                {t === 'All' ? 'All' : t.replace(/_/g, ' ')}
                            </Tabs.TabNav>
                        ))}
                    </Tabs.TabList>
                </Tabs>
            </AdaptiveCard>

            <AdaptiveCard className="mt-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search package #, order…"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setPage(1)
                        }}
                    />
                    <Select<FilterOption>
                        placeholder="Warehouse"
                        options={warehouseOptions}
                        value={warehouseOptions.find(
                            (o) => o.value === warehouseFilter,
                        )}
                        onChange={(opt) => {
                            setWarehouseFilter(opt?.value ?? '')
                            setPage(1)
                        }}
                    />
                </div>

                {selectedRows.size > 0 && (
                    <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">
                            {selectedRows.size} item
                            {selectedRows.size > 1 ? 's' : ''} selected
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            <Button
                                size="xs"
                                onClick={() => setSelectedRows(new Set())}
                            >
                                Clear
                            </Button>
                            <Button
                                size="xs"
                                variant="solid"
                                customColorClass={() =>
                                    'bg-red-500 hover:bg-red-600 text-white'
                                }
                                icon={<HiOutlineTrash />}
                                onClick={() => setBulkDeleteOpen(true)}
                            >
                                Delete selected
                            </Button>
                        </div>
                    </div>
                )}

                <div className="mt-4">
                    <DataTable<WmPackage>
                        columns={columns}
                        data={packages}
                        compact
                        fit
                        loading={loading}
                        getRowId={(row) => row.id}
                        rowClassName={(_, index) => wmTableRowEnterClass(index)}
                        selectable
                        checkboxChecked={(row) => selectedRows.has(row.id)}
                        onCheckBoxChange={handleCheckBoxChange}
                        onIndeterminateCheckBoxChange={(checked, rows) =>
                            handleSelectAllChange(
                                checked,
                                rows as { original: WmPackage }[],
                            )
                        }
                        noData={!loading && packages.length === 0}
                        pagingData={{
                            total: meta.total,
                            pageIndex: page,
                            pageSize,
                        }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => {
                            setPageSize(size)
                            setPage(1)
                        }}
                    />
                </div>
            </AdaptiveCard>

            {/* Create Package Dialog */}
            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                size="lg"
                title="Add Manual Package"
                icon={<HiOutlineCube />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            onClick={handleCreateSave}
                            disabled={
                                !createForm.warehouseId ||
                                createForm.items.length === 0
                            }
                        >
                            Create
                        </Button>
                    </>
                }
            >
                <FormItem label="Warehouse" asterisk>
                    <Select<FilterOption>
                        placeholder="Select warehouse"
                        options={warehouses.map((w) => ({
                            value: w.id,
                            label: `${w.code} — ${w.name}`,
                        }))}
                        value={
                            warehouses
                                .filter((w) => w.id === createForm.warehouseId)
                                .map((w) => ({
                                    value: w.id,
                                    label: `${w.code} — ${w.name}`,
                                }))[0]
                        }
                        onChange={(opt) =>
                            setCreateForm({
                                ...createForm,
                                warehouseId: opt?.value ?? '',
                            })
                        }
                    />
                </FormItem>
                <div className="grid grid-cols-2 gap-3">
                    <FormItem label="Order Number">
                        <Input
                            value={createForm.orderNumber}
                            onChange={(e) =>
                                setCreateForm({
                                    ...createForm,
                                    orderNumber: e.target.value,
                                })
                            }
                            placeholder="Optional"
                        />
                    </FormItem>
                    <FormItem label="Package Type">
                        <Input
                            value={createForm.packageType}
                            onChange={(e) =>
                                setCreateForm({
                                    ...createForm,
                                    packageType: e.target.value,
                                })
                            }
                            placeholder="e.g. BOX, PALLET"
                        />
                    </FormItem>
                </div>
                <div className="mt-3">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Items ({createForm.items.length})
                        </p>
                        <Button
                            size="xs"
                            icon={<HiOutlinePlus />}
                            onClick={addItem}
                        >
                            Add item
                        </Button>
                    </div>
                    {createForm.items.length > 0 && (
                        <div className="mt-2 space-y-2">
                            {createForm.items.map((item, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-end gap-2 rounded-lg border border-gray-200 p-2 dark:border-gray-600"
                                >
                                    <div className="flex-1">
                                        <FormItem label="Material" asterisk>
                                            <Select<FilterOption>
                                                size="sm"
                                                placeholder="Select material"
                                                options={materialOptions}
                                                value={materialOptions.find(
                                                    (o) =>
                                                        o.value ===
                                                        item.materialId,
                                                )}
                                                onChange={(opt) =>
                                                    updateItem(
                                                        idx,
                                                        'materialId',
                                                        opt?.value ?? '',
                                                    )
                                                }
                                            />
                                        </FormItem>
                                    </div>
                                    <div className="w-28">
                                        <FormItem label="Qty" asterisk>
                                            <Input
                                                size="sm"
                                                type="number"
                                                min={1}
                                                value={item.expectedQty}
                                                onChange={(e) =>
                                                    updateItem(
                                                        idx,
                                                        'expectedQty',
                                                        Number(e.target.value),
                                                    )
                                                }
                                            />
                                        </FormItem>
                                    </div>
                                    <Button
                                        size="xs"
                                        shape="circle"
                                        icon={<HiOutlineTrash />}
                                        onClick={() => removeItem(idx)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </FormDialog>

            {/* Package Detail Modal */}
            <FormDialog
                isOpen={detailOpen}
                onClose={() => {
                    setDetailOpen(false)
                    setDetailPkg(null)
                }}
                width={1024}
                title="Pack shipment"
                description={
                    detailPkg
                        ? `Scan and verify every line, then complete packing before seal and dispatch.`
                        : undefined
                }
                icon={<HiOutlineCube />}
                headerExtra={
                    detailPkg ? (
                        <span className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-300">
                            {detailPkg.packageNumber}
                        </span>
                    ) : undefined
                }
                bodyClassName="max-h-[min(72vh,820px)] overflow-y-auto overflow-x-hidden"
                footerClassName="!justify-between"
                footer={
                    detailPkg && !detailLoading ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                {detailPkg.status === 'VERIFIED' && (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        icon={<HiOutlineLockClosed />}
                                        onClick={handleSeal}
                                    >
                                        Seal
                                    </Button>
                                )}
                                {detailPkg.status === 'SEALED' && (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        icon={<HiOutlineTruck />}
                                        onClick={handleDispatch}
                                    >
                                        Dispatch
                                    </Button>
                                )}
                            </div>
                            <Button
                                size="sm"
                                onClick={() => {
                                    setDetailOpen(false)
                                    setDetailPkg(null)
                                }}
                            >
                                Close
                            </Button>
                        </>
                    ) : (
                        <Button
                            size="sm"
                            onClick={() => {
                                setDetailOpen(false)
                                setDetailPkg(null)
                            }}
                        >
                            Close
                        </Button>
                    )
                }
            >
                {detailLoading && (
                    <p className="py-8 text-center text-sm text-gray-400">
                        Loading…
                    </p>
                )}
                {detailPkg && !detailLoading && (
                    <div className="space-y-5">
                        {detailPkg.weight ||
                        detailPkg.carrier ||
                        detailPkg.trackingNumber ? (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {detailPkg.weight ? (
                                    <InfoCard
                                        label="Weight"
                                        value={`${detailPkg.weight} kg`}
                                    />
                                ) : null}
                                {detailPkg.length ? (
                                    <InfoCard
                                        label="Dimensions"
                                        value={`${detailPkg.length}×${detailPkg.width}×${detailPkg.height}`}
                                    />
                                ) : null}
                                {detailPkg.carrier ? (
                                    <InfoCard
                                        label="Carrier"
                                        value={detailPkg.carrier}
                                    />
                                ) : null}
                                {detailPkg.trackingNumber ? (
                                    <InfoCard
                                        label="Tracking"
                                        value={detailPkg.trackingNumber}
                                    />
                                ) : null}
                            </div>
                        ) : null}

                        <div>
                        <PackagePackingWorkspace
                            pkg={detailPkg}
                            onChanged={refreshDetail}
                            onListChanged={fetchPackages}
                        />

                        {detailPkg.status === 'VERIFIED' && (
                            <div className="mt-4 space-y-2">
                                <div className="flex flex-wrap gap-2 items-center">
                                    <Input
                                        size="sm"
                                        placeholder="Weight (kg)"
                                        value={sealWeight}
                                        onChange={(e) =>
                                            setSealWeight(e.target.value)
                                        }
                                        className="w-24"
                                    />
                                    <Input
                                        size="sm"
                                        placeholder="L"
                                        value={sealLength}
                                        onChange={(e) =>
                                            setSealLength(e.target.value)
                                        }
                                        className="w-16"
                                    />
                                    <Input
                                        size="sm"
                                        placeholder="W"
                                        value={sealWidth}
                                        onChange={(e) =>
                                            setSealWidth(e.target.value)
                                        }
                                        className="w-16"
                                    />
                                    <Input
                                        size="sm"
                                        placeholder="H"
                                        value={sealHeight}
                                        onChange={(e) =>
                                            setSealHeight(e.target.value)
                                        }
                                        className="w-16"
                                    />
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={handleSeal}
                                    >
                                        Seal
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <Input
                                        size="sm"
                                        placeholder="Ship-to name"
                                        value={shipToName}
                                        onChange={(e) =>
                                            setShipToName(e.target.value)
                                        }
                                        className="w-40"
                                    />
                                    <Input
                                        size="sm"
                                        placeholder="Ship-to address (required for SCM)"
                                        value={shipToAddress}
                                        onChange={(e) =>
                                            setShipToAddress(e.target.value)
                                        }
                                        className="min-w-[220px] flex-1"
                                    />
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        icon={<HiOutlineMap />}
                                        onClick={openShipToMap}
                                        title={
                                            shipToLat && shipToLng
                                                ? `Pin: ${shipToLat}, ${shipToLng}`
                                                : 'Set the delivery pin on the map'
                                        }
                                    >
                                        View on Map
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleReadyForDispatch}
                                    >
                                        Ready for Dispatch
                                    </Button>
                                </div>
                            </div>
                        )}

                        {(detailPkg.status === 'SEALED' ||
                            detailPkg.status === 'READY_FOR_DISPATCH') && (
                            <div className="mt-4 space-y-2">
                                <div className="flex flex-wrap gap-2 items-center">
                                    <Input
                                        size="sm"
                                        placeholder="Ship-to name"
                                        value={shipToName}
                                        onChange={(e) =>
                                            setShipToName(e.target.value)
                                        }
                                        className="w-40"
                                    />
                                    <Input
                                        size="sm"
                                        placeholder="Ship-to address (required for SCM)"
                                        value={shipToAddress}
                                        onChange={(e) =>
                                            setShipToAddress(e.target.value)
                                        }
                                        className="min-w-[220px] flex-1"
                                    />
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 items-center">
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        icon={<HiOutlineMap />}
                                        onClick={openShipToMap}
                                        title={
                                            shipToLat && shipToLng
                                                ? `Pin: ${shipToLat}, ${shipToLng}`
                                                : 'Set the delivery pin on the map'
                                        }
                                    >
                                        View on Map
                                    </Button>
                                    <Input
                                        size="sm"
                                        placeholder="Carrier"
                                        value={dispatchCarrier}
                                        onChange={(e) =>
                                            setDispatchCarrier(e.target.value)
                                        }
                                        className="w-32"
                                    />
                                    <Input
                                        size="sm"
                                        placeholder="Tracking #"
                                        value={dispatchTracking}
                                        onChange={(e) =>
                                            setDispatchTracking(e.target.value)
                                        }
                                        className="w-40"
                                    />
                                    {detailPkg.status === 'SEALED' && (
                                        <Button
                                            size="sm"
                                            onClick={handleReadyForDispatch}
                                        >
                                            Ready for Dispatch
                                        </Button>
                                    )}
                                    {detailPkg.status ===
                                        'READY_FOR_DISPATCH' && (
                                        <Button
                                            size="sm"
                                            onClick={handleRetryScmRelease}
                                        >
                                            Retry SCM release
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        icon={<HiOutlineTruck />}
                                        onClick={handleDispatch}
                                    >
                                        Dispatch
                                    </Button>
                                </div>
                                {detailPkg.scmShipment ? (
                                    <p className="text-xs text-gray-500">
                                        SCM shipment{' '}
                                        <a
                                            className="text-primary hover:underline"
                                            href={`/scm/shipments`}
                                        >
                                            {detailPkg.scmShipment.reference}
                                        </a>
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>
                    </div>
                )}
            </FormDialog>

            <ShipToMapDialog
                isOpen={shipToMapOpen}
                latitude={
                    shipToLat.trim() !== '' ? Number(shipToLat) : null
                }
                longitude={
                    shipToLng.trim() !== '' ? Number(shipToLng) : null
                }
                onClose={() => setShipToMapOpen(false)}
                onConfirm={confirmShipToPin}
            />

            {/* Bulk delete confirm */}
            <ConfirmDialog
                isOpen={bulkDeleteOpen}
                type="danger"
                title={`Delete ${selectedRows.size} package(s)?`}
                confirmText={`Delete ${selectedRows.size}`}
                onRequestClose={() => setBulkDeleteOpen(false)}
                onCancel={() => setBulkDeleteOpen(false)}
                onConfirm={handleBulkDelete}
                confirmButtonProps={{
                    loading: bulkDeleting,
                    customColorClass: () =>
                        'bg-red-500 hover:bg-red-500/90 text-white',
                }}
            >
                <p>
                    Are you sure you want to delete{' '}
                    <span className="font-semibold">{selectedRows.size}</span>{' '}
                    selected package{selectedRows.size > 1 ? 's' : ''}?
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default PackingPage
