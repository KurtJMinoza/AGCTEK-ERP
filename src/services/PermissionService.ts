import { getSession } from 'next-auth/react'
import ErpAxiosBase from './axios/ErpAxiosBase'

export type PermissionAction = 'view' | 'create' | 'read' | 'update' | 'delete'

/** `canView` is module access (menu + entry); the CRUD flags apply to records inside it. */
export type CrudFlags = {
    canView: boolean
    canCreate: boolean
    canRead: boolean
    canUpdate: boolean
    canDelete: boolean
}

export type ModuleDefinition = {
    id: string
    code: string
    name: string
    description: string
    isActive: boolean
    sortOrder: number
}

export type RolePermissionRow = CrudFlags & {
    moduleCode: string
    moduleName: string
    description: string
    isActive: boolean
    locked: boolean
}

export type RolePermissionsResponse = {
    role: string
    editable: boolean
    permissions: RolePermissionRow[]
}

export type MyPermissions = {
    role: string
    permissions: Record<string, CrudFlags>
}

/** ErpAxiosBase only attaches X-User-Id on mutations; permission reads are guarded too. */
async function actorHeaders() {
    const session = await getSession()
    return session?.user?.id ? { 'X-User-Id': session.user.id } : {}
}

export async function apiGetMyPermissions() {
    const response = await ErpAxiosBase.get<MyPermissions>('/permissions/me', {
        headers: await actorHeaders(),
    })
    return response.data
}

export async function apiListModules() {
    const response = await ErpAxiosBase.get<ModuleDefinition[]>(
        '/permissions/modules',
        { headers: await actorHeaders() },
    )
    return response.data
}

export async function apiGetRolePermissions(role: string) {
    const response = await ErpAxiosBase.get<RolePermissionsResponse>(
        `/permissions/roles/${role}`,
        { headers: await actorHeaders() },
    )
    return response.data
}

export async function apiUpdateRolePermissions(
    role: string,
    permissions: ({ moduleCode: string } & CrudFlags)[],
) {
    const response = await ErpAxiosBase.put<RolePermissionsResponse>(
        `/permissions/roles/${role}`,
        { permissions },
    )
    return response.data
}
