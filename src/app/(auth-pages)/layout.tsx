import { ReactNode } from 'react'
import Split from '@/components/layouts/AuthLayout/Split'

const Layout = ({ children }: { children: ReactNode }) => {
    return (
        <div className="flex h-[100vh] flex-auto flex-col">
            <Split>{children}</Split>
        </div>
    )
}

export default Layout
