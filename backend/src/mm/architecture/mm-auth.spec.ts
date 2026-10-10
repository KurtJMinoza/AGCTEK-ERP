import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { MmAuthGuard } from '../common/mm-auth.guard'
import { MM_PERMISSION_KEY, type MmRequiredPermission } from '../common/mm-auth.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { PermissionsService } from '../../permissions/permissions.service'
import { USER_ROLES } from '../../auth/auth.constants'

describe('MmAuthGuard', () => {
    const mockPrisma = { user: { findUnique: jest.fn() } }
    const mockPermissions = { assertPermission: jest.fn() }
    let required: MmRequiredPermission | undefined

    function guard() {
        const reflector = new Reflector()
        jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
            key === MM_PERMISSION_KEY ? required : undefined,
        )
        return new MmAuthGuard(
            mockPrisma as unknown as PrismaService,
            reflector,
            mockPermissions as unknown as PermissionsService,
        )
    }

    function ctx(
        headers: Record<string, string>,
        route: { method?: string; url?: string } = {},
    ): ExecutionContext {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ headers, method: route.method, routeOptions: { url: route.url } }),
            }),
            getHandler: () => ({}),
            getClass: () => ({}),
        } as unknown as ExecutionContext
    }

    const activeUser = (role: string = USER_ROLES.ADMIN, roleActive = true) => ({
        id: 'u1',
        userName: 'user',
        role,
        isActive: true,
        roleRef: { isActive: roleActive },
    })

    beforeEach(() => {
        jest.clearAllMocks()
        required = undefined
        mockPermissions.assertPermission.mockResolvedValue(undefined)
    })

    it('returns 401 when X-User-Id is missing', async () => {
        await expect(guard().canActivate(ctx({}))).rejects.toThrow(UnauthorizedException)
    })

    it('returns 401 when user not found', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null)
        await expect(guard().canActivate(ctx({ 'x-user-id': 'missing' }))).rejects.toThrow(UnauthorizedException)
    })

    it('returns 401 when user is deactivated', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser(), isActive: false })
        await expect(guard().canActivate(ctx({ 'x-user-id': 'u1' }))).rejects.toThrow(UnauthorizedException)
    })

    it('returns 403 when the assigned role is inactive', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(activeUser(USER_ROLES.ADMIN, false))
        await expect(guard().canActivate(ctx({ 'x-user-id': 'u1' }))).rejects.toThrow(ForbiddenException)
    })

    it('allows a valid user when no permission is required', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(activeUser())
        await expect(guard().canActivate(ctx({ 'x-user-id': 'u1' }))).resolves.toBe(true)
        expect(mockPermissions.assertPermission).not.toHaveBeenCalled()
    })

    it('checks the explicit resource action', async () => {
        required = { resource: 'mm.procurement', action: 'delete' }
        mockPrisma.user.findUnique.mockResolvedValue(activeUser(USER_ROLES.EMPLOYEE))
        await guard().canActivate(ctx({ 'x-user-id': 'u1' }))
        expect(mockPermissions.assertPermission).toHaveBeenCalledWith(USER_ROLES.EMPLOYEE, 'mm.procurement', 'delete')
    })

    it.each([
        ['POST', '/api/v1/mm/purchase-orders', 'create'],
        ['POST', '/api/v1/mm/purchase-orders/:id/approve', 'update'],
        ['PUT', '/api/v1/mm/purchase-orders/:id', 'update'],
        ['DELETE', '/api/v1/mm/purchase-orders/:id/attachments/:attachmentId', 'delete'],
    ])('infers %s %s as %s', async (method, url, action) => {
        required = { resource: 'mm.procurement' }
        mockPrisma.user.findUnique.mockResolvedValue(activeUser(USER_ROLES.EMPLOYEE))
        await guard().canActivate(ctx({ 'x-user-id': 'u1' }, { method, url }))
        expect(mockPermissions.assertPermission).toHaveBeenCalledWith(USER_ROLES.EMPLOYEE, 'mm.procurement', action)
    })

    it('passes every listed feature through so any of them can allow the action', async () => {
        const resource = ['mm.procurement.purchase-orders', 'mm.procurement.po-approvals']
        required = { resource, action: 'update' }
        mockPrisma.user.findUnique.mockResolvedValue(activeUser(USER_ROLES.EMPLOYEE))
        await guard().canActivate(ctx({ 'x-user-id': 'u1' }))
        expect(mockPermissions.assertPermission).toHaveBeenCalledWith(USER_ROLES.EMPLOYEE, resource, 'update')
    })

    it('propagates a permission denial', async () => {
        required = { resource: 'mm.inventory-management', action: 'update' }
        mockPrisma.user.findUnique.mockResolvedValue(activeUser(USER_ROLES.EMPLOYEE))
        mockPermissions.assertPermission.mockRejectedValue(new ForbiddenException())
        await expect(guard().canActivate(ctx({ 'x-user-id': 'u1' }))).rejects.toThrow(ForbiddenException)
    })
})
