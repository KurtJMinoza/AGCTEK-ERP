'use client'

import DataTable from '@/components/shared/DataTable'
import Loading from '@/components/shared/Loading'
import Pagination from '@/components/ui/Pagination'
import Select from '@/components/ui/Select'
import {
    rcvMobileCardEnterClass,
    rcvTableRowEnterClass,
    RcvAnimatedStatus,
    type RcvBadgeTone,
} from './receivingTableUi'
import { useMemo, type ComponentProps, type ReactNode } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'

export type ReceivingMobileConfig<T> = {
    title: (row: T) => string
    subtitle?: (row: T) => string | null | undefined
    status?: (row: T) => { text: string; tone: RcvBadgeTone } | null | undefined
    fields?: { label: string; value: (row: T) => ReactNode }[]
    onPress?: (row: T) => void
}

type ReceivingResponsiveTableProps<T> = ComponentProps<typeof DataTable<T>> & {
    mobile?: ReceivingMobileConfig<T>
    tableMinWidthClass?: string
    /** Override default receiving row entrance (e.g. supplier-management tables). */
    rowEnterClass?: (index: number) => string
}

function mergeRowClass<T>(
    index: number,
    row: T,
    rowEnterClass: (index: number) => string,
    rowClassName?: (row: T, index: number) => string | undefined,
) {
    return [rowEnterClass(index), rowClassName?.(row, index)].filter(Boolean).join(' ')
}

export default function ReceivingResponsiveTable<T>({
    mobile,
    tableMinWidthClass = 'min-w-[720px]',
    rowEnterClass = rcvTableRowEnterClass,
    rowClassName,
    getRowId,
    data,
    loading,
    pagingData,
    onPaginationChange,
    onSelectChange,
    pageSizes = [10, 25, 50, 100],
    hidePagination = false,
    noData,
    customNoDataIcon,
    instanceId = 'responsive-table',
    ...rest
}: ReceivingResponsiveTableProps<T>) {
    const rows = (data ?? []) as T[]
    const useMobileCards = Boolean(mobile)
    const { pageSize, pageIndex, total } = pagingData ?? {
        pageSize: 10,
        pageIndex: 1,
        total: 0,
    }

    const pageSizeOption = useMemo(
        () =>
            pageSizes.map((number) => ({
                value: number,
                label: `${number} / page`,
            })),
        [pageSizes],
    )

    const mobilePagination =
        pagingData && !hidePagination ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                <Pagination
                    pageSize={pageSize}
                    currentPage={pageIndex}
                    total={total}
                    onChange={(page) => {
                        if (!loading) onPaginationChange?.(page)
                    }}
                />
                <div className="w-full sm:w-auto sm:min-w-[8.125rem]">
                    <Select
                        instanceId={`${instanceId}-page-size`}
                        size="sm"
                        menuPlacement="top"
                        isSearchable={false}
                        value={pageSizeOption.filter((option) => option.value === pageSize)}
                        options={pageSizeOption}
                        onChange={(option) => {
                            if (!loading && option?.value != null) {
                                onSelectChange?.(option.value)
                            }
                        }}
                    />
                </div>
            </div>
        ) : null

    const table = (
        <div className="-mx-1 overflow-x-auto sm:mx-0">
            <div className={tableMinWidthClass}>
                <DataTable<T>
                    {...rest}
                    data={data}
                    loading={loading}
                    pagingData={pagingData}
                    onPaginationChange={onPaginationChange}
                    onSelectChange={onSelectChange}
                    pageSizes={pageSizes}
                    hidePagination={hidePagination}
                    noData={noData}
                    customNoDataIcon={customNoDataIcon}
                    instanceId={instanceId}
                    fit={rest.fit ?? false}
                    getRowId={getRowId}
                    rowClassName={(row, index) =>
                        mergeRowClass(index, row, rowEnterClass, rowClassName)
                    }
                />
            </div>
        </div>
    )

    if (!useMobileCards || !mobile) {
        return table
    }

    const showMobileCards = !loading && rows.length > 0

    return (
        <>
            <div className="lg:hidden">
                {loading ? (
                    <div className="flex min-h-[12rem] items-center justify-center">
                        <Loading loading />
                    </div>
                ) : null}
                {!loading && (noData || rows.length === 0) ? (
                    customNoDataIcon ?? (
                        <p className="py-8 text-center text-sm text-gray-500">No records in scope.</p>
                    )
                ) : null}
                {showMobileCards ? (
                    <ul className="space-y-3">
                        {rows.map((row, index) => {
                            const title = mobile.title(row)
                            const subtitle = mobile.subtitle?.(row)
                            const status = mobile.status?.(row)
                            const clickable = Boolean(mobile.onPress)
                            const Tag = clickable ? 'button' : 'div'
                            return (
                                <li key={getRowId?.(row, index) ?? String(index)}>
                                    <Tag
                                        type={clickable ? 'button' : undefined}
                                        onClick={
                                            clickable ? () => mobile.onPress?.(row) : undefined
                                        }
                                        className={`w-full rounded-xl border border-gray-200/90 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900/40 ${rcvMobileCardEnterClass(index)}`}
                                    >
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate font-mono text-sm font-semibold text-primary">
                                                    {title}
                                                </p>
                                                {subtitle ? (
                                                    <p className="truncate text-xs text-gray-500">
                                                        {subtitle}
                                                    </p>
                                                ) : null}
                                            </div>
                                            {status ? (
                                                <RcvAnimatedStatus
                                                    status={status.text}
                                                    tone={status.tone}
                                                />
                                            ) : null}
                                        </div>
                                        {mobile.fields?.length ? (
                                            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                                                {mobile.fields.map((f) => (
                                                    <div key={f.label} className="min-w-0">
                                                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                                            {f.label}
                                                        </dt>
                                                        <dd className="mt-0.5 truncate text-gray-800 dark:text-gray-200">
                                                            {f.value(row)}
                                                        </dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        ) : null}
                                    </Tag>
                                </li>
                            )
                        })}
                    </ul>
                ) : null}
                {mobilePagination}
            </div>
            <div className="hidden lg:block">{table}</div>
        </>
    )
}
