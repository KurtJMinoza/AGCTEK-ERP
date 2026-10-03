import {
    NAV_ITEM_TYPE_ITEM,
} from '@/constants/navigation.constant'
import { SUPER_ADMIN_AUTHORITY } from '@/constants/roles.constant'

import type { NavigationTree } from '@/@types/navigation'

const navigationConfig: NavigationTree[] = [
    {
        key: 'home',
        path: '/home',
        title: 'Home',
        translateKey: 'nav.home',
        icon: 'home',
        type: NAV_ITEM_TYPE_ITEM,
        authority: [],
        subMenu: [],
    },
    {
        key: 'activityLog',
        path: '/activity-log',
        title: 'Activity Log',
        translateKey: 'nav.activityLog',
        icon: 'activityLog',
        type: NAV_ITEM_TYPE_ITEM,
        authority: [],
        subMenu: [],
    },
    {
        key: 'superAdminSettings',
        path: '/super-admin/settings',
        title: 'Super Admin Settings',
        translateKey: 'nav.superAdminSettings',
        icon: 'superAdminSettings',
        type: NAV_ITEM_TYPE_ITEM,
        authority: SUPER_ADMIN_AUTHORITY,
        subMenu: [],
    },
]

export default navigationConfig
