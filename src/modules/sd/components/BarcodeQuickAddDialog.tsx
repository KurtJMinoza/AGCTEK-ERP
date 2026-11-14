'use client'

import { useCallback, useEffect, useState } from 'react'
import { HiOutlineCamera } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    materialCategoryService,
    orgService,
    uomService,
} from '@/modules/mm/material-master/services/referenceService'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import {
    lookupProductBarcode,
    quickAddProductByBarcode,
    type BarcodeLookup,
    type QuickAddResult,
} from '../services/productBarcodeService'

type Props = {
    isOpen: boolean
    initialBarcode?: string
    companyId?: string
    divisionId?: string
    onClose: () => void
    onCreated?: (result: QuickAddResult) => void
}

type Option = { value: string; label: string }

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const money = (value: number) =>
    value.toLocaleString(undefined, { minimumFractionDigits: 2 })

/**
 * Shared barcode entry point: MM Material Master, SD Product Catalog, POS.
 *
 * A found material is shown with its live MM availability and its catalog
 * listing. A material that is not yet listed is added to the catalog by
 * referencing the existing material. An unknown barcode registers the MM
 * material first, then the SD listing — never the reverse.
 */
const BarcodeQuickAddDialog = ({
    isOpen,
    initialBarcode = '',
    companyId: fixedCompanyId,
    divisionId = RETAIL_DIVISION_ID,
    onClose,
    onCreated,
}: Props) => {
    const [barcode, setBarcode] = useState(initialBarcode)
    const [result, setResult] = useState<BarcodeLookup | null>(null)
    const [companies, setCompanies] = useState<Option[]>([])
    const [companyId, setCompanyId] = useState(fixedCompanyId ?? '')
    const [categories, setCategories] = useState<Option[]>([])
    const [uoms, setUoms] = useState<Option[]>([])
    const [warehouses, setWarehouses] = useState<Option[]>([])
    const [categoryId, setCategoryId] = useState('')
    const [uomId, setUomId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [productName, setProductName] = useState('')
    const [brand, setBrand] = useState('')
    const [unitCost, setUnitCost] = useState('')
    const [srp, setSrp] = useState('')
    const [storageBin, setStorageBin] = useState('')
    const [initialStock, setInitialStock] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const lookup = useCallback(
        async (code: string) => {
            const value = code.trim()
            if (!value) return
            setBusy(true)
            setError(null)
            try {
                setResult(await lookupProductBarcode(value, companyId || undefined))
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : 'Unable to look up the barcode',
                )
            } finally {
                setBusy(false)
            }
        },
        [companyId],
    )

    useEffect(() => {
        if (!isOpen) return
        setResult(null)
        setError(null)
        setProductName('')
        setBrand('')
        setUnitCost('')
        setSrp('')
        setStorageBin('')
        setInitialStock('')
        setBarcode(initialBarcode)
        if (!fixedCompanyId) {
            orgService
                .companies()
                .then((rows) => {
                    const options = rows.map((c) => ({
                        value: c.id,
                        label: `${c.name} (${c.code})`,
                    }))
                    setCompanies(options)
                    setCompanyId((current) => current || options[0]?.value || '')
                })
                .catch(() => setCompanies([]))
        }
        materialCategoryService
            .list()
            .then((rows) =>
                setCategories(
                    rows
                        .filter((row) => row.isActive !== false)
                        .map((row) => ({ value: row.id, label: row.name })),
                ),
            )
            .catch(() => setCategories([]))
        uomService
            .list()
            .then((rows) =>
                setUoms(
                    rows
                        .filter((row) => row.isActive !== false)
                        .map((row) => ({ value: row.id, label: row.code })),
                ),
            )
            .catch(() => setUoms([]))
        if (initialBarcode) void lookup(initialBarcode)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialBarcode, fixedCompanyId])

    useEffect(() => {
        if (!companyId) {
            setWarehouses([])
            return
        }
        orgService
            .warehouses(companyId)
            .then((rows) =>
                setWarehouses(
                    rows.map((row) => ({
                        value: row.id,
                        label: `${row.code} — ${row.name}`,
                    })),
                ),
            )
            .catch(() => setWarehouses([]))
    }, [companyId])

    const handleAddExistingToListing = async () => {
        if (!result?.material) return
        const price = Number(srp)
        if (!Number.isFinite(price) || price < 0) {
            setError('Enter the selling price (SRP) for the new listing')
            return
        }
        setBusy(true)
        setError(null)
        try {
            const created = await quickAddProductByBarcode({
                barcode: barcode.trim(),
                srp: price,
                companyId: companyId,
                divisionId,
            })
            notify('success', 'Added to catalog', `${result.material.name} is now listed.`)
            onCreated?.(created)
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to add the listing')
        } finally {
            setBusy(false)
        }
    }

    const handleQuickAdd = async () => {
        const price = Number(srp)
        if (!productName.trim()) {
            setError('Material name is required')
            return
        }
        if (!categoryId) {
            setError('Select the material category')
            return
        }
        if (!uomId) {
            setError('Select the unit of measure')
            return
        }
        if (!Number.isFinite(price) || price <= 0) {
            setError('Enter a selling price greater than zero')
            return
        }
        if (Number(initialStock) > 0 && !warehouseId) {
            setError('Select a warehouse before recording opening stock')
            return
        }
        setBusy(true)
        setError(null)
        try {
            const created = await quickAddProductByBarcode({
                barcode: barcode.trim(),
                productName: productName.trim(),
                categoryId,
                uomId,
                brand: brand.trim() || undefined,
                unitCost: Number(unitCost) || 0,
                srp: price,
                companyId,
                divisionId,
                warehouseId: warehouseId || undefined,
                storageBinId: storageBin.trim() || undefined,
                initialStock: Number(initialStock) || undefined,
            })
            notify(
                'success',
                'Material registered',
                `${productName.trim()} was created in Material Master and listed in the catalog.`,
            )
            if (created.stockWarning) {
                notify('danger', 'Opening stock', created.stockWarning)
            }
            onCreated?.(created)
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to register the material')
        } finally {
            setBusy(false)
        }
    }

    const material = result?.material
    const listed = Boolean(result?.listing)

    const footer = material ? (
        <div className="flex w-full items-center justify-end gap-2">
            <Button size="sm" disabled={busy} onClick={onClose}>
                Close
            </Button>
            {listed ? null : (
                <Button
                    size="sm"
                    variant="solid"
                    loading={busy}
                    onClick={() => void handleAddExistingToListing()}
                >
                    Add to Product Catalog
                </Button>
            )}
        </div>
    ) : result && !result.found ? (
        <div className="flex w-full items-center justify-end gap-2">
            <Button size="sm" disabled={busy} onClick={onClose}>
                Cancel
            </Button>
            <Button
                size="sm"
                variant="solid"
                loading={busy}
                onClick={() => void handleQuickAdd()}
            >
                Register material
            </Button>
        </div>
    ) : null

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={busy ? () => undefined : onClose}
            title="Scan barcode"
            description="One barcode lookup for Material Master, the Product Catalog and POS. The material always comes from MM."
            icon={<HiOutlineCamera />}
            size="lg"
            footer={footer}
        >
            <div className="space-y-4">
                {error ? <Alert showIcon type="danger">{error}</Alert> : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <FormItem label="Barcode" className="flex-1">
                        <Input
                            autoFocus
                            value={barcode}
                            placeholder="Scan or type the barcode"
                            onChange={(e) => {
                                setBarcode(e.target.value)
                                setResult(null)
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void lookup(barcode)
                            }}
                        />
                    </FormItem>
                    <Button
                        size="sm"
                        loading={busy}
                        disabled={!barcode.trim()}
                        onClick={() => void lookup(barcode)}
                    >
                        Look up
                    </Button>
                </div>

                {!fixedCompanyId ? (
                    <FormItem label="Company">
                        <Select<Option>
                            options={companies}
                            value={companies.find((c) => c.value === companyId)}
                            onChange={(option) => {
                                setCompanyId(option?.value ?? '')
                                setResult(null)
                            }}
                            isSearchable
                            placeholder="Select company"
                        />
                    </FormItem>
                ) : null}

                {material ? (
                    <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div className="font-semibold text-gray-900 dark:text-gray-100">
                                    {material.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                    {material.materialCode}
                                    {material.sku ? ` · SKU ${material.sku}` : ''}
                                    {material.category ? ` · ${material.category}` : ''}
                                    {material.uom ? ` · ${material.uom}` : ''}
                                </div>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                                <div>Unit cost {money(material.unitCost)}</div>
                                <div>
                                    Available{' '}
                                    {result?.availability?.availableQty ?? 0}
                                </div>
                            </div>
                        </div>

                        {listed ? (
                            <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <div className="font-medium">
                                    Already in Product Catalog
                                </div>
                                <div className="text-xs">
                                    {result?.listing?.productName} ·{' '}
                                    {money(result?.listing?.price ?? 0)} ·{' '}
                                    {result?.listing?.isActive ? 'active' : 'inactive'}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 space-y-2">
                                <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                                    Material found — not yet available in the Product
                                    Catalog. Adding it only creates the listing; no
                                    second material is created.
                                </div>
                                <FormItem label="Selling price (SRP)">
                                    <Input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={srp}
                                        onChange={(e) => setSrp(e.target.value)}
                                    />
                                </FormItem>
                            </div>
                        )}
                    </div>
                ) : null}

                {result && !result.found ? (
                    <div className="space-y-3">
                        <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                            Barcode not found — register the new material below. The
                            MM material is created first; the catalog listing follows.
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <FormItem label="Material name">
                                <Input
                                    value={productName}
                                    onChange={(e) => setProductName(e.target.value)}
                                    placeholder="e.g. Kirkland Vitamin E 400 IU"
                                />
                            </FormItem>
                            <FormItem label="Brand">
                                <Input
                                    value={brand}
                                    onChange={(e) => setBrand(e.target.value)}
                                />
                            </FormItem>
                            <FormItem label="Category">
                                <Select<Option>
                                    options={categories}
                                    value={categories.find(
                                        (c) => c.value === categoryId,
                                    )}
                                    onChange={(option) =>
                                        setCategoryId(option?.value ?? '')
                                    }
                                    isSearchable
                                    placeholder="Select category"
                                />
                            </FormItem>
                            <FormItem label="Unit of measure">
                                <Select<Option>
                                    options={uoms}
                                    value={uoms.find((u) => u.value === uomId)}
                                    onChange={(option) =>
                                        setUomId(option?.value ?? '')
                                    }
                                    isSearchable
                                    placeholder="Select UoM"
                                />
                            </FormItem>
                            <FormItem label="Unit cost">
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={unitCost}
                                    onChange={(e) => setUnitCost(e.target.value)}
                                />
                            </FormItem>
                            <FormItem label="Selling price (SRP)">
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={srp}
                                    onChange={(e) => setSrp(e.target.value)}
                                />
                            </FormItem>
                            <FormItem label="Warehouse (for opening stock)">
                                <Select<Option>
                                    options={warehouses}
                                    value={warehouses.find(
                                        (w) => w.value === warehouseId,
                                    )}
                                    onChange={(option) =>
                                        setWarehouseId(option?.value ?? '')
                                    }
                                    isSearchable
                                    placeholder="Select warehouse"
                                />
                            </FormItem>
                            <FormItem label="Storage location">
                                <Input
                                    value={storageBin}
                                    onChange={(e) => setStorageBin(e.target.value)}
                                    placeholder="Bin code (optional)"
                                />
                            </FormItem>
                            <FormItem label="Initial stock">
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    value={initialStock}
                                    onChange={(e) => setInitialStock(e.target.value)}
                                />
                            </FormItem>
                        </div>
                    </div>
                ) : null}
            </div>
        </FormDialog>
    )
}

export default BarcodeQuickAddDialog
