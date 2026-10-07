import authRoute from './authRoute'
import type { Routes } from '@/@types/routes'
import { SUPER_ADMIN_AUTHORITY } from '@/constants/roles.constant'

export const protectedRoutes: Routes = {
    '/home': {
        key: 'home',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/activity-log': {
        key: 'activityLog',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/account/profile': {
        key: 'profile',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/account/settings': {
        key: 'accountSettings',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/super-admin/settings': {
        key: 'superAdminSettings',
        authority: SUPER_ADMIN_AUTHORITY,
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/super-admin/users': {
        key: 'superAdminUsers',
        authority: SUPER_ADMIN_AUTHORITY,
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/super-admin/system-settings': {
        key: 'superAdminSystemSettings',
        authority: SUPER_ADMIN_AUTHORITY,
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/access-denied': {
        key: 'accessDenied',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm': {
        key: 'scmDashboard',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/dashboard': {
        key: 'scmDashboardAlias',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/vehicles': {
        key: 'scmVehicles',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/drivers': {
        key: 'scmDrivers',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/trips': {
        key: 'scmTrips',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/load-building': {
        key: 'scmLoadBuilding',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/trip-planning': {
        key: 'scmTripPlanning',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/shipments': {
        key: 'scmShipments',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/demand-planning': {
        key: 'scmDemandPlanning',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/planning-horizons': {
        key: 'scmPlanningHorizons',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/supply-chain-dashboard': {
        key: 'scmSupplyChainDashboard',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/tracking': {
        key: 'scmTracking',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/scm/maintenance': {
        key: 'scmMaintenance',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/modules/sd/pos': {
        key: 'sdPosBranchGateway',
        authority: [],
        meta: {
            layout: 'blank',
            pageBackgroundType: 'plain',
            pageContainerType: 'gutterless',
        },
    },
    '/modules/sd/pos/terminal': {
        key: 'sdPosTerminal',
        authority: [],
        meta: {
            layout: 'blank',
            pageBackgroundType: 'plain',
            pageContainerType: 'gutterless',
        },
    },
    '/crm': {
        key: 'crmDashboard',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/crm/leads': {
        key: 'crmLeads',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/crm/opportunities': {
        key: 'crmOpportunities',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/crm/opportunities/[id]': {
        key: 'crmOpportunityDetail',
        authority: [],
        dynamicRoute: true,
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/crm/tickets': {
        key: 'crmTickets',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/crm/customers': {
        key: 'crmCustomers',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/crm/customers/[id]': {
        key: 'crmCustomerDetail',
        authority: [],
        dynamicRoute: true,
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/modules/[moduleCode]': {
        key: 'erpModule',
        authority: [],
        dynamicRoute: true,
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/modules/[moduleCode]/[submoduleCode]': {
        key: 'erpSubmodule',
        authority: [],
        dynamicRoute: true,
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/modules/[moduleCode]/[submoduleCode]/[featureCode]': {
        key: 'erpFeature',
        authority: [],
        dynamicRoute: true,
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
}

export const publicRoutes: Routes = {
    '/maintenance': {
        key: 'maintenance',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    '/shop': {
        key: 'marketplace',
        authority: [],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
}

export const authRoutes = authRoute
