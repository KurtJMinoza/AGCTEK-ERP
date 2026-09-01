'use client'

import Link from 'next/link'
import Container from '@/components/shared/Container'
import NotFound404 from '@/assets/svg/NotFound404'
import appConfig from '@/configs/app.config'

export default function NotFound() {
    return (
        <div className="flex flex-auto flex-col h-[100vh]">
            <div className="h-full bg-white dark:bg-gray-800">
                <Container className="flex flex-col flex-auto items-center justify-center min-w-0 h-full">
                    <div className="min-w-[320px] md:min-w-[500px] max-w-[500px]">
                        <div className="text-center">
                            <div className="mb-10 flex justify-center">
                                <NotFound404 height={350} width={350} />
                            </div>
                            <h2>Ops! Page not found</h2>
                            <p className="text-lg mt-6">
                                This page does not exist or has been removed, We
                                suggest you to go back to the home page
                            </p>
                            <div className="mt-8">
                                <Link
                                    href={appConfig.authenticatedEntryPath}
                                    className="button inline-flex items-center justify-center bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-700 ring-primary dark:ring-white hover:border-primary dark:hover:border-white hover:ring-1 hover:text-primary dark:hover:text-white dark:hover:bg-transparent text-gray-600 dark:text-gray-100 h-14 rounded-xl px-8 py-2 text-base button-press-feedback"
                                >
                                    Back to Home
                                </Link>
                            </div>
                        </div>
                    </div>
                </Container>
            </div>
        </div>
    )
}
