import { Suspense } from 'react'
import YearEndClosingPage from '@/modules/fico/pages/YearEndClosingPage'

export default function Page() {
    return (
        <Suspense fallback={null}>
            <YearEndClosingPage />
        </Suspense>
    )
}