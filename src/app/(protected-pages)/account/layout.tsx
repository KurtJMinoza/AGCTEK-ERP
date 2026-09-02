'use client'

import type { ReactNode } from 'react'
import Card from '@/components/ui/Card'
import PageContainer from '@/components/shared/PageContainer'
import AccountNav from '@/modules/account/components/AccountNav'

const AccountLayout = ({ children }: { children: ReactNode }) => {
    return (
        <PageContainer>
            <h2 className="mb-6 text-2xl font-bold heading-text">Settings</h2>

            <Card
                bordered={false}
                className="shadow-sm dark:shadow-2xl"
                bodyClass="p-0"
            >
                <div className="flex flex-col lg:flex-row">
                    <div className="border-b border-gray-200 px-3 py-4 dark:border-gray-700 lg:w-60 lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
                        <AccountNav />
                    </div>
                    <div className="min-w-0 flex-1 p-6 lg:p-8">{children}</div>
                </div>
            </Card>
        </PageContainer>
    )
}

export default AccountLayout
