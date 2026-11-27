import { Suspense } from 'react'
import TrialBalancePage from '@/modules/fico/pages/TrialBalancePage'

export default function Page() {
    return (
        <Suspense fallback={null}>
            <TrialBalancePage />
        </Suspense>
    )
}