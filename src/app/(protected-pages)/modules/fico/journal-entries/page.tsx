import { Suspense } from 'react'
import JournalEntriesPage from '@/modules/fico/pages/JournalEntriesPage'

export default function Page() {
    return (
        <Suspense fallback={null}>
            <JournalEntriesPage />
        </Suspense>
    )
}