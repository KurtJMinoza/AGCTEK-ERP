import ErpAxiosBase from './axios/ErpAxiosBase'

export type PermissionAction = 'read' | 'create' | 'update' | 'delete'

/** `canRead` means the submodule is visible and its records can be read. */
export type CrudFlags = {
    canRead: boolean
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
}

export const ACTION_FIELD: Record<PermissionAction, keyof CrudFlags> = {
    read: 'canRead',
    create: 'canCreate',
    update: 'canUpdate',
    delete: 'canDelete',
}

export type RoleSummary = {
    id: string
    code: string
    name: string
    description: string
    isSystem: boolean
    isActive: boolean
    _count: { users: number }
}

export type RoleResourceRow = CrudFlags & {
    code: string
    name: string
    description: string
    isActive: boolean
    /** Features inside this submodule. When present, grants are set per feature and this row's flags are their union. */
    children?: RoleResourceRow[]
}

export type RolePermissionGroup = {
    code: string
    name: string
    isActive: boolean
    resources: RoleResourceRow[]
}

export type RolePermissionsResponse = {
    role: Omit<RoleSummary, 'id' | '_count'> & { userCount: number }
    editable: boolean
    groups: RolePermissionGroup[]
}

/** Effective grants by resource code (`crm.leads`) and by group (`crm`, union of its resources). */
export type MyPermissions = {
    role: string
    resources: Record<string, CrudFlags>
    modules: Record<string, CrudFlags>
}

/** `code` is a resource (`crm.leads`) or a group (`crm`). */
export function hasPermission(
    permissions: MyPermissions | null | undefined,
    code: string,
    action: PermissionAction = 'read',
) {
    const flags = code.includes('.') ? permissions?.resources[code] : permissions?.modules[code]
    return Boolean(flags?.[ACTION_FIELD[action]])
}

export async function apiGetMyPermissions() {
    const response = await ErpAxiosBase.get<MyPermissions>('/permissions/me')
    return response.data
}

export async function apiListRoles() {
    const response = await ErpAxiosBase.get<RoleSummary[]>('/permissions/roles')
    return response.data
}

export type CreateRolePayload = {
    code: string
    name: string
    description?: string
    /** Copies this role's permissions once; the roles stay independent afterwards. */
    copyFrom?: string
    /** Copies this template's permissions once; later template edits do not affect the role. */
    copyFromTemplate?: string
}

export async function apiCreateRole(payload: CreateRolePayload) {
    const response = await ErpAxiosBase.post<RoleSummary>('/permissions/roles', payload)
    return response.data
}

export async function apiUpdateRole(role: string, payload: { name?: string; description?: string }) {
    const response = await ErpAxiosBase.patch<RoleSummary>(`/permissions/roles/${role}`, payload)
    return response.data
}

export async function apiDeleteRole(role: string) {
    await ErpAxiosBase.delete(`/permissions/roles/${role}`)
}

export async function apiGetRolePermissions(role: string) {
    const response = await ErpAxiosBase.get<RolePermissionsResponse>(`/permissions/roles/${role}`)
    return response.data
}

export async function apiUpdateRolePermissions(
    role: string,
    permissions: ({ resourceCode: string } & CrudFlags)[],
) {
    const response = await ErpAxiosBase.put<RolePermissionsResponse>(
        `/permissions/roles/${role}`,
        { permissions },
    )
    return response.data
}

/** Permission blueprint used only to create or configure roles; never assigned to users. */
export type RoleTemplateSummary = {
    id: string
    code: string
    name: string
    description: string
    updatedAt: string
    /** Number of submodules the template grants Read on. */
    _count: { permissions: number }
}

export type RoleTemplateResponse = {
    template: { code: string; name: string; description: string }
    groups: RolePermissionGroup[]
}

export type CreateRoleTemplatePayload = {
    code: string
    name: string
    description?: string
    /** Snapshot of this role's permissions ("Save as template"). */
    fromRole?: string
    fromTemplate?: string
}

export async function apiListRoleTemplates() {
    const response = await ErpAxiosBase.get<RoleTemplateSummary[]>(
        '/permissions/templates',
    )
    return response.data
}

export async function apiCreateRoleTemplate(payload: CreateRoleTemplatePayload) {
    const response = await ErpAxiosBase.post<RoleTemplateSummary>(
        '/permissions/templates',
        payload,
    )
    return response.data
}

export async function apiGetRoleTemplate(template: string) {
    const response = await ErpAxiosBase.get<RoleTemplateResponse>(
        `/permissions/templates/${template}`,
    )
    return response.data
}

export async function apiUpdateRoleTemplate(
    template: string,
    payload: { name?: string; description?: string },
) {
    const response = await ErpAxiosBase.patch<RoleTemplateSummary>(
        `/permissions/templates/${template}`,
        payload,
    )
    return response.data
}

export async function apiUpdateRoleTemplatePermissions(
    template: string,
    permissions: ({ resourceCode: string } & CrudFlags)[],
) {
    const response = await ErpAxiosBase.put<RoleTemplateResponse>(
        `/permissions/templates/${template}`,
        { permissions },
    )
    return response.data
}

export async function apiDeleteRoleTemplate(template: string) {
    await ErpAxiosBase.delete(`/permissions/templates/${template}`)
}
