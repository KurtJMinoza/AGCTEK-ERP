import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { FicoArCreditCheckService } from './fico-ar-credit-check.service'

describe('FicoArCreditCheckService', () => {
    it('skips limit enforcement for NON_CREDIT customers even with AR exposure profile', async () => {
        const prisma = {
            sdCustomer: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'cust-1',
                    customerAccountType: 'NON_CREDIT',
                    creditLimit: new Decimal(0),
                    creditStatus: 'NOT_APPLICABLE',
                    status: 'ACTIVE',
                }),
            },
            ficoCustomerCompanyAccount: {
                findUnique: jest.fn().mockResolvedValue({ postingBlocked: false }),
            },
        }
        const accountsReceivable = {
            recalculateCreditExposure: jest.fn(),
        }
        const service = new FicoArCreditCheckService(
            prisma as never,
            accountsReceivable as never,
        )
        await expect(
            service.assertWithinCreditLimit({
                companyId: 'co-1',
                customerId: 'cust-1',
                additionalExposure: 6900,
                context: 'POS charge sale',
            }),
        ).resolves.toBeUndefined()
        expect(accountsReceivable.recalculateCreditExposure).not.toHaveBeenCalled()
    })

    it('enforces limit for CREDIT customers', async () => {
        const prisma = {
            sdCustomer: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'cust-2',
                    customerAccountType: 'CREDIT',
                    creditLimit: new Decimal(10000),
                    creditStatus: 'APPROVED',
                    status: 'ACTIVE',
                }),
            },
            ficoCustomerCompanyAccount: {
                findUnique: jest.fn().mockResolvedValue({ postingBlocked: false }),
            },
            ficoArCreditProfile: {
                findUnique: jest.fn().mockResolvedValue({
                    creditLimit: new Decimal(10000),
                    creditExposure: new Decimal(5000),
                    availableCredit: new Decimal(5000),
                    creditBlocked: false,
                }),
            },
        }
        const accountsReceivable = {
            recalculateCreditExposure: jest.fn(),
        }
        const service = new FicoArCreditCheckService(
            prisma as never,
            accountsReceivable as never,
        )
        await expect(
            service.assertWithinCreditLimit({
                companyId: 'co-1',
                customerId: 'cust-2',
                additionalExposure: 6000,
                context: 'POS charge sale',
            }),
        ).rejects.toThrow(BadRequestException)
    })
})