'use client'

const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(n)

export type MmInventoryCompanyMetricsProps = {
    available: number
    onHand: number
    reserved: number
    maxStock: number
    safetyStock: number
    loading?: boolean
    className?: string
}

const Metric = ({
    label,
    value,
    highlight,
}: {
    label: string
    value: string
    highlight?: boolean
}) => (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {label}
        </p>
        <p
            className={
                highlight
                    ? 'mt-1 text-xl font-bold text-primary tabular-nums'
                    : 'mt-1 text-lg font-semibold tabular-nums heading-text'
            }
        >
            {value}
        </p>
    </div>
)

/** Product Catalog view of live MM ledger quantities and thresholds. */
const MmInventoryCompanyMetrics = ({
    available,
    onHand,
    reserved,
    maxStock,
    safetyStock,
    loading,
    className = '',
}: MmInventoryCompanyMetricsProps) => (
    <div className={className}>
        <h6 className="mb-3 text-sm font-semibold heading-text">
            MM inventory & stock thresholds
        </h6>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric label="On hand" value={loading ? 'Loading...' : fmt(onHand)} />
            <Metric
                label="Available"
                value={loading ? 'Loading...' : fmt(available)}
                highlight
            />
            <Metric label="Reserved" value={loading ? 'Loading...' : fmt(reserved)} />
            <Metric label="Max stock" value={loading ? 'Loading...' : fmt(maxStock)} />
            <Metric label="Safety stock" value={loading ? 'Loading...' : fmt(safetyStock)} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
            Live on-hand, available, and reserved values come from the MM ledger.
            Thresholds come from MM stock settings for the selected warehouse scope.
        </p>
    </div>
)

export default MmInventoryCompanyMetrics
