'use client'

import classNames from '@/utils/classNames'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'

export type ReceivingReceiptLine = {
    materialCode?: string
    materialName?: string
    quantity: number | string
    uom?: string
    note?: string
}

export type ReceivingReceiptSlipData = {
    kind: 'GOODS_RECEIPT' | 'EXPECTED_RECEIPT'
    documentNumber: string
    status?: string
    documentDate?: string
    postingDate?: string
    expectedDate?: string
    warehouse?: string
    supplier?: string
    poNumber?: string
    stockStatus?: string
    lines: ReceivingReceiptLine[]
    remarks?: string
}

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
        <span className="text-right">{value}</span>
    </div>
)

function fmtDate(iso?: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

function titleForKind(kind: ReceivingReceiptSlipData['kind']) {
    return kind === 'EXPECTED_RECEIPT' ? 'EXPECTED RECEIPT' : 'GOODS RECEIPT'
}

/** Warehouse receiving slip — black on white for consistent printing. */
const ReceivingReceiptSlip = ({
    data,
    className,
}: {
    data: ReceivingReceiptSlipData
    className?: string
}) => {
    const lineCount = data.lines.length
    const qtyTotal = data.lines.reduce((sum, l) => sum + Number(l.quantity || 0), 0)

    return (
        <div
            className={classNames(
                'mx-auto w-full max-w-[320px] bg-white p-4 font-mono text-xs leading-snug text-black',
                className,
            )}
        >
            <div className="text-center">
                <div className="text-sm font-bold uppercase">{AWIC_BRAND.shortName}</div>
                <div className="text-[10px]">{AWIC_BRAND.fullName}</div>
                <div className="mt-2 text-sm font-bold">{titleForKind(data.kind)}</div>
            </div>
            <Divider />
            <Row label="Document #" value={data.documentNumber} bold />
            {data.status ? <Row label="Status" value={data.status} /> : null}
            {data.postingDate ? <Row label="Posting" value={fmtDate(data.postingDate)} /> : null}
            {data.documentDate ? <Row label="Doc date" value={fmtDate(data.documentDate)} /> : null}
            {data.expectedDate ? <Row label="Expected" value={fmtDate(data.expectedDate)} /> : null}
            {data.warehouse ? <Row label="Warehouse" value={data.warehouse} /> : null}
            {data.supplier ? <Row label="Supplier" value={data.supplier} /> : null}
            {data.poNumber ? <Row label="PO #" value={data.poNumber} /> : null}
            {data.stockStatus ? <Row label="Stock" value={data.stockStatus} /> : null}
            <Divider />
            {data.lines.map((line, idx) => {
                const code = line.materialCode ?? ''
                const name = line.materialName ?? 'Material'
                const label = code ? `${code} — ${name}` : name
                return (
                    <div key={`${label}-${idx}`} className="mb-2">
                        <div className="break-words font-semibold">{label}</div>
                        <Row
                            label="Qty"
                            value={`${line.quantity} ${line.uom ?? ''}`.trim()}
                        />
                        {line.note ? <div className="text-[10px] text-gray-700">{line.note}</div> : null}
                    </div>
                )
            })}
            <Divider />
            <Row
                label={`Lines (${lineCount})`}
                value={`${qtyTotal} total qty`}
                bold
            />
            {data.remarks ? (
                <>
                    <Divider />
                    <div className="text-[10px]">
                        <div className="font-bold">Remarks</div>
                        <div className="mt-0.5 whitespace-pre-wrap">{data.remarks}</div>
                    </div>
                </>
            ) : null}
            <Divider />
            <div className="text-center text-[10px]">
                <div>Received by: ___________________</div>
                <div className="mt-2">Date / time: ___________________</div>
                <div className="mt-3">{data.documentNumber}</div>
            </div>
        </div>
    )
}

export default ReceivingReceiptSlip
