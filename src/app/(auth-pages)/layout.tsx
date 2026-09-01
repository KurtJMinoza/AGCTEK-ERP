import { ReactNode } from 'react'
import Side from '@/components/layouts/AuthLayout/Side'
// import Split from '@/components/layouts/AuthLayout/Split'
// import Simple from '@/components/layouts/AuthLayout/Simple'

const Layout = ({ children }: { children: ReactNode }) => {
    return (
        <div className="flex flex-auto flex-col h-[100vh]">
            <Side>{children}</Side>
        </div>
    )
}

export default Layout
