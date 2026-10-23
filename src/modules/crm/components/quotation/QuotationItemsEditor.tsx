'use client'

import type { ReactNode } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import classNames from '@/utils/classNames'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import type {
    ProductLineInput,
    Quotation,
    QuotationLineStock,
    QuotationSectionInput,
} from '@/modules/sd/services/quotationService'
import CrmSelect from '../CrmSelect'
import {
    catalogEstimate,
    emptyProductLine,
    productLinesFrom,
    productOptionsFor,
    type ProductLineForm,
} from '../ProductLinesEditor'
import StockChip from './StockChip'

export const SECTION_TITLE_MAX = 120

/** One row of the quotation: a free-text heading or a product line, in document order. */
export type QuoteItem = { kind: 'SECTION'; key: number; title: string } | ({ kind: 'LINE' } & ProductLineForm)

let sectionKey = 0
export const emptySection = (): QuoteItem => ({ kind: 'SECTION', key: --sectionKey, title: '' })
const lineItem = (line: ProductLineForm): QuoteItem => ({ kind: 'LINE', ...line })

/** Rebuilds the ordered list: each heading sits above the line numbered `beforeLineNumber`. */
export function itemsFromQuotation(quotation?: Quotation): QuoteItem[] {
    if (!quotation) return [lineItem(emptyProductLine())]
    const headings = new Map((quotation.sections ?? []).map((s) => [s.beforeLineNumber, s.title]))
    const lines = productLinesFrom(quotation.lines)
    return lines.flatMap((line, i) => {
        const title = headings.get(i + 1)
        return title !== undefined ? [{ ...emptySection(), title } as QuoteItem, lineItem(line)] : [lineItem(line)]
    })
}

export const itemLines = (items: QuoteItem[]): ProductLineForm[] =>
    items.flatMap((item) => (item.kind === 'LINE' ? [item] : []))

/** API body: chosen product lines in order, and each heading above the next chosen line. */
export function itemsToInput(items: QuoteItem[]): { lines: ProductLineInput[]; sections: QuotationSectionInput[] } {
    const lines: ProductLineInput[] = []
    const sections: QuotationSectionInput[] = []
    for (const item of items) {
        if (item.kind === 'SECTION') {
            sections.push({ title: item.title.trim(), beforeLineNumber: lines.length + 1 })
        } else if (item.productId) {
            lines.push({ productId: item.productId, quantity: Number(item.quantity) })
        }
    }
    return { lines, sections }
}

/** First reason the list cannot be saved, or null (headings are checked like SD does). */
export function itemsProblem(items: QuoteItem[]): string | null {
    const { lines, sections } = itemsToInput(items)
    if (lines.length === 0) return 'Add at least one product line.'
    if (lines.some((l) => !(l.quantity > 0))) return 'Every line needs a quantity above zero.'
    if (sections.some((s) => !s.title)) return 'Give every section a title (or remove it).'
    if (sections.some((s) => s.beforeLineNumber > lines.length)) return 'Put at least one product line under each section.'
    if (new Set(sections.map((s) => s.beforeLineNumber)).size !== sections.length) {
        return 'Put at least one product line under each section.'
    }
    return null
}

type QuotationItemsEditorProps = {
    products: SdProductRecord[]
    loading?: boolean
    items: QuoteItem[]
    onChange: (items: QuoteItem[]) => void
    /** Per-product notes (e.g. unavailable product); the row is highlighted. */
    highlights?: Record<string, ReactNode>
    stock: Map<string, QuotationLineStock>
    stockLoading?: boolean
}

/**
 * Quotation lines with free-text section headings. Headings are not priced and only group the
 * lines below them; stock chips are indicative and never block saving or sending.
 */
export default function QuotationItemsEditor({
    products,
    loading,
    items,
    onChange,
    highlights,
    stock,
    stockLoading,
}: QuotationItemsEditorProps) {
    const lines = itemLines(items)
    const update = (key: number, patch: Partial<ProductLineForm> | { title: string }) =>
        onChange(items.map((item) => (item.key === key ? ({ ...item, ...patch } as QuoteItem) : item)))
    const move = (index: number, delta: -1 | 1) => {
        const target = index + delta
        if (target < 0 || target >= items.length) return
        const next = [...items]
        ;[next[index], next[target]] = [next[target], next[index]]
        onChange(next)
    }
    const remove = (key: number) => onChange(items.filter((item) => item.key !== key))

    const controls = (index: number, item: QuoteItem, canRemove: boolean) => (
        <div className="flex shrink-0 items-center">
            <Button size="xs" variant="plain" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                ↑
            </Button>
            <Button
                size="xs"
                variant="plain"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
                aria-label="Move down"
            >
                ↓
            </Button>
            <Button size="xs" variant="plain" disabled={!canRemove} onClick={() => remove(item.key)}>
                Remove
            </Button>
        </div>
    )

    return (
        <>
            <div className="flex flex-col gap-2">
                {items.map((item, index) => {
                    if (item.kind === 'SECTION') {
                        return (
                            <div
                                key={item.key}
                                className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-700/40"
                            >
                                <Input
                                    className="flex-1 font-semibold"
                                    size="sm"
                                    maxLength={SECTION_TITLE_MAX}
                                    placeholder="Section title, e.g. Main units"
                                    value={item.title}
                                    onChange={(e) => update(item.key, { title: e.target.value })}
                                />
                                {controls(index, item, true)}
                            </div>
                        )
                    }
                    const note = item.productId ? highlights?.[item.productId] : undefined
                    return (
                        <div
                            key={item.key}
                            className={classNames(
                                'flex flex-col gap-1',
                                note != null && 'rounded-lg bg-amber-50 p-2 dark:bg-amber-500/10',
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <CrmSelect
                                    className="flex-1"
                                    options={productOptionsFor(products, lines, item, loading)}
                                    value={item.productId}
                                    isLoading={loading}
                                    placeholder="Select SD product"
                                    onChange={(id) => update(item.key, { productId: id, sku: undefined })}
                                />
                                <Input
                                    className="w-24"
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={item.quantity}
                                    onChange={(e) => update(item.key, { quantity: e.target.value })}
                                />
                                {item.productId ? (
                                    <StockChip stock={stock.get(item.productId)} loading={stockLoading} />
                                ) : null}
                                {controls(index, item, lines.length > 1)}
                            </div>
                            {note ? <p className="text-xs text-amber-700 dark:text-amber-300">{note}</p> : null}
                        </div>
                    )
                })}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                    <Button size="sm" onClick={() => onChange([...items, lineItem(emptyProductLine())])}>
                        Add line
                    </Button>
                    <Button size="sm" onClick={() => onChange([...items, emptySection()])}>
                        Add section
                    </Button>
                </div>
                <span className="text-right text-xs text-gray-500">
                    Catalog estimate{' '}
                    {catalogEstimate(products, lines).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}
                    ; SD sets the quoted prices and totals. Sections are headings only and carry no price.
                </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
                Stock is indicative (the store company&apos;s warehouses combined); it reserves nothing and
                never blocks saving or sending.
            </p>
        </>
    )
}
