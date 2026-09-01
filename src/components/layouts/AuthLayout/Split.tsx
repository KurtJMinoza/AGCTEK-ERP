import { cloneElement } from 'react'
import { APP_NAME } from '@/constants/app.constant'
import type { ReactNode, ReactElement } from 'react'
import type { CommonProps } from '@/@types/common'

interface SplitProps extends CommonProps {
    content?: ReactNode
}

const Split = ({ children, content, ...rest }: SplitProps) => {
    return (
        <div className="grid h-full bg-gray-50 p-4 dark:bg-gray-950 lg:grid-cols-2 lg:p-6">
            <div className="relative hidden flex-col justify-between overflow-hidden rounded-3xl bg-primary px-12 py-10 lg:flex">
                <div className="relative z-10 flex flex-1 flex-col justify-center">
                    <img
                        className="mx-auto max-w-[420px] 2xl:max-w-[520px]"
                        src="/img/others/auth-split-img.png"
                        alt="AGCTEK ERP dashboard preview"
                    />
                    <div className="mx-auto mt-10 max-w-[480px] text-center">
                        <h1 className="text-3xl font-bold text-neutral">
                            Manage your business in one place
                        </h1>
                        <p className="mx-auto mt-4 text-base font-medium text-neutral/80">
                            {APP_NAME} brings accounting, inventory, HR, and
                            operations together with real-time insights and a
                            unified workspace for your team.
                        </p>
                    </div>
                </div>

                <p className="relative z-10 text-sm text-neutral/70">
                    Secure access for authorized personnel only.
                </p>

                <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
                <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-white/10" />
            </div>

            <div className="flex w-full flex-col items-center justify-center px-4 sm:px-8">
                <div className="w-full max-w-[480px]">
                    {content}
                    {children
                        ? cloneElement(children as ReactElement, {
                              ...rest,
                          })
                        : null}
                </div>
            </div>
        </div>
    )
}

export default Split
