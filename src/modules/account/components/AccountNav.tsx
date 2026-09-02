'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import classNames from '@/utils/classNames'
import {
    ACCOUNT_SETTINGS_PATH,
    PROFILE_PATH,
} from '@/constants/route.constant'
import { PiLockKeyDuotone, PiUserRectangleDuotone } from 'react-icons/pi'

const navItems = [
    {
        label: 'Profile',
        path: PROFILE_PATH,
        icon: PiUserRectangleDuotone,
    },
    {
        label: 'Security',
        path: ACCOUNT_SETTINGS_PATH,
        icon: PiLockKeyDuotone,
    },
]

const AccountNav = () => {
    const pathname = usePathname()

    return (
        <nav className="flex w-full flex-col gap-1">
            {navItems.map((item) => {
                const isActive = pathname === item.path
                const Icon = item.icon

                return (
                    <Link
                        key={item.path}
                        href={item.path}
                        className={classNames(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors',
                            isActive
                                ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
                                : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/80',
                        )}
                    >
                        <Icon className="shrink-0 text-2xl" />
                        <span className="truncate">{item.label}</span>
                    </Link>
                )
            })}
        </nav>
    )
}

export default AccountNav
