'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Split from '@/components/layouts/AuthLayout/Split'

const Layout = ({ children }: { children: ReactNode }) => {
    const pathname = usePathname()
    const isSignUp = pathname?.startsWith('/sign-up')

    return (
        <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-auto flex-col overflow-hidden">
            <Split
                formAlign={isSignUp ? 'start' : 'center'}
                formMaxWidth={isSignUp ? 'max-w-[480px] sm:max-w-[520px]' : 'max-w-[480px]'}
            >
                {children}
                {!isSignUp ? (
                    <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
                        Developed by{' '}
                        <a
                            href="https://www.facebook.com/AGCTechSolutions"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline"
                        >
                            AGCTek
                        </a>
                    </p>
                ) : null}
            </Split>
        </div>
    )
}

export default Layout
