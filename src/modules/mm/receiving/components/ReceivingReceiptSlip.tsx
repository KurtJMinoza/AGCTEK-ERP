'use client'

import classNames from '@/utils/classNames'
import MmEnterpriseDocumentHeader, {
    type MmDocumentCompanyBlock,
    type MmDocumentPartyBlock,
} from '@/modules/mm/shared/MmEnterpriseDocumentHeader'
import { fmtSlipDate } from '@/modules/mm/shared/documentSlipUtils'

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
    company?: MmDocumentCompanyBlock
    party?: MmDocumentPartyBlock | null
}

function titleForKind(kind: ReceivingReceiptSlipData['kind']) {
    return kind === 'EXPECTED_RECEIPT' ? 'Expected Receipt' : 'Goods Receipt'
}

const MetaItem = ({ label, value }: { label: string; value: string }) => (
    <div>
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {label}
        </dt>
        <dd className="mt-0.5 text-sm font-medium text-gray-900">{value}</dd>
    </div>
)

/** Enterprise goods / expected receipt document (print-ready). */
const ReceivingReceiptSlip = ({
    data,
    className,
}: {
    data: ReceivingReceiptSlipData
    className?: string
}) => {
    const lineCount = data.lines.length
    const qtyTotal = data.lines.reduce(
        (sum, l) => sum + Number(l.quantity || 0),
        0,
    )

    const company: MmDocumentCompanyBlock = data.company ?? {
        name: 'Company',
    }

    const party: MmDocumentPartyBlock | null =
        data.party ??
        (data.supplier
            ? { title: 'Supplier', name: data.supplier }
            : null)

    return (
        <article
            className={classNames(
                'mx-auto w-full max-w-[820px] bg-white px-8 py-8 text-gray-900 print:max-w-none print:px-6 print:py-6',
                className,
            )}
        >
            <MmEnterpriseDocumentHeader
                company={company}
                documentTitle={titleForKind(data.kind)}
                documentSubtitle="Materials Management · Receiving"
                documentNumber={data.documentNumber}
                status={data.status}
                party={party}
            />

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                {data.postingDate ? (
                    <MetaItem label="Posting date" value={fmtSlipDate(data.postingDate)} />
                ) : null}
                {data.documentDate ? (
                    <MetaItem label="Document date" value={fmtSlipDate(data.documentDate)} />
                ) : null}
                {data.expectedDate ? (
                    <MetaItem label="Expected date" value={fmtSlipDate(data.expectedDate)} />
                ) : null}
                {data.warehouse ? (
                    <MetaItem label="Warehouse" value={data.warehouse} />
                ) : null}
                {data.poNumber ? (
                    <MetaItem label="Purchase order" value={data.poNumber} />
                ) : null}
                {data.stockStatus ? (
                    <MetaItem label="Stock status" value={data.stockStatus} />
                ) : null}
            </dl>

            <div className="mt-8">
                <div className="mb-2 flex items-end justify-between gap-4">
                    <h2 className="text-sm font-semibold text-gray-900">
                        Line items
                    </h2>
                    <p className="text-xs text-gray-500">
                        {lineCount} line{lineCount === 1 ? '' : 's'} ·{' '}
                        {qtyTotal.toLocaleString()} total qty
                    </p>
                </div>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                <th className="px-3 py-2.5">#</th>
                                <th className="px-3 py-2.5">Material</th>
                                <th className="px-3 py-2.5 text-right">Quantity</th>
                                <th className="px-3 py-2.5">UoM</th>
                                <th className="px-3 py-2.5">Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.lines.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-3 py-8 text-center text-sm text-gray-500"
                                    >
                                        No line items on this document.
                                    </td>
                                </tr>
                            ) : (
                                data.lines.map((line, idx) => {
                                    const code = line.materialCode ?? ''
                                    const name =
                                        line.materialName ?? 'Material'
                                    return (
                                        <tr
                                            key={`${code}-${name}-${idx}`}
                                            className="border-b border-gray-100 last:border-0"
                                        >
                                            <td className="px-3 py-2.5 text-gray-500">
                                                {idx + 1}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {code ? (
                                                    <span className="block font-mono text-xs text-gray-500">
                                                        {code}
                                                    </span>
                                                ) : null}
                                                <span className="font-medium text-gray-900">
                                                    {name}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                                                {Number(line.quantity).toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2.5 text-gray-600">
                                                {line.uom ?? '—'}
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-gray-600">
                                                {line.note ?? '—'}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {data.remarks ? (
                <section className="mt-6 rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Remarks
                    </h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
                        {data.remarks}
                    </p>
                </section>
            ) : null}

            <footer className="mt-10 grid grid-cols-1 gap-8 border-t border-gray-200 pt-6 sm:grid-cols-2">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Received by
                    </p>
                    <div className="mt-8 border-b border-gray-400" />
                    <p className="mt-1 text-xs text-gray-500">
                        Signature over printed name
                    </p>
                </div>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Date & time
                    </p>
                    <div className="mt-8 border-b border-gray-400" />
                </div>
            </footer>

            <p className="mt-6 text-center text-[10px] text-gray-400">
                System document · {data.documentNumber}
            </p>
        </article>
    )
}

export default ReceivingReceiptSlip
