import React from 'react'
import PostLoginLayout from '@/components/layouts/PostLoginLayout'
import { ReactNode } from 'react'

const Layout = async ({ children }: { children: ReactNode }) => {
    return <PostLoginLayout>{children}</PostLoginLayout>
}

export default Layout
