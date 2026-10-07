import React from 'react'
import { redirect } from 'next/navigation'
import PostLoginLayout from '@/components/layouts/PostLoginLayout'
import getServerSession from '@/server/actions/auth/getServerSession'
import getPublicSettings from '@/server/actions/system/getPublicSettings'
import { USER_ROLES } from '@/constants/roles.constant'
import { MAINTENANCE_PATH } from '@/constants/route.constant'
import { ReactNode } from 'react'

const Layout = async ({ children }: { children: ReactNode }) => {
    const { maintenance_mode } = await getPublicSettings()
    if (maintenance_mode) {
        const session = await getServerSession()
        if (!session?.user?.authority?.includes(USER_ROLES.SUPER_ADMIN)) {
            redirect(MAINTENANCE_PATH)
        }
    }

    return <PostLoginLayout>{children}</PostLoginLayout>
}

export default Layout
