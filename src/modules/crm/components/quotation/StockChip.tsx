import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import type { QuotationLineStock } from '@/modules/sd/services/quotationService'

const CHIP: Record<'OK' | 'LOW' | 'NONE', { label: string; tone: StatusTone }> = {
    OK: { label: 'OK', tone: 'success' },
    LOW: { label: 'Low', tone: 'warning' },
    NONE: { label: 'None', tone: 'danger' },
}

const qty = (value: number | null) => (value === null ? '—' : value.toLocaleString())

function describe(stock: QuotationLineStock | undefined, loading?: boolean) {
    if (!stock) return { label: loading ? 'Stock …' : 'Stock —', tone: 'default' as const, title: loading ? 'Checking stock…' : 'Stock not checked' }
    if (stock.state === 'NOT_TRACKED') {
        return { label: 'Stock —', tone: 'default' as const, title: 'Not stock-tracked (service product or no stock item linked)' }
    }
    if (stock.state === 'UNKNOWN') {
        return { label: 'Stock —', tone: 'default' as const, title: 'Stock could not be read right now' }
    }
    const chip = CHIP[stock.state]
    return {
        label: `Stock ${chip.label}`,
        tone: chip.tone,
        title: `${qty(stock.availableBaseQty)} available, ${qty(stock.requiredBaseQty)} needed (base unit, all warehouses). Indicative only; nothing is reserved.`,
    }
}

/** Indicative stock for one line (internal only; never on the customer PDF, never blocks). */
export default function StockChip({ stock, loading }: { stock?: QuotationLineStock; loading?: boolean }) {
    const { label, tone, title } = describe(stock, loading)
    return (
        <span className="inline-flex shrink-0" title={title}>
            <StatusBadge tone={tone} className="whitespace-nowrap">
                {label}
            </StatusBadge>
        </span>
    )
}
