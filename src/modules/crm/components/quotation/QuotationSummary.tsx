'use client'

import { Fragment } from 'react'
import Table from '@/components/ui/Table'
import type { QuotationLineStock } from '@/modules/sd/services/quotationService'
import StockChip from './StockChip'
import StatusBadge from '@/components/shared/StatusBadge'
import classNames from '@/utils/classNames'
import { crmTone, decimal, formatDate, formatEnumLabel, formatMoney } from '../../utils/format'
import type { Quotation } from '../../types'

const { THead, TBody, Tr, Th, Td } = Table

export const quotationLabel = (q: Pick<Quotation, 'quotationNumber' | 'revision'>) =>
    `${q.quotationNumber} rev ${q.revision}`

export function QuotationStatusBadge({ quotation }: { quotation: Pick<Quotation, 'effectiveStatus'> }) {
    return (
        <StatusBadge tone={crmTone(quotation.effectiveStatus)}>
            {formatEnumLabel(quotation.effectiveStatus)}
        </StatusBadge>
    )
}

/** Number, status, total and validity on one line. */
export function QuotationHeadline({ quotation }: { quotation: Quotation }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold">{quotationLabel(quotation)}</span>
            <QuotationStatusBadge quotation={quotation} />
            <span className="font-semibold">
                {formatMoney(decimal(quotation.totalAmount), quotation.currency)}
            </span>
            {quotation.validUntil ? (
                <span className="text-xs text-gray-500">valid until {formatDate(quotation.validUntil)}</span>
            ) : null}
        </div>
    )
}

/**
 * Read-only lines as SD priced them, under their section headings. `highlight` marks line numbers
 * (e.g. changed prices); `stock` adds the indicative stock column (internal views only).
 */
export function QuotationLinesTable({
    quotation,
    highlight,
    stock,
    stockLoading,
}: {
    quotation: Quotation
    highlight?: ReadonlySet<number>
    stock?: Map<string, QuotationLineStock>
    stockLoading?: boolean
}) {
    const issues = new Map(quotation.lineIssues.map((i) => [i.lineNumber, i.reason]))
    const headings = new Map((quotation.sections ?? []).map((s) => [s.beforeLineNumber, s.title]))
    const columns = stock ? 6 : 5
    return (
        <Table compact hoverable={false}>
            <THead>
                <Tr>
                    <Th>#</Th>
                    <Th>Product</Th>
                    <Th className="text-right">Qty</Th>
                    {stock ? <Th>Stock</Th> : null}
                    <Th className="text-right">Unit price</Th>
                    <Th className="text-right">Total</Th>
                </Tr>
            </THead>
            <TBody>
                {quotation.lines.map((line) => (
                    <Fragment key={line.id}>
                        {headings.has(line.lineNumber) ? (
                            <Tr className="bg-gray-50 dark:bg-gray-700/40">
                                <Td colSpan={columns} className="font-semibold">
                                    {headings.get(line.lineNumber)}
                                </Td>
                            </Tr>
                        ) : null}
                        <Tr
                            className={classNames(
                                (highlight?.has(line.lineNumber) || issues.has(line.lineNumber)) &&
                                    'bg-amber-50 dark:bg-amber-500/10',
                            )}
                        >
                            <Td>{line.lineNumber}</Td>
                            <Td>
                                <div className="font-medium">{line.sku}</div>
                                <div className="text-xs text-gray-500">{line.description}</div>
                                {issues.has(line.lineNumber) ? (
                                    <div className="text-xs text-amber-700 dark:text-amber-300">
                                        {issues.get(line.lineNumber) === 'INACTIVE'
                                            ? 'Product is inactive in the SD catalog'
                                            : 'Product no longer exists in the SD catalog'}
                                    </div>
                                ) : null}
                            </Td>
                            <Td className="text-right">{Number(line.quantity)}</Td>
                            {stock ? (
                                <Td>
                                    <StockChip stock={stock.get(line.productId)} loading={stockLoading} />
                                </Td>
                            ) : null}
                            <Td className="text-right">{formatMoney(decimal(line.unitPrice), quotation.currency)}</Td>
                            <Td className="text-right">{formatMoney(decimal(line.lineTotal), quotation.currency)}</Td>
                        </Tr>
                    </Fragment>
                ))}
            </TBody>
        </Table>
    )
}
