import type { Routes } from '@/@types/routes'

const otherRoute: Routes = {
    '/access-denied': {
        key: 'signIn',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
}

export default otherRoute
