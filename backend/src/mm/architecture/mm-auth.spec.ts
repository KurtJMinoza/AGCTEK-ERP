import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { MmAuthGuard } from '../common/mm-auth.guard'
import { PrismaService } from '../../prisma/prisma.service'
import { USER_ROLES } from '../../auth/auth.constants'

describe('MmAuthGuard', () => {
    let guard: MmAuthGuard
    const mockPrisma = {
        user: { findUnique: jest.fn() },
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MmAuthGuard,
                Reflector,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()
        guard = module.get(MmAuthGuard)
    })

    function ctx(headers: Record<string, string>): ExecutionContext {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ headers }),
            }),
            getHandler: () => ({}),
            getClass: () => ({}),
        } as ExecutionContext
    }

    it('returns 401 when X-User-Id is missing', async () => {
        await expect(guard.canActivate(ctx({}))).rejects.toThrow(UnauthorizedException)
    })

    it('returns 401 when user not found', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null)
        await expect(
            guard.canActivate(ctx({ 'x-user-id': 'missing' })),
        ).rejects.toThrow(UnauthorizedException)
    })

    it('allows valid user', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
            id: 'u1',
            userName: 'admin',
            role: USER_ROLES.ADMIN,
        })
        const ok = await guard.canActivate(ctx({ 'x-user-id': 'u1' }))
        expect(ok).toBe(true)
    })
})
