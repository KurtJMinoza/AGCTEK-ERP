'use client'

import Button from '@/components/ui/Button'
import type { TransactionKeyCatalogRow } from '../../accountDeterminationTypes'

export type DeterminationDomainSection = {
    id: string
    title: string
    description: string
    predicate: (row: TransactionKeyCatalogRow) => boolean
}

export const DETERMINATION_DOMAIN_SECTIONS: DeterminationDomainSection[] = [
    {
        id: 'mm',
        title: 'MM accounting',
        description: 'Inventory, GR/IR, consumption, revaluation, and variance.',
        predicate: (row) => row.owningModule === 'MM',
    },
    {
        id: 'ap',
        title: 'AP accounting',
        description: 'Supplier reconciliation, advances, discounts, and adjustments.',
        predicate: (row) =>
            row.owningModule === 'AP' ||
            ['SUPPLIER_RECON', 'SUPPLIER_ADVANCE', 'PURCHASE_DISCOUNT'].includes(
                row.code,
            ),
    },
    {
        id: 'ar',
        title: 'AR accounting',
        description: 'Customer reconciliation, advances, refunds, and allowances.',
        predicate: (row) => row.owningModule === 'AR',
    },
    {
        id: 'sd',
        title: 'SD / POS accounting',
        description: 'Revenue, returns, discounts, and tender settlement keys.',
        predicate: (row) =>
            row.owningModule === 'SD' ||
            row.supportedSourceModules?.includes('POS'),
    },
    {
        id: 'tax',
        title: 'Tax accounting',
        description: 'Input/output VAT, withholding, and rounding.',
        predicate: (row) =>
            row.owningModule === 'TAX' || row.accountingCategory === 'TAX',
    },
    {
        id: 'treasury',
        title: 'Cash and bank',
        description: 'Cash, bank, clearing, FX, and payment settlement.',
        predicate: (row) =>
            row.owningModule === 'TREASURY' ||
            row.accountingCategory === 'CASH' ||
            row.accountingCategory === 'TREASURY',
    },
]

export function DeterminationDomainSectionsPanel({
    catalog,
    activeDomainId,
    onSelectDomain,
    onOpenKeys,
}: {
    catalog: TransactionKeyCatalogRow[]
    activeDomainId?: string
    onSelectDomain: (section: DeterminationDomainSection) => void
    onOpenKeys?: (section: DeterminationDomainSection) => void
}) {
    return (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {DETERMINATION_DOMAIN_SECTIONS.map((section) => {
                const keys = catalog.filter(section.predicate)
                const live = keys.filter((row) => row.integrationStatus === 'LIVE').length
                const active = activeDomainId === section.id
                return (
                    <div
                        key={section.id}
                        className={`rounded-xl border p-4 text-sm ${
                            active
                                ? 'border-primary bg-primary/5'
                                : 'border-gray-100 dark:border-gray-700'
                        }`}
                    >
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            {section.title}
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">{section.description}</p>
                        <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                            {keys.length} keys · {live} live
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                                size="xs"
                                variant={active ? 'solid' : 'plain'}
                                onClick={() => onSelectDomain(section)}
                            >
                                Filter rules
                            </Button>
                            {onOpenKeys ? (
                                <Button
                                    size="xs"
                                    variant="plain"
                                    onClick={() => onOpenKeys(section)}
                                >
                                    View keys
                                </Button>
                            ) : null}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}