'use client'

import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import StatusBadge from '@/components/shared/StatusBadge'
import {
    HiOutlineCube,
    HiOutlineTag,
    HiOutlineScale,
    HiOutlineShieldCheck,
    HiOutlineTemplate,
    HiOutlineCurrencyDollar,
    HiOutlineIdentification,
    HiOutlinePencil,
} from 'react-icons/hi'
import type { Material } from '../types'
import type { ReactNode } from 'react'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    ACTIVE: 'success',
    DRAFT: 'default',
    INACTIVE: 'warning',
    BLOCKED: 'danger',
}

type MaterialViewDialogProps = {
    isOpen: boolean
    material: Material | null
    onClose: () => void
    onEdit: (material: Material) => void
}

const MaterialViewDialog = ({ isOpen, material, onClose, onEdit }: MaterialViewDialogProps) => {
    if (!material) return null

    const fmt = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: material.currency?.code || 'USD',
        maximumFractionDigits: 2,
    })

    const description = [
        material.materialCode,
        material.sku ? `SKU: ${material.sku}` : null,
        material.brand ? material.brand : null,
        material.model ? material.model : null,
    ]
        .filter(Boolean)
        .join(' · ')

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            width={760}
            title={
                <span className="inline-flex items-center gap-2">
                    <span className="truncate">{material.materialName}</span>
                    <StatusBadge tone={STATUS_TONE[material.status] ?? 'default'}>{material.status}</StatusBadge>
                </span>
            }
            description={description}
            icon={<HiOutlineCube />}
            footer={
                <>
                    <Button size="sm" onClick={onClose}>Close</Button>
                    <Button size="sm" variant="solid" icon={<HiOutlinePencil />} onClick={() => onEdit(material)}>Edit</Button>
                </>
            }
        >
            <ViewSection title="Classification" icon={<HiOutlineTemplate />}>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Metric label="Type" value={material.materialType?.name ?? '—'} />
                    <Metric label="Category" value={material.materialCategory?.name ?? '—'} />
                    <Metric label="Manufacturer" value={material.manufacturer ?? '—'} />
                </div>
            </ViewSection>

            {(material.description ?? material.shortDescription) && (
                <ViewSection title="Description" icon={<HiOutlineIdentification />}>
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                        {material.description ?? material.shortDescription}
                    </p>
                </ViewSection>
            )}

            <ViewSection title="Units of measure" icon={<HiOutlineScale />}>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Metric label="Base UOM" value={material.baseUom?.code ?? '—'} />
                    <Metric label="Purchase UOM" value={material.purchaseUom?.code ?? '—'} />
                    <Metric label="Sales UOM" value={material.salesUom?.code ?? '—'} />
                </div>
            </ViewSection>

            <ViewSection title="Physical" icon={<HiOutlineCube />}>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Metric label="Weight" value={material.weight ? `${material.weight} ${material.weightUom ?? ''}` : '—'} />
                    <Metric label="Dimensions" value={material.length ? `${material.length}×${material.width}×${material.height} ${material.dimensionUom ?? ''}` : '—'} />
                    <Metric label="Volume" value={material.volume ? `${material.volume} ${material.volumeUom ?? ''}` : '—'} />
                </div>
            </ViewSection>

            <ViewSection title="Tracking" icon={<HiOutlineShieldCheck />}>
                <div className="flex flex-wrap gap-2">
                    <FlagTag label="Batch" active={material.batchManaged} />
                    <FlagTag label="Serial" active={material.serialManaged} />
                    <FlagTag label="QC required" active={material.qualityInspectionRequired} />
                    <FlagTag label="Expiry" active={material.expiryManaged} />
                    <FlagTag label="Inventory" active={material.inventoryManaged} />
                    <FlagTag label="Purchasable" active={material.purchasable} />
                    <FlagTag label="Sellable" active={material.sellable} />
                </div>
            </ViewSection>

            <ViewSection title="Planning" icon={<HiOutlineTag />}>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Metric label="Min stock" value={Number(material.minimumStock).toLocaleString()} />
                    <Metric label="Max stock" value={Number(material.maximumStock).toLocaleString()} />
                    <Metric label="Safety stock" value={Number(material.safetyStock).toLocaleString()} />
                    <Metric label="Reorder point" value={Number(material.reorderPoint).toLocaleString()} />
                    <Metric label="Reorder qty" value={Number(material.reorderQuantity).toLocaleString()} />
                    <Metric label="Lead time" value={`${material.leadTimeDays} days`} />
                    <Metric label="Min order qty" value={Number(material.minimumOrderQuantity).toLocaleString()} />
                </div>
            </ViewSection>

            <ViewSection title="Valuation" icon={<HiOutlineCurrencyDollar />}>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Metric label="Method" value={material.valuationMethod ?? '—'} />
                    <Metric label="Standard cost" value={fmt.format(Number(material.standardCost))} />
                    <Metric label="Currency" value={material.currency?.code ?? '—'} />
                    <Metric label="Valuation class" value={material.valuationClass?.name ?? '—'} />
                    <Metric label="Company" value={material.company?.name ?? '—'} />
                    <Metric label="Warehouse" value={material.defaultWarehouse?.name ?? '—'} />
                </div>
            </ViewSection>
        </FormDialog>
    )
}

const ViewSection = ({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) => (
    <div className="mb-5">
        <div className="mb-3 flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400">{icon}</span>
            <h6 className="text-sm font-semibold heading-text">{title}</h6>
        </div>
        {children}
    </div>
)

const Metric = ({ label, value }: { label: string; value: string }) => (
    <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-0.5 text-sm font-medium heading-text">{value}</p>
    </div>
)

const FlagTag = ({ label, active }: { label: string; active: boolean }) => (
    <Tag className={active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}>
        {label}: {active ? 'Yes' : 'No'}
    </Tag>
)

export default MaterialViewDialog
