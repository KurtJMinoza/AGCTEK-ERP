import { CorrectiveActionService } from './corrective-action.service'
import { NonconformanceService } from './nonconformance.service'
import {
    assertCapaTransition,
    deriveCapaStatus,
    CAPA_TRANSITIONS,
} from './quality.constants'

describe('Phase 1C CAPA lifecycle', () => {
    describe('deriveCapaStatus', () => {
        it('returns OVERDUE when OPEN and past due', () => {
            const past = new Date(Date.now() - 86400000)
            expect(deriveCapaStatus('OPEN', past)).toBe('OVERDUE')
        })

        it('returns OVERDUE when IN_PROGRESS and past due', () => {
            const past = new Date(Date.now() - 86400000)
            expect(deriveCapaStatus('IN_PROGRESS', past)).toBe('OVERDUE')
        })

        it('returns persisted status when not overdue', () => {
            const future = new Date(Date.now() + 86400000)
            expect(deriveCapaStatus('OPEN', future)).toBe('OPEN')
            expect(deriveCapaStatus('IN_PROGRESS', future)).toBe('IN_PROGRESS')
        })

        it('COMPLETED/VERIFIED/CLOSED never show as OVERDUE', () => {
            const past = new Date(Date.now() - 86400000)
            expect(deriveCapaStatus('COMPLETED', past)).toBe('COMPLETED')
            expect(deriveCapaStatus('VERIFIED', past)).toBe('VERIFIED')
            expect(deriveCapaStatus('CLOSED', past)).toBe('CLOSED')
        })

        it('handles null dueDate', () => {
            expect(deriveCapaStatus('OPEN', null)).toBe('OPEN')
            expect(deriveCapaStatus('IN_PROGRESS', undefined)).toBe('IN_PROGRESS')
        })
    })

    describe('assertCapaTransition', () => {
        it('allows valid transitions', () => {
            expect(() => assertCapaTransition('OPEN', 'IN_PROGRESS')).not.toThrow()
            expect(() => assertCapaTransition('IN_PROGRESS', 'COMPLETED')).not.toThrow()
            expect(() => assertCapaTransition('COMPLETED', 'VERIFIED')).not.toThrow()
            expect(() => assertCapaTransition('VERIFIED', 'CLOSED')).not.toThrow()
        })

        it('allows skip-to-close from OPEN and IN_PROGRESS', () => {
            expect(() => assertCapaTransition('OPEN', 'CLOSED')).not.toThrow()
            expect(() => assertCapaTransition('IN_PROGRESS', 'CLOSED')).not.toThrow()
        })

        it('allows re-open from COMPLETED back to IN_PROGRESS', () => {
            expect(() => assertCapaTransition('COMPLETED', 'IN_PROGRESS')).not.toThrow()
        })

        it('rejects invalid transitions', () => {
            expect(() => assertCapaTransition('CLOSED', 'OPEN')).toThrow()
            expect(() => assertCapaTransition('VERIFIED', 'IN_PROGRESS')).toThrow()
            expect(() => assertCapaTransition('OPEN', 'VERIFIED')).toThrow()
            expect(() => assertCapaTransition('OPEN', 'COMPLETED')).toThrow()
        })

        it('CLOSED is terminal', () => {
            for (const target of Object.keys(CAPA_TRANSITIONS)) {
                if (target === 'CLOSED') continue
                expect(() => assertCapaTransition('CLOSED', target)).toThrow()
            }
        })
    })

    describe('CorrectiveActionService', () => {
        const mockNcService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'nc-1',
                companyId: 'co-1',
                status: 'OPEN',
            }),
        } as unknown as NonconformanceService

        function buildMockPrisma(overrides: any = {}) {
            return {
                mmCorrectiveAction: {
                    create: jest.fn().mockImplementation(async ({ data }) => ({
                        id: 'ca-1',
                        ...data,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })),
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'ca-1',
                        status: 'OPEN',
                        dueDate: null,
                        nonconformanceId: 'nc-1',
                        companyId: 'co-1',
                    }),
                    findMany: jest.fn().mockResolvedValue([]),
                    count: jest.fn().mockResolvedValue(0),
                    update: jest.fn().mockImplementation(async ({ data }) => ({
                        id: 'ca-1',
                        status: data.status ?? 'OPEN',
                        dueDate: null,
                        ...data,
                    })),
                    ...overrides,
                },
                mmNonconformance: {
                    update: jest.fn().mockResolvedValue({}),
                },
            }
        }

        it('creates CAPA with all Phase 1C fields', async () => {
            const prisma = buildMockPrisma()
            const svc = new CorrectiveActionService(prisma as any, mockNcService)
            const result = await svc.create('nc-1', {
                problem: 'Dimensional out of spec',
                rootCause: 'Tooling wear',
                containment: 'Segregated lot',
                correctiveAction: 'Replace tooling',
                preventiveAction: 'Scheduled maintenance',
                owner: 'John Doe',
                dueDate: '2026-10-01',
            })
            expect(result.effectiveStatus).toBe('OPEN')
            expect(prisma.mmCorrectiveAction.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    problem: 'Dimensional out of spec',
                    rootCause: 'Tooling wear',
                    containment: 'Segregated lot',
                    correctiveAction: 'Replace tooling',
                    preventiveAction: 'Scheduled maintenance',
                    owner: 'John Doe',
                    status: 'OPEN',
                }),
            })
        })

        it('transitions OPEN → IN_PROGRESS', async () => {
            const prisma = buildMockPrisma()
            const svc = new CorrectiveActionService(prisma as any, mockNcService)
            const result = await svc.transition('ca-1', { targetStatus: 'IN_PROGRESS' })
            expect(prisma.mmCorrectiveAction.update).toHaveBeenCalledWith({
                where: { id: 'ca-1' },
                data: expect.objectContaining({ status: 'IN_PROGRESS' }),
            })
            expect(result.effectiveStatus).toBe('IN_PROGRESS')
        })

        it('transitions COMPLETED → VERIFIED with verifiedBy', async () => {
            const prisma = buildMockPrisma({
                findUnique: jest.fn().mockResolvedValue({
                    id: 'ca-1',
                    status: 'COMPLETED',
                    dueDate: null,
                }),
                update: jest.fn().mockImplementation(async ({ data }) => ({
                    id: 'ca-1',
                    dueDate: null,
                    ...data,
                })),
            })
            const svc = new CorrectiveActionService(prisma as any, mockNcService)
            await svc.transition('ca-1', {
                targetStatus: 'VERIFIED',
                verifiedBy: 'QA Lead',
            })
            expect(prisma.mmCorrectiveAction.update).toHaveBeenCalledWith({
                where: { id: 'ca-1' },
                data: expect.objectContaining({
                    status: 'VERIFIED',
                    verifiedAt: expect.any(Date),
                    verifiedBy: 'QA Lead',
                }),
            })
        })

        it('rejects transition from CLOSED', async () => {
            const prisma = buildMockPrisma({
                findUnique: jest.fn().mockResolvedValue({
                    id: 'ca-1',
                    status: 'CLOSED',
                    dueDate: null,
                }),
            })
            const svc = new CorrectiveActionService(prisma as any, mockNcService)
            await expect(
                svc.transition('ca-1', { targetStatus: 'OPEN' }),
            ).rejects.toThrow('Invalid CAPA status transition')
        })

        it('rejects edit on CLOSED CAPA', async () => {
            const prisma = buildMockPrisma()
            prisma.mmCorrectiveAction.findUnique.mockResolvedValue({
                id: 'ca-1',
                status: 'CLOSED',
                dueDate: null,
                nonconformance: {
                    id: 'nc-1',
                    ncNumber: 'NC-001',
                    status: 'CLOSED',
                    severity: 'HIGH',
                    cause: null,
                    affectedQuantity: 10,
                    inspectionLot: null,
                },
            })
            const svc = new CorrectiveActionService(prisma as any, mockNcService)
            await expect(
                svc.update('ca-1', { problem: 'Updated' }),
            ).rejects.toThrow('Cannot edit a CLOSED CAPA')
        })

        it('sets closedAt/closedBy on CLOSE transition', async () => {
            const prisma = buildMockPrisma({
                findUnique: jest.fn().mockResolvedValue({
                    id: 'ca-1',
                    status: 'VERIFIED',
                    dueDate: null,
                }),
                update: jest.fn().mockImplementation(async ({ data }) => ({
                    id: 'ca-1',
                    dueDate: null,
                    ...data,
                })),
            })
            const svc = new CorrectiveActionService(prisma as any, mockNcService)
            await svc.transition('ca-1', {
                targetStatus: 'CLOSED',
                closedBy: 'QA Manager',
                resolution: 'Issue resolved and verified',
            })
            expect(prisma.mmCorrectiveAction.update).toHaveBeenCalledWith({
                where: { id: 'ca-1' },
                data: expect.objectContaining({
                    status: 'CLOSED',
                    closedAt: expect.any(Date),
                    closedBy: 'QA Manager',
                    resolution: 'Issue resolved and verified',
                }),
            })
        })

        it('derives OVERDUE in list results', async () => {
            const pastDue = new Date(Date.now() - 86400000)
            const prisma = buildMockPrisma({
                findMany: jest.fn().mockResolvedValue([
                    { id: 'ca-1', status: 'OPEN', dueDate: pastDue, nonconformance: {} },
                    { id: 'ca-2', status: 'IN_PROGRESS', dueDate: pastDue, nonconformance: {} },
                    { id: 'ca-3', status: 'COMPLETED', dueDate: pastDue, nonconformance: {} },
                ]),
                count: jest.fn().mockResolvedValue(3),
            })
            const svc = new CorrectiveActionService(prisma as any, mockNcService)
            const result = await svc.list({ companyId: 'co-1' })
            expect(result.data[0].effectiveStatus).toBe('OVERDUE')
            expect(result.data[1].effectiveStatus).toBe('OVERDUE')
            expect(result.data[2].effectiveStatus).toBe('COMPLETED')
        })
    })
})
