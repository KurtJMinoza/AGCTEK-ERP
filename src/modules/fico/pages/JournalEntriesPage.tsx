'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import JournalEntriesWorkbench from '../components/journal/JournalEntriesWorkbench'

const ROUTE = '/modules/fico/journal-entries'

const JournalEntriesPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()

    return (
        <PageContainer>
            <PageHeader
                title="Journal Entries"
                description="Manual journal entry workbench — create drafts, post, and reverse documents entered in Finance."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <FicoCompanySelect
                        companies={companies}
                        value={companyId}
                        onChange={setCompanyId}
                        loading={companyLoading}
                    />
                }
            />
            {companyId ? (
                <JournalEntriesWorkbench key={companyId} companyId={companyId} />
            ) : (
                <p className="text-sm text-gray-500">
                    Select a company to load journal entries.
                </p>
            )}
        </PageContainer>
    )
}

export default JournalEntriesPage