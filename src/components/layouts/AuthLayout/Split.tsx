import { APP_NAME } from '@/constants/app.constant'
import classNames from '@/utils/classNames'
import type { ReactNode } from 'react'
import type { CommonProps } from '@/@types/common'

interface SplitProps extends CommonProps {
    content?: ReactNode
    /** Tailwind max-width class for the auth form column */
    formMaxWidth?: string
    /** Top-align long forms; center short forms (sign-in) */
    formAlign?: 'center' | 'start'
}

const Split = ({
    children,
    content,
    formMaxWidth = 'max-w-[480px]',
    formAlign = 'center',
}: SplitProps) => {
    return (
        <div className="grid h-full min-h-0 bg-gray-50 p-3 dark:bg-gray-950 sm:p-4 lg:grid-cols-2 lg:p-6">
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

            <div
                className={classNames(
                    'flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto overscroll-y-contain px-2 py-3 sm:px-4 sm:py-4 lg:py-6',
                    formAlign === 'start' ? 'justify-start' : 'justify-center',
                )}
            >
                <div className={classNames('w-full shrink-0', formMaxWidth)}>
                    {content}
                    {children}
                </div>
            </div>
        </div>
    )
}

export default Split
