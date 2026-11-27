import { Suspense } from 'react'
import AccountsPayablePage from '@/modules/fico/pages/AccountsPayablePage'

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AccountsPayablePage />
        </Suspense>
    )
}