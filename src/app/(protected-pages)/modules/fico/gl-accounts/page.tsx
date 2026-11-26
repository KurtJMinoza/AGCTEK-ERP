import { Suspense } from 'react'
import Loading from '@/components/shared/Loading'
import PageContainer from '@/components/shared/PageContainer'
import GlAccountsPage from '@/modules/fico/pages/GlAccountsPage'

export const metadata = {
    title: 'G/L Accounts | FICO | AGCTEK ERP',
}

function GlAccountsPageFallback() {
    return (
        <PageContainer>
            <div className="flex min-h-[24rem] items-center justify-center">
                <Loading loading />
            </div>
        </PageContainer>
    )
}

export default function GlAccountsRoutePage() {
    return (
        <Suspense fallback={<GlAccountsPageFallback />}>
            <GlAccountsPage />
        </Suspense>
    )
}