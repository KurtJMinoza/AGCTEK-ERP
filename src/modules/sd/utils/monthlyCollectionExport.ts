import * as XLSX from 'xlsx'
import type {
    MonthlyCollectionMonth,
    MonthlyCollectionReport,
} from '../services/monthlyCollectionService'

const money = (value: number) =>
    Number.isFinite(value) && value !== 0 ? Number(value.toFixed(2)) : ''

const bucketHeader = ['CASH', 'GCASH', 'BANK TRANSFER', 'CHEQUE', 'OTHERS', 'TOTAL']

function detailRows(month: MonthlyCollectionMonth) {
    const header = [
        'DATE',
        'AR NUMBER',
        'CUSTOMER NAME',
        'PARTICULAR',
        ...bucketHeader,
    ]
    const rows: unknown[][] = [header]
    for (const row of month.rows) {
        rows.push([
            new Date(row.collectionDate).toLocaleDateString('en-PH', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'Asia/Manila',
            }),
            row.arNumber,
            row.customerName,
            row.particular,
            money(row.cash),
            money(row.gcash),
            money(row.bankTransfer),
            money(row.cheque),
            money(row.others),
            money(row.total),
        ])
    }
    rows.push([
        '',
        '',
        '',
        'TOTAL',
        money(month.summary.cash),
        money(month.summary.gcash),
        money(month.summary.bankTransfer),
        money(month.summary.cheque),
        money(month.summary.others),
        money(month.summary.total),
    ])
    return rows
}

/** Export year TOTAL sheet + one sheet per month (matches the Excel workbook layout). */
export function downloadMonthlyCollectionExcel(report: MonthlyCollectionReport) {
    const workbook = XLSX.utils.book_new()

    const totalSheet: unknown[][] = [
        ['', 'MONTH', 'TOTAL'],
        ...report.yearSummary.map((m) => [
            '',
            m.monthLabel,
            money(m.summary.total),
        ]),
    ]
    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(totalSheet),
        'TOTAL',
    )

    for (const month of report.months) {
        const sheetRows: unknown[][] = [
            [report.companyName],
            ...(report.companyAddress ? [[report.companyAddress]] : []),
            [],
            [
                report.reportTitle,
                '',
                '',
                'TOTAL',
                money(month.summary.cash),
                money(month.summary.gcash),
                money(month.summary.bankTransfer),
                money(month.summary.cheque),
                money(month.summary.others),
                money(month.summary.total),
            ],
            [],
            ...detailRows(month),
        ]
        const name = `${month.monthLabel} ${report.year}`.slice(0, 31)
        XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.aoa_to_sheet(sheetRows),
            name,
        )
    }

    XLSX.writeFile(
        workbook,
        `monthly-collection-${report.year}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
}