'use client'

import Avatar from '@/components/ui/Avatar'
import Dropdown from '@/components/ui/Dropdown'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import Link from 'next/link'
import signOut from '@/server/actions/auth/handleSignOut'
import useCurrentSession from '@/utils/hooks/useCurrentSession'
import useUserAvatar from '@/modules/account/hooks/useUserAvatar'
import useAuthority from '@/utils/hooks/useAuthority'
import { SUPER_ADMIN_AUTHORITY } from '@/constants/roles.constant'
import { SUPER_ADMIN_SETTINGS_PATH } from '@/constants/route.constant'
import {
    PiUserDuotone,
    PiGearDuotone,
    PiShieldCheckDuotone,
    PiSignOutDuotone,
} from 'react-icons/pi'
import type { JSX } from 'react'

type DropdownList = {
    label: string
    path: string
    icon: JSX.Element
}

const dropdownItemList: DropdownList[] = [
    {
        label: 'Profile',
        path: '/account/profile',
        icon: <PiUserDuotone />,
    },
    {
        label: 'Account Settings',
        path: '/account/settings',
        icon: <PiGearDuotone />,
    },
]

const superAdminItem: DropdownList = {
    label: 'Super Admin Settings',
    path: SUPER_ADMIN_SETTINGS_PATH,
    icon: <PiShieldCheckDuotone />,
}

const _UserDropdown = () => {
    const { session } = useCurrentSession()
    const { avatar } = useUserAvatar()
    const isSuperAdmin = useAuthority(
        session?.user?.authority ?? [],
        SUPER_ADMIN_AUTHORITY,
    )
    const items = isSuperAdmin
        ? [...dropdownItemList, superAdminItem]
        : dropdownItemList

    const handleSignOut = async () => {
        await signOut()
    }

    const avatarProps = {
        ...(avatar ? { src: avatar } : { icon: <PiUserDuotone /> }),
    }

    return (
        <Dropdown
            className="flex"
            toggleClassName="flex items-center"
            renderTitle={
                <div className="flex cursor-pointer items-center">
                    <Avatar size={32} {...avatarProps} />
                </div>
            }
            placement="bottom-end"
        >
            <Dropdown.Item variant="header">
                <div className="flex items-center gap-3 px-3 py-2">
                    <Avatar {...avatarProps} />
                    <div>
                        <div className="font-bold text-gray-900 dark:text-gray-100">
                            {session?.user?.name || 'Anonymous'}
                        </div>
                        <div className="text-xs">
                            {session?.user?.email || 'No email available'}
                        </div>
                    </div>
                </div>
            </Dropdown.Item>
            <Dropdown.Item variant="divider" />
            {items.map((item) => (
                <Dropdown.Item
                    key={item.label}
                    eventKey={item.label}
                    className="px-0"
                >
                    <Link className="flex h-full w-full px-2" href={item.path}>
                        <span className="flex w-full items-center gap-2">
                            <span className="text-xl">{item.icon}</span>
                            <span>{item.label}</span>
                        </span>
                    </Link>
                </Dropdown.Item>
            ))}
            <Dropdown.Item variant="divider" />
            <Dropdown.Item
                eventKey="Sign Out"
                className="gap-2"
                onClick={handleSignOut}
            >
                <span className="text-xl">
                    <PiSignOutDuotone />
                </span>
                <span>Sign Out</span>
            </Dropdown.Item>
        </Dropdown>
    )
}

const UserDropdown = withHeaderItem(_UserDropdown)

export default UserDropdown
