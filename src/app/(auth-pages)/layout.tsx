'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Split from '@/components/layouts/AuthLayout/Split'

const Layout = ({ children }: { children: ReactNode }) => {
    const pathname = usePathname()
    const isSignUp = pathname?.startsWith('/sign-up')

    return (
        <div className="flex h-[100vh] flex-auto flex-col">
            <Split formMaxWidth={isSignUp ? 'max-w-[680px]' : 'max-w-[480px]'}>
                {children}
            </Split>
        </div>
    )
}

export default Layout
