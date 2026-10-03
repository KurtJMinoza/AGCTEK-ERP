'use client'

const fmt = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 2 })

export type StockThresholdValues = {
    onHand: number
    reserved: number
    maxStock: number
    safetyStock: number
}

const availableQty = (onHand: number, reserved: number) =>
    Math.max(0, onHand - reserved)

type Props = StockThresholdValues & {
    variant?: 'cards' | 'form'
    onHandInput?: React.ReactNode
    reservedInput?: React.ReactNode
    maxStockInput?: React.ReactNode
    safetyStockInput?: React.ReactNode
}

const StockThresholdSummary = ({
    onHand,
    reserved,
    maxStock,
    safetyStock,
    variant = 'cards',
    onHandInput,
    reservedInput,
    maxStockInput,
    safetyStockInput,
}: Props) => {
    const available = availableQty(onHand, reserved)

    if (variant === 'form') {
        return (
            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                {onHandInput ?? (
                    <ReadOnlyField label="On hand" value={fmt(onHand)} hint="Actual qty — source for Product Catalog." />
                )}
                {reservedInput ?? (
                    <ReadOnlyField label="Reserved" value={fmt(reserved)} hint="Reserved against orders." />
                )}
                <ReadOnlyField
                    label="Available"
                    value={fmt(available)}
                    hint="Calculated: On hand − Reserved (sellable)."
                />
                {maxStockInput}
                {safetyStockInput}
            </div>
        )
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <MetricCard label="On hand" value={fmt(onHand)} />
            <MetricCard label="Available" value={fmt(available)} />
            <MetricCard label="Max stock" value={fmt(maxStock)} />
            <MetricCard label="Safety stock" value={fmt(safetyStock)} />
        </div>
    )
}

const ReadOnlyField = ({
    label,
    value,
    hint,
}: {
    label: string
    value: string
    hint?: string
}) => (
    <div>
        <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
        </p>
        <div className="flex h-11 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm tabular-nums text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
            {value}
        </div>
        {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
)

const MetricCard = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {label}
        </p>
        <p className="mt-1 text-lg font-semibold tabular-nums heading-text">{value}</p>
    </div>
)

export default StockThresholdSummary
