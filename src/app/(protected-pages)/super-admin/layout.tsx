import { redirect } from 'next/navigation'
import getServerSession from '@/server/actions/auth/getServerSession'
import { USER_ROLES } from '@/constants/roles.constant'
import { ACCESS_DENIED_PATH } from '@/constants/route.constant'
import type { ReactNode } from 'react'

const SuperAdminLayout = async ({ children }: { children: ReactNode }) => {
    const session = await getServerSession()

    if (!session?.user?.authority?.includes(USER_ROLES.SUPER_ADMIN)) {
        redirect(ACCESS_DENIED_PATH)
    }

    return <>{children}</>
}

export default SuperAdminLayout
