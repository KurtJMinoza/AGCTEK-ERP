import { Suspense } from 'react'
import GeneralLedgerPage from '@/modules/fico/pages/GeneralLedgerPage'

export const metadata = {
    title: 'General Ledger | FICO | AGCTEK ERP',
}

export default function Page() {
    return (
        <Suspense fallback={null}>
            <GeneralLedgerPage />
        </Suspense>
    )
}