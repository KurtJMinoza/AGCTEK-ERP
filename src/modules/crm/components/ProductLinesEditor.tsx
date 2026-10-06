'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import classNames from '@/utils/classNames'
import {
    listProducts,
    type SdProductRecord,
} from '@/modules/sd/services/productCatalogService'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import CrmSelect from './CrmSelect'
import type { ProductLineInput, QuotationLine } from '../types'

export type ProductLineForm = {
    key: number
    productId: string | null
    quantity: string
    /** Shown when the product is missing from the active catalog (inactive or deleted). */
    sku?: string
}

let lineKey = 0
export const emptyProductLine = (): ProductLineForm => ({ key: ++lineKey, productId: null, quantity: '1' })

export const productLinesFrom = (lines: QuotationLine[]): ProductLineForm[] =>
    lines.length
        ? lines.map((l) => ({ key: ++lineKey, productId: l.productId, quantity: String(Number(l.quantity)), sku: l.sku }))
        : [emptyProductLine()]

export const chosenProductLines = (lines: ProductLineForm[]) => lines.filter((l) => l.productId)

export const productLinesValid = (lines: ProductLineForm[]) => {
    const chosen = chosenProductLines(lines)
    return chosen.length > 0 && chosen.every((l) => Number(l.quantity) > 0)
}

export const toProductLineInputs = (lines: ProductLineForm[]): ProductLineInput[] =>
    chosenProductLines(lines).map((l) => ({ productId: l.productId!, quantity: Number(l.quantity) }))

/** Active SD catalog products, loaded while `enabled`. */
export function useSdCatalog(enabled: boolean) {
    const [products, setProducts] = useState<SdProductRecord[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!enabled) return
        let active = true
        setLoading(true)
        setError(null)
        listProducts({ activeOnly: true })
            .then((rows) => active && setProducts(rows))
            .catch((err) => active && setError(getApiErrorMessage(err, 'Unable to load SD products')))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [enabled])

    return { products, loading, error }
}

type ProductLinesEditorProps = {
    products: SdProductRecord[]
    loading?: boolean
    lines: ProductLineForm[]
    onChange: (lines: ProductLineForm[]) => void
    disabled?: boolean
    /** Per-product notes (e.g. changed price, unavailable product); the row is highlighted. */
    highlights?: Record<string, ReactNode>
    /** Text after the catalog estimate, e.g. who sets the final price. */
    estimateNote?: ReactNode
}

/**
 * SD catalog product lines (product + quantity) shared by quotations and the Closed Won handoff.
 * One sales division per document; each product once. The estimate is display only — SD prices.
 */
export default function ProductLinesEditor({
    products,
    loading,
    lines,
    onChange,
    disabled,
    highlights,
    estimateNote,
}: ProductLinesEditorProps) {
    const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
    const division = lines
        .map((l) => (l.productId ? byId.get(l.productId)?.divisionId : undefined))
        .find(Boolean)

    const optionsFor = (line: ProductLineForm) => {
        const options = products
            .filter((p) => !division || p.divisionId === division)
            .filter((p) => p.id === line.productId || !lines.some((l) => l.productId === p.id))
            .map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` }))
        return line.productId && !byId.has(line.productId) && !loading
            ? [{ value: line.productId, label: `${line.sku ?? line.productId} (no longer sold)` }, ...options]
            : options
    }

    const setLine = (key: number, patch: Partial<ProductLineForm>) =>
        onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))

    const estimate = lines.reduce((sum, l) => {
        const product = l.productId ? byId.get(l.productId) : undefined
        const qty = Number(l.quantity)
        return product && qty > 0 ? sum + product.price * qty : sum
    }, 0)

    return (
        <>
            <div className="flex flex-col gap-2">
                {lines.map((line) => {
                    const note = line.productId ? highlights?.[line.productId] : undefined
                    return (
                        <div
                            key={line.key}
                            className={classNames(
                                'flex flex-col gap-1',
                                note != null && 'rounded-lg bg-amber-50 p-2 dark:bg-amber-500/10',
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <CrmSelect
                                    className="flex-1"
                                    options={optionsFor(line)}
                                    value={line.productId}
                                    isLoading={loading}
                                    isDisabled={disabled}
                                    placeholder="Select SD product"
                                    onChange={(id) => setLine(line.key, { productId: id, sku: undefined })}
                                />
                                <Input
                                    className="w-28"
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={line.quantity}
                                    disabled={disabled}
                                    onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                                />
                                <Button
                                    size="sm"
                                    variant="plain"
                                    disabled={disabled || lines.length === 1}
                                    onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                                >
                                    Remove
                                </Button>
                            </div>
                            {note ? <p className="text-xs text-amber-700 dark:text-amber-300">{note}</p> : null}
                        </div>
                    )
                })}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
                <Button size="sm" disabled={disabled} onClick={() => onChange([...lines, emptyProductLine()])}>
                    Add line
                </Button>
                <span className="text-right text-xs text-gray-500">
                    Catalog estimate{' '}
                    {estimate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {estimateNote ? <>; {estimateNote}</> : null}
                </span>
            </div>
            {division ? (
                <p className="mt-1 text-xs text-gray-500">One document covers one sales division ({division}).</p>
            ) : null}
        </>
    )
}
