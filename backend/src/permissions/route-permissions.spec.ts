import 'reflect-metadata'
import * as fs from 'fs'
import * as path from 'path'
import { RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { PERMISSION_KEY, PermissionGuard, type RequiredPermission } from './permission.guard'
import { MM_PERMISSION_KEY, type MmRequiredPermission } from '../mm/common/mm-auth.decorator'
import { MmAuthGuard } from '../mm/common/mm-auth.guard'
import { AUTH_ROLES_KEY } from '../auth/auth.decorator'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { MODULE_CATALOG, RESOURCES_BY_CODE, type PermissionAction } from './permissions.constants'

// The ESM build of mapped-types cannot load under Jest; DTO derivation is irrelevant to route metadata.
jest.mock('@nestjs/mapped-types', () => {
    const derive = (base?: new () => object) => class extends (base ?? class {}) {}
    return { PartialType: derive, PickType: derive, OmitType: derive, IntersectionType: derive }
})

/** Routes reachable without a resource permission or role, and why. Keyed `<controller path>#<handler>`. */
const PUBLIC_ROUTES: Record<string, string> = {
    '/#getRoot': 'Service banner',
    '/#getHealth': 'Liveness probe',
    'auth#signUp': 'Sign-up happens before authentication',
    'auth#signIn': 'Sign-in happens before authentication',
    'auth#getProfile': 'Own account (identified by userName; not a business resource)',
    'auth#updateProfile': 'Own account (identified by userName; not a business resource)',
    'auth#changePassword': 'Own account (identified by userName; not a business resource)',
    'permissions#me': "Any signed-in user reads their own effective permissions",
    'system-settings#getPublic': 'Branding and maintenance state shown before sign-in',
    'notifications#findAll': 'Notification inbox: no resource in the permission catalog',
    'notifications#getCount': 'Notification inbox: no resource in the permission catalog',
    'notifications#create': 'Notification inbox: no resource in the permission catalog',
    'notifications#markAllAsRead': 'Notification inbox: no resource in the permission catalog',
    'notifications#markAsRead': 'Notification inbox: no resource in the permission catalog',
    'retail/clients#register': 'Storefront customer accounts (not ERP users)',
    'retail/clients#login': 'Storefront customer accounts (not ERP users)',
    'retail/clients#getProfile': 'Storefront customer accounts (not ERP users)',
    'retail/clients#updateProfile': 'Storefront customer accounts (not ERP users)',
    'retail/clients#getCart': 'Storefront customer accounts (not ERP users)',
    'retail/clients#replaceCart': 'Storefront customer accounts (not ERP users)',
    'sd/products#list': 'Public storefront catalog',
    'sd/products#findOne': 'Public storefront catalog',
    'sd/products#storefrontAvailability': 'Public storefront stock badge',
    'sd/sales-orders#list': 'Storefront order history (anonymous storefront visitors)',
    'sd/sales-orders#createMarketplaceCheckout': 'Storefront checkout (anonymous storefront visitors)',
    'scm/tracking#ingest': 'GPS device ingest, authenticated by the ingest token',
    'scm/tracking#geofenceHook': 'Tile38 geofence callback (server to server)',
    'pp#createBom': 'Unmapped: no PP module in the permission catalog',
    'pp#create': 'Unmapped: no PP module in the permission catalog',
    'pp#findOne': 'Unmapped: no PP module in the permission catalog',
    'pp#release': 'Unmapped: no PP module in the permission catalog',
    'pp#cancel': 'Unmapped: no PP module in the permission catalog',
    'pp#changeMaterialQuantity': 'Unmapped: no PP module in the permission catalog',
    'pp#issueComponents': 'Unmapped: no PP module in the permission catalog',
    'pp#reportOutput': 'Unmapped: no PP module in the permission catalog',
}

/** POST endpoints that only compute or look up data. */
const READ_ONLY_POSTS = new Set([
    'mm/dashboard#refresh',
    'mm/integration/sd#checkAvailability',
    'mm/integration/sd#checkAvailabilityBatch',
    'mm/integration/sd#checkAvailabilityByDate',
    'mm/integration/production#checkAvailability',
    'mm/integration/production#checkAvailabilityBatch',
    'mm/integration/production#checkAvailabilityByDate',
    'mm/scanner#resolvePost',
    'scm/tms#routePreview',
])

type Route = {
    key: string
    verb: string
    path: string
    resource?: string | readonly string[]
    action?: PermissionAction
    roles?: string[]
    guards: unknown[]
}

function controllerFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) controllerFiles(full, out)
        else if (entry.name.endsWith('.controller.ts')) out.push(full)
    }
    return out
}

function collectRoutes(): Route[] {
    const routes: Route[] = []
    for (const file of controllerFiles(path.join(__dirname, '..'))) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(file) as Record<string, unknown>
        for (const exported of Object.values(mod)) {
            if (typeof exported !== 'function' || Reflect.getMetadata(PATH_METADATA, exported) === undefined) continue
            const cls = exported as new (...args: never[]) => unknown
            const prefix = String(Reflect.getMetadata(PATH_METADATA, cls) || '/')
            const classGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, cls) ?? []
            for (const name of Object.getOwnPropertyNames(cls.prototype)) {
                if (name === 'constructor') continue
                const handler = (cls.prototype as Record<string, unknown>)[name]
                if (typeof handler !== 'function') continue
                const method: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler)
                if (method === undefined) continue
                const std: RequiredPermission | undefined =
                    Reflect.getMetadata(PERMISSION_KEY, handler) ?? Reflect.getMetadata(PERMISSION_KEY, cls)
                const mm: MmRequiredPermission | undefined =
                    Reflect.getMetadata(MM_PERMISSION_KEY, handler) ?? Reflect.getMetadata(MM_PERMISSION_KEY, cls)
                const verb = RequestMethod[method]
                const subPath = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '')
                routes.push({
                    key: `${prefix}#${name}`,
                    verb,
                    path: subPath,
                    resource: std?.resource ?? mm?.resource,
                    action: std?.action ?? mm?.action ?? (mm ? inferMmAction(verb, subPath) : undefined),
                    roles: Reflect.getMetadata(AUTH_ROLES_KEY, handler) ?? Reflect.getMetadata(AUTH_ROLES_KEY, cls),
                    guards: [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])],
                })
            }
        }
    }
    return routes
}

/** Mirrors `MmAuthGuard` when `@MmMutation` has no explicit action. */
function inferMmAction(verb: string, subPath: string): PermissionAction {
    if (verb === 'DELETE') return 'delete'
    if (verb === 'POST' && !subPath.includes(':')) return 'create'
    return 'update'
}

const codes = (resource: string | readonly string[]) => (typeof resource === 'string' ? [resource] : [...resource])
const groupCodes = new Set<string>(MODULE_CATALOG.map((m) => m.code))

describe('Route permission coverage', () => {
    const routes = collectRoutes()

    it('discovers the application routes', () => {
        expect(routes.length).toBeGreaterThan(800)
    })

    it('requires a resource permission or role on every route that is not explicitly public', () => {
        const unguarded = routes
            .filter((r) => !r.resource && !r.roles?.length && !(r.key in PUBLIC_ROUTES))
            .map((r) => `${r.key} (${r.verb} ${r.path})`)
        expect(unguarded).toEqual([])
    })

    it('attaches the guard that enforces each requirement', () => {
        const missing = routes
            .filter((r) => {
                if (r.resource) return !r.guards.includes(PermissionGuard) && !r.guards.includes(MmAuthGuard)
                if (r.roles?.length) return !r.guards.includes(UserAuthGuard)
                return false
            })
            .map((r) => r.key)
        expect(missing).toEqual([])
    })

    it('keeps the public allowlist free of stale or now-guarded entries', () => {
        const byKey = new Map(routes.map((r) => [r.key, r]))
        const stale = Object.keys(PUBLIC_ROUTES).filter((key) => {
            const r = byKey.get(key)
            return !r || Boolean(r.resource)
        })
        expect(stale).toEqual([])
    })

    it('only references resource codes from the permission catalog', () => {
        const unknown = routes
            .flatMap((r) => (r.resource ? codes(r.resource) : []))
            .filter((c) => !RESOURCES_BY_CODE.has(c) && !groupCodes.has(c))
        expect([...new Set(unknown)]).toEqual([])
    })

    it('maps HTTP verbs to CRUD actions: GET read, DELETE delete, PUT/PATCH update, POST create or update', () => {
        const wrong = routes
            .filter((r) => r.resource)
            .filter((r) => {
                switch (r.verb) {
                    case 'GET':
                        return r.action !== 'read'
                    case 'DELETE':
                        return r.action !== 'delete'
                    case 'PUT':
                    case 'PATCH':
                        return r.action !== 'update'
                    case 'POST':
                        return READ_ONLY_POSTS.has(r.key) ? r.action !== 'read' : r.action === 'read' || r.action === 'delete'
                    default:
                        return true
                }
            })
            .map((r) => `${r.key} ${r.verb} ${r.path} → ${r.action}`)
        expect(wrong).toEqual([])
    })
})
