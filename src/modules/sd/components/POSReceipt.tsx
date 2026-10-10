import classNames from '@/utils/classNames'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'
import type { POSCheckoutResult } from '../services/posService'
import { branchLabel } from '../catalogs/branchCatalog'

type POSReceiptProps = {
    receipt: POSCheckoutResult
    /** Selected branch name (MM Organization Branch) when available. */
    branchName?: string | null
    className?: string
}

const money = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)

const Divider = () => (
    <div className="my-2 border-t border-dashed border-black" />
)

const Row = ({
    label,
    value,
    bold,
}: {
    label: string
    value: string
    bold?: boolean
}) => (
    <div className={classNames('flex justify-between gap-2', bold && 'font-bold')}>
        <span>{label}</span>
        <span>{value}</span>
    </div>
)

/** 80mm thermal-style receipt; always black on white so it prints the same in dark mode. */
const POSReceipt = ({ receipt, branchName, className }: POSReceiptProps) => {
    const completedAt = new Date(receipt.completedAt)
    const itemCount = receipt.lines.reduce((sum, line) => sum + line.quantity, 0)

    return (
        <div
            className={classNames(
                'mx-auto w-full max-w-[300px] bg-white p-3 font-mono text-xs leading-snug text-black',
                className,
            )}
        >
            <div className="text-center">
                <div className="text-sm font-bold uppercase">
                    {AWIC_BRAND.shortName}
                </div>
                <div>{AWIC_BRAND.fullName}</div>
                <div className="mt-1">OFFICIAL RECEIPT</div>
            </div>
            <Divider />
            <Row label="Branch" value={branchLabel(receipt.branchId, branchName)} />
            <Row label="Receipt #" value={receipt.receiptId} />
            <Row label="Date" value={completedAt.toLocaleDateString('en-PH')} />
            <Row label="Time" value={completedAt.toLocaleTimeString('en-PH')} />
            <Divider />
            {receipt.lines.map((line) => (
                <div key={line.sku} className="mb-1.5">
                    <div className="break-words">{line.name}</div>
                    {line.variantName ? (
                        <div className="break-words text-[10px]">
                            Variant: {line.variantName}
                        </div>
                    ) : null}
                    <Row
                        label={`  ${line.quantity} x ${money(line.unitPrice)}`}
                        value={money(line.lineTotal)}
                    />
                </div>
            ))}
            <Divider />
            <Row label={`Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})`} value={money(receipt.subtotal)} />
            <Row label="TOTAL" value={`PHP ${money(receipt.orderTotal)}`} bold />
            <Divider />
            <Row label="Cash" value={money(receipt.paymentReceived)} />
            <Row label="Change" value={money(receipt.change)} />
            <Divider />
            <div className="text-center">
                <div>Thank you for shopping!</div>
                <div className="mt-1 text-[10px]">{receipt.receiptId}</div>
            </div>
        </div>
    )
}

export default POSReceipt
