'use client'

type MmCompanyCellProps = {
    company?: {
        name?: string | null
        code?: string | null
        logoUrl?: string | null
    } | null
}

/** Company logo + display name for MM inventory tables. */
const MmCompanyCell = ({ company }: MmCompanyCellProps) => {
    if (!company?.name && !company?.code) {
        return <span className="text-sm text-gray-400">—</span>
    }

    const label = company.name ?? company.code ?? '—'
    const initials = (company.code ?? company.name ?? '?').slice(0, 2).toUpperCase()

    return (
        <div className="flex min-w-[8rem] items-center gap-2.5">
            {company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={company.logoUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white object-contain dark:border-gray-600"
                />
            ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[10px] font-semibold uppercase text-gray-500 dark:bg-gray-800">
                    {initials}
                </span>
            )}
            <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {label}
                </div>
                {company.name && company.code ? (
                    <div className="truncate font-mono text-[11px] text-gray-500">
                        {company.code}
                    </div>
                ) : null}
            </div>
        </div>
    )
}

export default MmCompanyCell
