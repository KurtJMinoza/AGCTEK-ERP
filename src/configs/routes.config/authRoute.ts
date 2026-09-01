import type { Routes } from '@/@types/routes'

const dashboardsRoute: Routes = {
    '/sign-in': {
        key: 'signIn',
        authority: [],
    },
    '/sign-up': {
        key: 'signUp',
        authority: [],
    },
}

export default dashboardsRoute
