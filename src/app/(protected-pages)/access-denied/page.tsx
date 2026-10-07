'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'
import appConfig from '@/configs/app.config'
import { PiLockKeyDuotone } from 'react-icons/pi'

const Page = () => {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 py-24 text-center">
            <PiLockKeyDuotone className="text-6xl text-gray-400" />
            <h2 className="text-2xl font-bold heading-text">Access denied</h2>
            <p className="max-w-md text-gray-500 dark:text-gray-400">
                Your role does not have permission to view this page.
            </p>
            <Link href={appConfig.authenticatedEntryPath}>
                <Button variant="solid">Back to home</Button>
            </Link>
        </div>
    )
}

export default Page
