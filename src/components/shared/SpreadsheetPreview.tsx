'use client'

import { useEffect, useMemo, useState } from 'react'
import Table from '@/components/ui/Table'
import Tabs from '@/components/ui/Tabs'
import type { SpreadsheetPreviewData } from '@/components/shared/parseSpreadsheetBlob'

type SpreadsheetPreviewProps = {
    data: SpreadsheetPreviewData
}

const SpreadsheetPreview = ({ data }: SpreadsheetPreviewProps) => {
    const [activeSheet, setActiveSheet] = useState(data.sheets[0]?.name ?? '')

    useEffect(() => {
        setActiveSheet(data.sheets[0]?.name ?? '')
    }, [data])

    const sheet = useMemo(
        () => data.sheets.find((item) => item.name === activeSheet) ?? data.sheets[0],
        [activeSheet, data.sheets],
    )

    if (!sheet) {
        return (
            <p className="text-sm text-gray-500 dark:text-gray-400">
                This workbook has no readable sheets.
            </p>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            {data.sheets.length > 1 ? (
                <Tabs
                    value={activeSheet}
                    onChange={(value) => setActiveSheet(value as string)}
                >
                    <Tabs.TabList>
                        {data.sheets.map((item) => (
                            <Tabs.TabNav key={item.name} value={item.name}>
                                {item.name}
                            </Tabs.TabNav>
                        ))}
                    </Tabs.TabList>
                </Tabs>
            ) : (
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Sheet: {sheet.name}
                </p>
            )}

            {sheet.truncated ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                    Showing the first {sheet.rows.length} rows and{' '}
                    {sheet.headers.length} columns.
                </p>
            ) : null}

            <div className="max-h-[70vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <Table compact cellBorder overflow={false}>
                    <Table.THead>
                        <Table.Tr>
                            {sheet.headers.map((header, index) => (
                                <Table.Th key={`${sheet.name}-h-${index}`}>
                                    {header}
                                </Table.Th>
                            ))}
                        </Table.Tr>
                    </Table.THead>
                    <Table.TBody>
                        {sheet.rows.length === 0 ? (
                            <Table.Tr>
                                <Table.Td
                                    colSpan={sheet.headers.length}
                                    className="text-center text-gray-500"
                                >
                                    Empty sheet
                                </Table.Td>
                            </Table.Tr>
                        ) : (
                            sheet.rows.map((row, rowIndex) => (
                                <Table.Tr key={`${sheet.name}-r-${rowIndex}`}>
                                    {sheet.headers.map((_, colIndex) => (
                                        <Table.Td
                                            key={`${sheet.name}-r-${rowIndex}-c-${colIndex}`}
                                            className="max-w-[240px] truncate"
                                            title={row[colIndex] ?? ''}
                                        >
                                            {row[colIndex] ?? ''}
                                        </Table.Td>
                                    ))}
                                </Table.Tr>
                            ))
                        )}
                    </Table.TBody>
                </Table>
            </div>
        </div>
    )
}

export default SpreadsheetPreview
