'use client'

import classNames from '@/utils/classNames'

export type MmDocumentCompanyBlock = {
    name: string
    legalName?: string | null
    logoUrl?: string | null
    code?: string | null
    address?: string | null
    tin?: string | null
}

export type MmDocumentPartyBlock = {
    title: string
    name: string
    code?: string | null
    address?: string | null
    taxId?: string | null
    email?: string | null
    phone?: string | null
}

type MmEnterpriseDocumentHeaderProps = {
    company: MmDocumentCompanyBlock
    documentTitle: string
    documentSubtitle?: string
    documentNumber: string
    status?: string
    party?: MmDocumentPartyBlock | null
    className?: string
}

const MmEnterpriseDocumentHeader = ({
    company,
    documentTitle,
    documentSubtitle,
    documentNumber,
    status,
    party,
    className,
}: MmEnterpriseDocumentHeaderProps) => {
    const initials = (company.code ?? company.name).slice(0, 2).toUpperCase()

    return (
        <header className={classNames('border-b border-gray-200 pb-5', className)}>
            <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="flex min-w-0 items-start gap-4">
                    {company.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={company.logoUrl}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-lg border border-gray-200 bg-white object-contain p-1"
                        />
                    ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold text-gray-500">
                            {initials}
                        </span>
                    )}
                    <div className="min-w-0">
                        <p className="text-lg font-semibold tracking-tight text-gray-900">
                            {company.name}
                        </p>
                        {company.legalName &&
                        company.legalName.trim() !== company.name ? (
                            <p className="text-sm text-gray-600">
                                {company.legalName}
                            </p>
                        ) : null}
                        {company.code ? (
                            <p className="mt-0.5 font-mono text-xs text-gray-500">
                                {company.code}
                                {company.tin ? ` · TIN ${company.tin}` : ''}
                            </p>
                        ) : null}
                        {company.address ? (
                            <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">
                                {company.address}
                            </p>
                        ) : null}
                    </div>
                </div>

                <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {documentTitle}
                    </p>
                    {documentSubtitle ? (
                        <p className="text-xs text-gray-500">{documentSubtitle}</p>
                    ) : null}
                    <p className="mt-2 font-mono text-base font-semibold text-gray-900">
                        {documentNumber}
                    </p>
                    {status ? (
                        <span className="mt-2 inline-block rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                            {status.replace(/_/g, ' ')}
                        </span>
                    ) : null}
                </div>
            </div>

            {party ? (
                <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        {party.title}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                        {party.name}
                    </p>
                    {party.code ? (
                        <p className="font-mono text-xs text-gray-600">
                            {party.code}
                        </p>
                    ) : null}
                    {party.address ? (
                        <p className="mt-1 text-xs text-gray-600">{party.address}</p>
                    ) : null}
                    {party.taxId || party.email || party.phone ? (
                        <p className="mt-1 text-xs text-gray-500">
                            {[party.taxId ? `Tax ID ${party.taxId}` : null, party.email, party.phone]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </header>
    )
}

export default MmEnterpriseDocumentHeader
