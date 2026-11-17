'use client'

import { HiOutlineOfficeBuilding } from 'react-icons/hi'
import { rcvIconPopClass } from '@/modules/mm/receiving/components/receivingTableUi'

export {
    rcvTableRowEnterClass,
    RcvAnimatedStatus,
    RcvPlainCell,
    RcvDateCell,
    fmtRcvDate,
    rcvStatusTone,
} from '@/modules/mm/receiving/components/receivingTableUi'

export function OrgCompanyCell({
    code,
    name,
    logoUrl,
}: {
    code: string
    name: string
    logoUrl?: string | null
}) {
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            {logoUrl ? (
                <img
                    src={logoUrl}
                    alt=""
                    className={`h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white object-contain shadow-sm dark:border-gray-600 ${rcvIconPopClass(70)}`}
                />
            ) : (
                <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${rcvIconPopClass(70)}`}
                >
                    <HiOutlineOfficeBuilding className="text-lg" />
                </span>
            )}
            <div className="min-w-0">
                <span className="block truncate font-mono text-xs font-semibold text-primary">
                    {code}
                </span>
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {name}
                </p>
            </div>
        </div>
    )
}

export function OrgTinCell({ tin }: { tin?: string | null }) {
    if (!tin?.trim()) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-200">
            {tin}
        </span>
    )
}

export function OrgAddressCell({ address }: { address?: string | null }) {
    if (!address?.trim()) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <p className="line-clamp-2 max-w-[16rem] text-sm text-gray-600 dark:text-gray-300">
            {address}
        </p>
    )
}
