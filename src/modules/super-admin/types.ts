export type ManagedUser = {
    id: string
    email: string
    userName: string
    firstName: string
    lastName: string
    jobPosition: string
    role: string
    /** Display name of the role; present on list responses only. */
    roleName?: string
    isActive: boolean
    createdAt: string
    updatedAt: string
    /** Present on list responses only. */
    defaultCompany?: CompanyOption | null
    companyCount?: number
}

export type CompanyOption = {
    id: string
    code: string
    name: string
}

export type UserCompanyMembership = {
    id: string
    companyId: string
    isDefault: boolean
    createdAt: string
    company: CompanyOption
}

export type UserStatusFilter = 'active' | 'inactive'

export type UserListQuery = {
    search?: string
    /** Role code (system or custom). */
    role?: string
    status?: UserStatusFilter
    page?: number
    pageSize?: number
}

export type UserListResponse = {
    data: ManagedUser[]
    total: number
    page: number
    pageSize: number
}

export type CreateUserPayload = {
    email: string
    userName: string
    firstName: string
    lastName: string
    jobPosition?: string
    password: string
    /** Role code from the roles table. */
    role: string
    /** Initial default company; required unless role is super_admin. */
    companyId?: string
}

export type UpdateUserPayload = Partial<
    Omit<CreateUserPayload, 'password' | 'companyId'>
>
