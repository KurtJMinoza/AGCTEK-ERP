import { ForbiddenException } from '@nestjs/common'
import { FicoDeterminationSodPolicy } from './fico-determination-sod.policy'

function setup(separationOfDuties = true) {
    const prisma = {
        ficoCompanyAccountingSettings: {
            findUnique: jest.fn().mockResolvedValue({
                determinationSeparationOfDuties: separationOfDuties,
            }),
        },
    }
    return {
        policy: new FicoDeterminationSodPolicy(prisma as never),
        prisma,
    }
}

const rule = {
    companyId: 'co-1',
    determinationCode: 'MM-001',
    createdBy: 'user-maker',
    submittedBy: 'user-maker',
    approvedBy: null as string | null,
}

describe('FicoDeterminationSodPolicy', () => {
    it('blocks the submitter from approving their own rule', async () => {
        const { policy } = setup()

        await expect(policy.assertCanApprove(rule, 'user-maker')).rejects.toBeInstanceOf(
            ForbiddenException,
        )
    })

    it('allows a different approver', async () => {
        const { policy } = setup()

        await expect(
            policy.assertCanApprove(rule, 'user-checker'),
        ).resolves.toBeUndefined()
    })

    it('blocks the author from approving an unsubmitted draft', async () => {
        const { policy } = setup()

        await expect(
            policy.assertCanApprove(
                { ...rule, submittedBy: null },
                'user-maker',
            ),
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('honours the per-company maker-checker toggle', async () => {
        const { policy } = setup(false)

        await expect(policy.assertCanApprove(rule, 'user-maker')).resolves.toBeUndefined()
    })

    it('blocks activation when the same user submitted and approved', async () => {
        const { policy } = setup()

        await expect(
            policy.assertCanActivate(
                { ...rule, approvedBy: 'user-maker' },
                'user-maker',
            ),
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('allows activation by a third user', async () => {
        const { policy } = setup()

        await expect(
            policy.assertCanActivate(
                { ...rule, approvedBy: 'user-checker' },
                'user-activator',
            ),
        ).resolves.toBeUndefined()
    })

    it('reports a structured determination error code', async () => {
        const { policy } = setup()

        await policy.assertCanApprove(rule, 'user-maker').catch((error) => {
            expect(error.getResponse()).toMatchObject({
                errorCode: 'FICO_RULE_APPROVAL_REQUIRED',
            })
        })
        expect.assertions(1)
    })
})